import { Router } from 'express';
import supabase from '../db.js';

const router = Router();

// GET /api/conversations - list conversations filtered by role
router.get('/', async (req, res) => {
  const { role } = req.query;
  
  if (!role) {
    return res.status(400).json({ error: 'role query parameter is required' });
  }

  try {
    // First get all conversations where the user with the specified role is a participant
    const { data: conversations, error: convError } = await supabase
      .from('participants')
      .select(`
        conversationId,
        conversations (
          id,
          unitId,
          createdAt,
          messages!messages_conversationId_fkey (
            id,
            body,
            createdAt,
            sender:users (
              id,
              name,
              role
            )
          )
        ),
        users!inner (
          id,
          role
        )
      `)
      .eq('users.role', role)
      .order('createdAt', { foreignTable: 'conversations', ascending: false });

    if (convError) {
      console.error('Error fetching conversations:', convError);
      return res.status(500).json({ error: 'Failed to fetch conversations' });
    }

    // For each conversation, get the other participant's information and latest message
    const formattedConversations = await Promise.all(conversations.map(async (conv) => {
      // Get the other participant's information
      const { data: otherParticipants, error: otherError } = await supabase
        .from('participants')
        .select(`
          users!inner (
            id,
            name,
            role
          )
        `)
        .eq('conversationId', conv.conversationId)
        .not('users.role', 'eq', role);

      if (otherError) {
        console.error('Error fetching other participant:', otherError);
        return {
          id: conv.conversations.id,
          unitId: conv.conversations.unitId,
          createdAt: conv.conversations.createdAt,
          recipient: null,
          lastMessage: null
        };
      }

      const recipient = otherParticipants[0]?.users;

      // Get the latest message for this conversation
      const { data: latestMessage, error: msgError } = await supabase
        .from('messages')
        .select(`
          id,
          body,
          createdAt,
          sender:users (
            id,
            name,
            role
          )
        `)
        .eq('conversationId', conv.conversationId)
        .order('createdAt', { ascending: false })
        .limit(1)
        .single();

      if (msgError && msgError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error('Error fetching latest message:', msgError);
      }

      return {
        id: conv.conversations.id,
        unitId: conv.conversations.unitId,
        createdAt: conv.conversations.createdAt,
        recipient: recipient ? {
          id: recipient.id,
          name: recipient.name,
          role: recipient.role
        } : null,
        lastMessage: latestMessage ? {
          id: latestMessage.id,
          body: latestMessage.body,
          createdAt: latestMessage.createdAt,
          sender: latestMessage.sender
        } : null
      };
    }));

    res.json(formattedConversations);
  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/conversations - create conversation
router.post('/', async (req, res) => {
  const { unitId, participants } = req.body;
  
  if (!unitId || !participants || !Array.isArray(participants) || participants.length !== 2) {
    return res.status(400).json({ 
      error: 'unitId and exactly two participants are required' 
    });
  }

  try {
    // Start a transaction to create conversation and add participants
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert([{ unitId }])
      .select()
      .single();

    if (convError) {
      console.error('Error creating conversation:', convError);
      return res.status(500).json({ error: 'Failed to create conversation' });
    }

    // Add participants
    const participantRecords = participants.map(userId => ({
      conversationId: conversation.id,
      userId
    }));

    const { error: participantError } = await supabase
      .from('participants')
      .insert(participantRecords);

    if (participantError) {
      console.error('Error adding participants:', participantError);
      // If adding participants fails, delete the conversation
      await supabase
        .from('conversations')
        .delete()
        .eq('id', conversation.id);
      return res.status(500).json({ error: 'Failed to add participants' });
    }

    res.status(201).json(conversation);
  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 