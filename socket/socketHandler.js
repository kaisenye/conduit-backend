import { Server } from 'socket.io';
import supabase from '../db.js';
import { runLLMPipeline, generateNaturalResponseText } from '../llm/pipeline.js';

export function setupSocketIO(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    },
    // Add ping timeout and interval
    pingTimeout: 60000,
    pingInterval: 25000,
    // Add connection timeout
    connectTimeout: 45000,
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join a conversation room
    socket.on('join_conversation', (conversationId) => {
      socket.join(`conversation_${conversationId}`);
      console.log(`Socket ${socket.id} joined conversation ${conversationId}`);
    });

    // Leave a conversation room
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation_${conversationId}`);
      console.log(`Socket ${socket.id} left conversation ${conversationId}`);
    });

    // Handle new messages
    socket.on('send_message', async (data, callback) => {
      const { conversationId, senderId, senderRole, body } = data;
      
      try {
        console.log('Received message:', data);
        
        // Create message in database
        const { data: message, error: msgError } = await supabase
          .from('messages')
          .insert([{ 
            conversationId, 
            senderId, 
            body
          }])
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
          .single();

        if (msgError) {
          console.error('Error creating message:', msgError);
          if (callback) {
            callback({ error: 'Failed to create message in database' });
          }
          return;
        }

        // Ensure the sender is a participant in the conversation
        // This is necessary for first-time senders
        const { error: participantError } = await supabase
          .from('participants')
          .upsert([{
            conversationId,
            userId: senderId
          }], { 
            onConflict: 'conversationId, userId',
            ignoreDuplicates: true 
          });

        if (participantError) {
          console.error('Error ensuring participant:', participantError);
        }

        // Broadcast message to all clients in the conversation
        io.to(`conversation_${conversationId}`).emit('new_message', message);
        
        // IMPORTANT: Acknowledge message receipt BEFORE running the LLM pipeline
        // This prevents the timeout issue on the frontend
        if (callback) {
          console.log('Acknowledging message receipt to client');
          callback({ success: true, message });
        }

        // Process with LLM pipeline in the background
        if (senderRole && (senderRole === 'GUEST' || senderRole === 'VENDOR')) {
          console.log('Starting LLM pipeline processing');
          
          // Run LLM pipeline asynchronously (don't await)
          processMsgWithLLM(conversationId, message.id, body, senderId, io, senderRole)
            .catch(err => console.error('Background LLM processing error:', err));
        }
      } catch (error) {
        console.error('Error handling message:', error);
        if (callback) {
          callback({ error: 'Failed to process message' });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  return io;
}

// Separate function to process message with LLM in the background
async function processMsgWithLLM(conversationId, messageId, body, senderId, io, senderRole) {
  try {
    console.log(`Processing message ${messageId} with LLM`);
    const { intent, conversationState, nextParty, nextStep, responses, action } = await runLLMPipeline(body, senderId, conversationId);
    
    // Log important information for debugging
    console.log(`Sender role: ${senderRole}, nextParty: ${nextParty}, action: ${action}`);
    
    // Update message with intent and metadata
    const { data: updatedMessage, error: updateError } = await supabase
      .from('messages')
      .update({ 
        intent,
        conversationState,
        nextParty,
        nextStep
      })
      .eq('id', messageId)
      .select(`
        id,
        body,
        createdAt,
        intent,
        conversationState,
        nextParty,
        nextStep,
        sender:users (
          id,
          name,
          role
        )
      `)
      .single();

    if (updateError) {
      console.error('Error updating message with LLM results:', updateError);
      return;
    }

    if (updatedMessage) {
      console.log(`Emitting message_updated for message ${messageId}`);
      io.to(`conversation_${conversationId}`).emit('message_updated', updatedMessage);
    }

    // Get business user for automated responses
    const { data: businessUser, error: businessError } = await supabase
      .from('users')
      .select('id, name')
      .eq('role', 'BUSINESS')
      .limit(1)
      .single();

    if (businessError || !businessUser) {
      console.error('Could not find a business user to send automated responses');
      return;
    }

    // Get all participants in the conversation
    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select(`
        userId,
        user:users (
          id,
          name,
          role
        )
      `)
      .eq('conversationId', conversationId);

    if (participantsError) {
      console.error('Error finding conversation participants:', participantsError);
      return;
    }

    // Filter unique participants by role
    const uniqueParticipants = participants
      .filter(p => p.user)
      .reduce((acc, curr) => {
        const role = curr.user.role;
        acc[role] = acc[role] || [];
        if (!acc[role].some(u => u.id === curr.user.id)) {
          acc[role].push(curr.user);
        }
        return acc;
      }, {});

    console.log('Unique participants by role:', Object.keys(uniqueParticipants));

    // If there are responses that should be sent automatically
    if (responses && responses.length > 0 && action !== 'WAIT_FOR_RESPONSE') {
      // Send automated responses based on the action type
      for (const response of responses) {
        // Skip responses that are not immediate
        if (response.isImmediate === false) {
          continue;
        }

        const targetUsers = uniqueParticipants[response.targetRole] || [];
        console.log(`Target role: ${response.targetRole}, found ${targetUsers.length} users`);
        
        // For immediate business responses to the current sender
        if (action === 'REPLY_ONLY' && targetUsers.length > 0) {
          if (targetUsers.some(user => user.id === senderId)) {
            await sendBusinessResponse(io, conversationId, businessUser.id, response.reply);
            break; // Only send the first relevant response
          }
        }
        
        // For notifications to the other party
        else if (action === 'NOTIFY_OTHER_PARTY' || action === 'CONFIRM_WITH_BOTH' || action === 'EMERGENCY_NOTIFICATION') {
          // Only send if we have targets for this response
          if (targetUsers.length > 0) {
            await sendBusinessResponse(io, conversationId, businessUser.id, response.reply);
            
            // If this is just notify, break after first notification
            if (action === 'NOTIFY_OTHER_PARTY') {
              break;
            }
          }
        }
      }
    }

    // GUEST -> VENDOR communication
    // Always check if we need to notify vendor when guest sends a message
    if (nextParty === 'VENDOR' && senderRole === 'GUEST') {
      console.log('Next party is VENDOR, need to create/find vendor conversation');

      // Generate natural response to guest
      const guestContext = `Guest asked: "${body}". Let them know you'll contact the service provider.`;
      const guestResponseMessage = await generateNaturalResponseText(
        body, 
        guestContext, 
        'GUEST', 
        'ACKNOWLEDGMENT'
      );
      
      console.log('Sending response to guest:', guestResponseMessage);
      
      // Store and send the guest response
      await sendBusinessResponse(io, conversationId, businessUser.id, guestResponseMessage);

      // Now handle vendor communication in a separate conversation
      
      // Get the vendor user
      const { data: vendorUser, error: vendorError } = await supabase
        .from('users')
        .select('id, name')
        .eq('role', 'VENDOR')
        .single();

      if (vendorError || !vendorUser) {
        console.error('Could not find vendor user:', vendorError);
        return;
      }

      // Get the unit ID for this conversation
      const { data: currentConversation, error: convError } = await supabase
        .from('conversations')
        .select('unitId')
        .eq('id', conversationId)
        .single();

      if (convError || !currentConversation) {
        console.error('Could not find conversation details:', convError);
        return;
      }

      // Find or create a conversation between business and vendor for this unit
      let vendorConversationId;
      
      // Check if a business-vendor conversation already exists for this unit
      const { data: existingConversations, error: existingError } = await supabase
        .from('conversations')
        .select('id')
        .eq('unitId', currentConversation.unitId);

      if (existingError) {
        console.error('Error checking for existing vendor conversations:', existingError);
        return;
      }

      if (existingConversations && existingConversations.length > 0) {
        // For each conversation, check if vendor is a participant
        let vendorConversationFound = false;
        
        for (const conv of existingConversations) {
          const { data: vendorParticipant, error: partError } = await supabase
            .from('participants')
            .select('*')
            .eq('conversationId', conv.id)
            .eq('userId', vendorUser.id)
            .single();
            
          if (!partError && vendorParticipant) {
            // Found a conversation where vendor is a participant
            vendorConversationId = conv.id;
            vendorConversationFound = true;
            console.log(`Found existing vendor conversation: ${vendorConversationId}`);
            break;
          }
        }
        
        if (!vendorConversationFound) {
          // Create a new conversation for vendor
          const { data: newConversation, error: createError } = await supabase
            .from('conversations')
            .insert([{
              unitId: currentConversation.unitId
            }])
            .select('id')
            .single();
            
          if (createError || !newConversation) {
            console.error('Error creating vendor conversation:', createError);
            return;
          }
          
          vendorConversationId = newConversation.id;
          console.log(`Created new vendor conversation: ${vendorConversationId}`);
          
          // Add business and vendor as participants
          const { error: addParticipantsError } = await supabase
            .from('participants')
            .insert([
              {
                conversationId: vendorConversationId,
                userId: businessUser.id
              },
              {
                conversationId: vendorConversationId,
                userId: vendorUser.id
              }
            ]);
            
          if (addParticipantsError) {
            console.error('Error adding participants to vendor conversation:', addParticipantsError);
            return;
          }
        }
      } else {
        // No conversations for this unit, create one
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert([{
            unitId: currentConversation.unitId
          }])
          .select('id')
          .single();
          
        if (createError || !newConversation) {
          console.error('Error creating vendor conversation:', createError);
          return;
        }
        
        vendorConversationId = newConversation.id;
        console.log(`Created new vendor conversation: ${vendorConversationId}`);
        
        // Add business and vendor as participants
        const { error: addParticipantsError } = await supabase
          .from('participants')
          .insert([
            {
              conversationId: vendorConversationId,
              userId: businessUser.id
            },
            {
              conversationId: vendorConversationId,
              userId: vendorUser.id
            }
          ]);
          
        if (addParticipantsError) {
          console.error('Error adding participants to vendor conversation:', addParticipantsError);
          return;
        }
      }

      // Generate natural vendor notification
      const vendorContext = `Guest request: "${body}". Ask the service provider about their availability.`;
      const vendorMessage = await generateNaturalResponseText(
        body, 
        vendorContext, 
        'VENDOR', 
        'SERVICE_REQUEST'
      );
      
      console.log(`Creating vendor notification in conversation ${vendorConversationId}`);

      // Store the vendor notification in the vendor conversation
      const { data: storedMessage, error: storeError } = await supabase
        .from('messages')
        .insert([{
          conversationId: vendorConversationId,
          senderId: businessUser.id,
          body: vendorMessage,
          isAutomated: true,
          intent: 'VENDOR_NOTIFICATION',
          nextStep: 'Awaiting vendor response for guest request'
        }])
        .select(`
          id,
          body,
          createdAt,
          isAutomated,
          intent,
          nextStep,
          sender:users (
            id,
            name,
            role
          )
        `)
        .single();

      if (storeError) {
        console.error('Error storing vendor notification:', storeError);
        return;
      }

      // Emit to the vendor conversation room
      console.log(`Emitting vendor notification to conversation_${vendorConversationId}`);
      io.to(`conversation_${vendorConversationId}`).emit('new_message', storedMessage);
    }
    
    // VENDOR -> GUEST communication
    // Check if we need to notify guest when vendor sends a message
    if (nextParty === 'GUEST' && senderRole === 'VENDOR') {
      console.log('Next party is GUEST, need to find guest conversation');

      // Generate natural response to vendor
      const vendorContext = `Service provider said: "${body}". Let them know you'll pass this to the guest.`;
      const vendorResponseMessage = await generateNaturalResponseText(
        body, 
        vendorContext, 
        'VENDOR', 
        'ACKNOWLEDGMENT'
      );
      
      console.log('Sending response to vendor:', vendorResponseMessage);
      
      // Store and send the vendor response
      await sendBusinessResponse(io, conversationId, businessUser.id, vendorResponseMessage);

      // Now handle guest communication in the guest's conversation
      
      // Get the unit ID for this conversation
      const { data: currentConversation, error: convError } = await supabase
        .from('conversations')
        .select('unitId')
        .eq('id', conversationId)
        .single();

      if (convError || !currentConversation) {
        console.error('Could not find conversation details:', convError);
        return;
      }

      // Find the guest conversation for this unit
      const { data: existingConversations, error: existingError } = await supabase
        .from('conversations')
        .select('id')
        .eq('unitId', currentConversation.unitId);

      if (existingError) {
        console.error('Error checking for existing guest conversations:', existingError);
        return;
      }

      // Find a conversation with a guest participant
      let guestConversationId;
      let guestUser;
      
      if (existingConversations && existingConversations.length > 0) {
        for (const conv of existingConversations) {
          // Skip the current (vendor) conversation
          if (conv.id === conversationId) {
            continue;
          }
          
          // Look for a conversation with a guest participant
          const { data: participants, error: partError } = await supabase
            .from('participants')
            .select(`
              userId,
              user:users (
                id,
                name,
                role
              )
            `)
            .eq('conversationId', conv.id);
            
          if (partError) {
            console.error(`Error checking participants for conversation ${conv.id}:`, partError);
            continue;
          }
          
          // Check if any participant is a guest
          const guestParticipant = participants.find(p => p.user && p.user.role === 'GUEST');
          
          if (guestParticipant) {
            guestConversationId = conv.id;
            guestUser = guestParticipant.user;
            console.log(`Found guest conversation: ${guestConversationId} with guest ${guestUser.id}`);
            break;
          }
        }
      }

      if (!guestConversationId) {
        console.error('Could not find a conversation with a guest participant');
        return;
      }

      // Generate natural guest notification
      const guestContext = `Service provider update: "${body}". Relay this to the guest.`;
      const guestMessage = await generateNaturalResponseText(
        body, 
        guestContext, 
        'GUEST', 
        'SERVICE_UPDATE'
      );
      
      console.log(`Creating guest notification in conversation ${guestConversationId}`);

      // Store the guest notification in the guest conversation
      const { data: storedMessage, error: storeError } = await supabase
        .from('messages')
        .insert([{
          conversationId: guestConversationId,
          senderId: businessUser.id,
          body: guestMessage,
          isAutomated: true,
          intent: 'GUEST_NOTIFICATION',
          nextStep: 'Awaiting guest response to vendor update'
        }])
        .select(`
          id,
          body,
          createdAt,
          isAutomated,
          intent,
          nextStep,
          sender:users (
            id,
            name,
            role
          )
        `)
        .single();

      if (storeError) {
        console.error('Error storing guest notification:', storeError);
        return;
      }

      // Emit to the guest conversation room
      console.log(`Emitting guest notification to conversation_${guestConversationId}`);
      io.to(`conversation_${guestConversationId}`).emit('new_message', storedMessage);
    }
    
    // Handle BOTH case - notify both parties
    if (nextParty === 'BOTH') {
      console.log('Next party is BOTH, notifying all participants in this conversation');
      
      // Generate natural notification for both parties
      const bothContext = `Important update: "${body}". Need to notify everyone.`;
      const notificationMessage = await generateNaturalResponseText(
        body, 
        bothContext, 
        'BOTH', 
        'GENERAL_NOTIFICATION'
      );
      
      // Store the notification in THIS specific conversation
      const { data: storedMessage, error: storeError } = await supabase
        .from('messages')
        .insert([{
          conversationId,
          senderId: businessUser.id,
          body: notificationMessage,
          isAutomated: true,
          intent: 'GENERAL_NOTIFICATION',
          nextStep: 'Awaiting responses from all parties'
        }])
        .select(`
          id,
          body,
          createdAt,
          isAutomated,
          intent,
          nextStep,
          sender:users (
            id,
            name,
            role
          )
        `)
        .single();

      if (storeError) {
        console.error('Error storing general notification:', storeError);
        return;
      }

      // Emit only to THIS conversation room
      console.log(`Emitting general notification to conversation_${conversationId}`);
      io.to(`conversation_${conversationId}`).emit('new_message', storedMessage);
    }
  } catch (error) {
    console.error('Error in background LLM processing:', error);
  }
}

// Function to send a business-generated response
async function sendBusinessResponse(io, conversationId, businessId, messageBody) {
  try {
    // Create the business message in the database
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert([{ 
        conversationId, 
        senderId: businessId, 
        body: messageBody,
        isAutomated: true
      }])
      .select(`
        id,
        body,
        createdAt,
        isAutomated,
        sender:users (
          id,
          name,
          role
        )
      `)
      .single();

    if (msgError) {
      console.error('Error creating automated business message:', msgError);
      return;
    }

    // Broadcast the business message to all clients in the conversation
    io.to(`conversation_${conversationId}`).emit('new_message', message);
    console.log(`Sent automated business response in conversation ${conversationId}`);
    
    return message;
  } catch (error) {
    console.error('Error sending automated business response:', error);
    return null;
  }
} 