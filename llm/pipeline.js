import openai from './openaiClient.js';
import { extractIntent, generateBusinessResponses, generateNaturalResponse } from './functions.js';
import { systemPrompt, userPrompt } from './promptTemplates.js';
import supabase from '../db.js';

export async function runLLMPipeline(body, senderId, conversationId) {
  // Look up sender's role
  const { data: sender, error: senderError } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', senderId)
    .single();

  if (senderError || !sender) {
    console.error('Error fetching sender:', senderError);
    return { intent: 'OTHER', conversationState: 'OTHER', nextParty: 'NONE', responses: null, action: 'WAIT_FOR_RESPONSE' };
  }

  const senderRole = sender.role;
  const senderName = sender.name;

  // Fetch last 8 messages for the conversation to provide more context
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select(`
      id, 
      senderId, 
      body, 
      createdAt,
      intent,
      sender:users (
        id,
        name,
        role
      )
    `)
    .eq('conversationId', conversationId)
    .order('createdAt', { ascending: false })
    .limit(8);

  if (messagesError) {
    console.error('Error fetching messages:', messagesError);
    return { intent: 'OTHER', conversationState: 'OTHER', nextParty: 'NONE', responses: null, action: 'WAIT_FOR_RESPONSE' };
  }

  // Get other participants in the conversation
  const { data: participants, error: participantsError } = await supabase
    .from('messages')
    .select('sender:users (id, name, role)')
    .eq('conversationId', conversationId)
    .not('senderId', 'is', null)
    .order('createdAt', { ascending: false });

  const otherParticipants = participantsError ? [] : 
    participants
      .filter(p => p.sender && p.sender.id !== senderId)
      .map(p => p.sender)
      .filter((p, i, self) => 
        i === self.findIndex(t => t.id === p.id)
      );

  // Fetch conversation to get unitId
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('unitId, conversationState')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    console.error('Error fetching conversation:', convError);
    return { intent: 'OTHER', conversationState: 'OTHER', nextParty: 'NONE', responses: null, action: 'WAIT_FOR_RESPONSE' };
  }

  let currentState = conversation.conversationState || 'INITIAL_REQUEST';

  // Fetch businessName for the unit (optional, fallback to unitId)
  let businessName = conversation.unitId;
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('businessName')
    .eq('id', conversation.unitId)
    .single();
  if (!unitError && unit && unit.businessName) {
    businessName = unit.businessName;
  }

  // Build OpenAI messages array with enhanced context
  const system = { 
    role: 'system', 
    content: systemPrompt({ 
      unitId: conversation.unitId, 
      businessName, 
      senderRole 
    }) 
  };

  // Enhanced message context
  const chatMessages = (messages || [])
    .reverse()
    .map(msg => {
      const role = msg.senderId ? 'user' : 'assistant';
      const name = msg.sender?.name || 'Business';
      const userRole = msg.sender?.role || 'BUSINESS';
      
      return { 
        role, 
        content: `${userRole} (${name}): ${msg.body}` ,
        name: userRole
      };
    });

  // Add current message
  chatMessages.push({ 
    role: 'user', 
    content: `${senderRole} (${senderName}): ${body}`,
    name: senderRole
  });

  // Add conversation state and participants info
  const contextMessage = {
    role: 'system',
    content: `Current conversation state: ${currentState}. 
    Other participants: ${otherParticipants.map(p => `${p.role} (${p.name})`).join(', ') || 'None yet'}.`
  };

  // Call OpenAI to analyze intent first
  try {
    const intentResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [system, contextMessage, ...chatMessages],
      functions: [extractIntent],
      function_call: { name: 'extract_intent' },
    });

    let intent = 'OTHER';
    let conversationState = currentState;
    let nextParty = 'NONE';
    let nextStep = 'No immediate action required';

    if (intentResponse.choices && 
        intentResponse.choices[0].message && 
        intentResponse.choices[0].message.function_call) {
      const { arguments: args } = intentResponse.choices[0].message.function_call;
      const parsed = JSON.parse(args);
      intent = parsed.intent || 'OTHER';
      conversationState = parsed.conversationState || currentState;
      nextParty = parsed.nextParty || 'NONE';
      nextStep = parsed.nextStep || 'No immediate action required';
    }

    // Update conversation state in database
    await supabase
      .from('conversations')
      .update({ conversationState })
      .eq('id', conversationId);

    // Now generate appropriate business responses
    const responseMessage = {
      role: 'system',
      content: `Based on analysis, this message has intent: ${intent}, conversation state: ${conversationState}, next party to contact: ${nextParty}, and next step: ${nextStep}.`
    };

    const responseResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7, // Higher creativity for responses
      messages: [system, contextMessage, ...chatMessages, responseMessage],
      functions: [generateBusinessResponses],
      function_call: { name: 'generate_business_responses' },
    });

    let responses = [];
    let action = 'WAIT_FOR_RESPONSE';

    if (responseResponse.choices && 
        responseResponse.choices[0].message && 
        responseResponse.choices[0].message.function_call) {
      const { arguments: args } = responseResponse.choices[0].message.function_call;
      const parsed = JSON.parse(args);
      responses = parsed.responses || [];
      action = parsed.action || 'WAIT_FOR_RESPONSE';
    }

    return { 
      intent, 
      conversationState, 
      nextParty,
      nextStep,
      responses, 
      action 
    };
  } catch (err) {
    console.error('OpenAI error:', err);
    return { 
      intent: 'OTHER', 
      conversationState: currentState, 
      nextParty: 'NONE',
      nextStep: 'No immediate action required',
      responses: null, 
      action: 'WAIT_FOR_RESPONSE' 
    };
  }
}

export async function generateNaturalResponseText(messageContent, context, targetRole, messageType) {
  try {
    // Create system prompt for natural response generation
    const system = {
      role: 'system',
      content: `You are a helpful property management assistant. Generate a natural, conversational response to relay information between guests and service providers. 
      The response should sound human-written, not automated.
      For message type "${messageType}", create a response that is appropriate for a "${targetRole}" recipient.
      Keep the tone professional but warm, and make sure all the important information is conveyed clearly.`
    };

    // Create message with context
    const message = {
      role: 'user',
      content: `Original message: "${messageContent}"
      
      Context: ${context}
      
      Generate a natural-sounding response to relay this information to the ${targetRole}.`
    };

    // Call OpenAI to generate a natural response
    const naturalResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7, // Higher creativity for human-like responses
      messages: [system, message],
      functions: [generateNaturalResponse],
      function_call: { name: 'generate_natural_response' },
    });

    // Extract the generated response
    if (naturalResponse.choices && 
        naturalResponse.choices[0].message && 
        naturalResponse.choices[0].message.function_call) {
      const { arguments: args } = naturalResponse.choices[0].message.function_call;
      const parsed = JSON.parse(args);
      return parsed.response;
    }

    // Fallback response if function call fails
    return messageContent;
  } catch (err) {
    console.error('Error generating natural response:', err);
    // Return original message if there's an error
    return messageContent;
  }
} 