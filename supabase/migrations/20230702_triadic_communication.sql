-- Add conversation state to conversations table
ALTER TABLE "conversations" 
ADD COLUMN IF NOT EXISTS "conversationState" text;

-- Add fields to messages table
ALTER TABLE "messages" 
ADD COLUMN IF NOT EXISTS "conversationState" text,
ADD COLUMN IF NOT EXISTS "nextParty" text,
ADD COLUMN IF NOT EXISTS "isAutomated" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "responses" jsonb;

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON "messages" ("conversationId");
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON "messages" ("senderId"); 