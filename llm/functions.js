export const extractIntent = {
  name: 'extract_intent',
  description: 'Extract the intent of a user message.',
  parameters: {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description: 'The intent of the message',
        enum: [
          // Guest Requests (Need Vendor)
          'MAINTENANCE_REQUEST',        // General maintenance issue
          'SERVICE_REQUEST',           // Request for service (cleaning, supplies)
          'SPECIAL_REQUEST',           // Special accommodations or items
          'EMERGENCY_REQUEST',         // Urgent issues requiring immediate attention
          
          // Guest Requests (Can Handle Directly)
          'GENERAL_QUESTION',          // Questions about amenities, policies, etc.
          'INFORMATION_REQUEST',       // Request for information (wifi, check-in, etc.)
          
          // Vendor Communication
          'VENDOR_AVAILABILITY',       // Vendor providing availability
          'VENDOR_UPDATE',            // Vendor providing status update
          'VENDOR_COMPLETION',        // Vendor reporting completion
          
          // Appointment Management
          'APPOINTMENT_CONFIRMATION',  // Confirming appointment time
          'APPOINTMENT_RESCHEDULE',    // Request to reschedule
          'APPOINTMENT_CANCELLATION',  // Cancelling appointment
          
          // General Communication
          'GREETING',                 // Simple greeting
          'ACKNOWLEDGMENT',           // Simple acknowledgment
          'THANK_YOU',                // Expression of gratitude
          'OTHER',                    // Fallback
        ],
      },
      conversationState: {
        type: 'string',
        description: 'The current state of the conversation',
        enum: [
          'INITIAL_REQUEST',           // First report of an issue/request
          'GATHERING_DETAILS',         // Collecting more information
          'FINDING_VENDOR',            // Identifying appropriate vendor
          'AWAITING_VENDOR_RESPONSE',  // Waiting for vendor availability
          'SCHEDULING_SERVICE',        // Coordinating service time
          'SERVICE_CONFIRMED',         // Service time confirmed
          'SERVICE_IN_PROGRESS',       // Service being performed
          'SERVICE_COMPLETED',         // Service finished
          'FOLLOW_UP_NEEDED',          // Additional action required
          'RESOLVED',                  // Issue resolved
          'OTHER',                     // Other states
        ],
      },
      nextParty: {
        type: 'string',
        description: 'Which party should be contacted next, if any',
        enum: [
          'GUEST',
          'VENDOR',
          'BOTH',
          'NONE',
        ],
      },
      nextStep: {
        type: 'string',
        description: 'A concise sentence describing the next action needed by the property manager',
      },
    },
    required: ['intent', 'conversationState', 'nextParty', 'nextStep'],
  },
};

export const generateBusinessResponses = {
  name: 'generate_business_responses',
  description: 'Generate property manager responses based on intent, conversation state, and next steps.',
  parameters: {
    type: 'object',
    properties: {
      responses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            targetRole: {
              type: 'string',
              enum: ['GUEST', 'VENDOR'],
              description: 'The role of the user who should receive this message',
            },
            reply: {
              type: 'string',
              description: 'Markdown text to send as Property Manager',
            },
            isImmediate: {
              type: 'boolean',
              description: 'Whether this message should be sent immediately or can be sent later',
              default: true,
            },
            needsConfirmation: {
              type: 'boolean',
              description: 'Whether this message requires confirmation before taking further action',
              default: false,
            },
          },
          required: ['targetRole', 'reply'],
        },
      },
      action: {
        type: 'string',
        enum: [
          'REPLY_ONLY',                // Just respond to the sender
          'NOTIFY_OTHER_PARTY',        // Send a message to the other party
          'CONFIRM_WITH_BOTH',         // Send confirmation to both parties
          'WAIT_FOR_RESPONSE',         // No action needed, wait for response
          'EMERGENCY_NOTIFICATION',    // Urgent notification to vendor
        ],
        description: 'The action the property manager should take',
      },
    },
    required: ['responses', 'action'],
  },
};

export const suggestReply = {
  name: 'suggest_reply',
  description: 'Suggest a reply to the user message in markdown.',
  parameters: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: 'A suggested reply in markdown format',
      },
    },
    required: ['reply'],
  },
};

export const generateNaturalResponse = {
  name: 'generate_natural_response',
  description: 'Generate a natural, human-like response for communication between guests and vendors.',
  parameters: {
    type: 'object',
    properties: {
      response: {
        type: 'string',
        description: 'A natural, conversational response that sounds human-written',
      },
      tone: {
        type: 'string',
        enum: ['professional', 'friendly', 'urgent', 'informative'],
        description: 'The tone of the response',
      }
    },
    required: ['response'],
  },
}; 