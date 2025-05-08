import { Router } from 'express';
import supabase from '../db.js';

const router = Router();

// GET /api/messages/:conversationId - get messages for a specific conversation
router.get('/:conversationId', async (req, res) => {
  console.log('GET /api/messages/:conversationId - Request received');
  console.log('Conversation ID:', req.params.conversationId);

  const { conversationId } = req.params;

  if (!conversationId) {
    console.log('Error: conversationId parameter missing');
    return res.status(400).json({ error: 'conversationId is required' });
  }

  // Verify conversation exists
  console.log('Verifying conversation exists...');
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .single();

  if (convError) {
    console.error('Error verifying conversation:', {
      message: convError.message,
      details: convError.details,
      hint: convError.hint,
      code: convError.code
    });
    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (!conversation) {
    console.log('Conversation not found');
    return res.status(404).json({ error: 'Conversation not found' });
  }

  console.log('Conversation verified, fetching messages...');

  // Get messages with sender information
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select(`
      id,
      body,
      createdAt,
      intent,
      nextStep,
      nextParty,
      conversationState,
      responses,
      isAutomated,
      sender:users (
        id,
        name,
        role
      )
    `)
    .eq('conversationId', conversationId)
    .order('createdAt', { ascending: true });

  if (msgError) {
    console.error('Error fetching messages:', {
      message: msgError.message,
      details: msgError.details,
      hint: msgError.hint,
      code: msgError.code
    });
    return res.status(500).json({ error: msgError.message });
  }

  console.log('Messages fetched successfully:', messages);
  res.json(messages);
});

// POST /api/messages - create message
router.post('/', async (req, res) => {
  console.log('POST /api/messages - Request received');
  console.log('Request body:', req.body);

  const { 
    conversationId, 
    senderId, 
    body, 
    intent, 
    suggestedReply 
  } = req.body;

  if (!conversationId || !senderId || !body) {
    console.log('Error: Missing required fields');
    return res.status(400).json({ error: 'conversationId, senderId, and body are required' });
  }

  // Verify conversation exists and sender is a participant
  console.log('Verifying participant...');
  const { data: participant, error: participantError } = await supabase
    .from('participants')
    .select('id')
    .eq('conversationId', conversationId)
    .eq('userId', senderId)
    .single();

  if (participantError) {
    console.error('Error verifying participant:', {
      message: participantError.message,
      details: participantError.details,
      hint: participantError.hint,
      code: participantError.code
    });
    return res.status(403).json({ error: 'Sender is not a participant in this conversation' });
  }

  if (!participant) {
    console.log('Participant not found');
    return res.status(403).json({ error: 'Sender is not a participant in this conversation' });
  }

  console.log('Participant verified, creating message...');

  // Create the message
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert([{ 
      conversationId, 
      senderId, 
      body, 
      intent, 
      suggestedReply 
    }])
    .select(`
      id,
      body,
      createdAt,
      intent,
      suggestedReply,
      sender:users (
        id,
        name,
        role
      )
    `)
    .single();

  if (msgError) {
    console.error('Error creating message:', {
      message: msgError.message,
      details: msgError.details,
      hint: msgError.hint,
      code: msgError.code
    });
    return res.status(500).json({ error: msgError.message });
  }

  console.log('Message created successfully:', message);
  res.status(201).json(message);
});

export default router; 