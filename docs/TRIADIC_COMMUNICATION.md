# Triadic Communication Flow

This document explains how the LLM-powered triadic communication works between Guests, Vendors, and the Business.

## Overview

In this system, the LLM acts as the Business, mediating conversations between Guests and Vendors. The system automatically analyzes messages, determines appropriate responses, and can automatically send messages to both parties.

## Communication Flow

1. **Message Receipt**: When a Guest or Vendor sends a message through the Socket.IO interface, it is stored in the database.

2. **LLM Analysis**: The message is processed by the `runLLMPipeline` function, which:
   - Extracts the intent of the message
   - Determines the conversation state
   - Identifies which party to contact next
   - Generates appropriate responses

3. **Automated Responses**: Based on the LLM's analysis, the system can:
   - Reply immediately to the sender
   - Notify the other party
   - Confirm with both parties

4. **Conversation Tracking**: The system maintains the conversation state throughout the interaction, enabling context-aware responses.

## Conversation States

- `INITIAL_REQUEST`: First report of an issue
- `GATHERING_DETAILS`: Business collecting more information
- `FINDING_VENDOR`: Business needs to contact a vendor
- `AWAITING_VENDOR_RESPONSE`: Waiting for vendor availability
- `SCHEDULING_APPOINTMENT`: Coordinating times
- `APPOINTMENT_CONFIRMED`: Final confirmation
- `RESOLVED`: Issue resolved

## Message Intents

- `MAINTENANCE_REQUEST`: Guest reporting an issue
- `MAINTENANCE_DETAILS`: Guest providing more details
- `VENDOR_AVAILABILITY`: Vendor providing availability
- `APPOINTMENT_CONFIRMATION`: Confirming appointment time
- `APPOINTMENT_RESCHEDULE`: Request to reschedule
- `APPOINTMENT_CANCELLATION`: Cancelling appointment
- `GREETING`: Simple greeting
- `ACKNOWLEDGMENT`: Simple acknowledgment
- `QUESTION`: General question
- `OTHER`: Fallback for unclassified messages

## Example Conversation Flow

### Scenario: Guest reports a broken refrigerator

1. **Guest Message**: "Hi, my refrigerator isn't cooling properly."
   - Intent: `MAINTENANCE_REQUEST`
   - State: `INITIAL_REQUEST`
   - Next Party: `NONE`
   - Action: `REPLY_ONLY`

2. **Business Response**: "I'm sorry to hear about your refrigerator. Could you tell me how long it's been having this issue? Is there any unusual noise or water leakage?"
   - (Automatically sent by LLM)

3. **Guest Reply**: "It started yesterday. No noise, but there's some water on the floor."
   - Intent: `MAINTENANCE_DETAILS`
   - State: `GATHERING_DETAILS`
   - Next Party: `VENDOR`
   - Action: `NOTIFY_OTHER_PARTY`

4. **Business to Vendor**: "A guest is reporting a refrigerator that isn't cooling properly since yesterday with some water leakage. Are you available to check this issue?"
   - (Automatically sent by LLM to Vendor)

5. **Vendor Reply**: "Yes, I can check it tomorrow at 2pm or 5pm."
   - Intent: `VENDOR_AVAILABILITY`
   - State: `SCHEDULING_APPOINTMENT`
   - Next Party: `GUEST`
   - Action: `NOTIFY_OTHER_PARTY`

6. **Business to Guest**: "The maintenance technician is available tomorrow at either 2pm or 5pm. Which time works better for you?"
   - (Automatically sent by LLM to Guest)

7. **Guest Reply**: "2pm works for me."
   - Intent: `APPOINTMENT_CONFIRMATION`
   - State: `APPOINTMENT_CONFIRMED`
   - Next Party: `BOTH`
   - Action: `CONFIRM_WITH_BOTH`

8. **Business to Vendor**: "The guest has confirmed 2pm tomorrow. Please proceed with the refrigerator repair at that time."
   - (Automatically sent by LLM to Vendor)

9. **Business to Guest**: "Great! I've confirmed with the technician. They will arrive tomorrow at 2pm to fix your refrigerator."
   - (Automatically sent by LLM to Guest)

## Technical Implementation

The system uses:
- OpenAI's GPT-4o for message analysis and response generation
- Socket.IO for real-time messaging
- Supabase (PostgreSQL) for data storage

### Key Functions

- `runLLMPipeline`: Processes messages, extracts intent, and generates responses
- `processMsgWithLLM`: Handles the LLM processing in the background
- `sendBusinessResponse`: Sends automated responses from the Business

## Extending the System

To extend the system with new capabilities:
1. Add new intent types to `extractIntent` in `functions.js`
2. Update the conversation states in `functions.js`
3. Enhance the system prompt in `promptTemplates.js`
4. Update the pipeline logic in `pipeline.js` as needed 