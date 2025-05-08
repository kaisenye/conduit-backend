-- Create enum for user roles
CREATE TYPE "userRole" AS ENUM ('BUSINESS', 'VENDOR', 'GUEST');

-- Create users table
CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "role" "userRole" NOT NULL,
  "vendorRole" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- Create conversations table
CREATE TABLE "conversations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "unitId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- Create participants table to manage conversation participants
CREATE TABLE "participants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversationId" UUID REFERENCES "conversations"("id") ON DELETE CASCADE,
  "userId" UUID REFERENCES "users"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  UNIQUE ("conversationId", "userId")
);

-- Create messages table
CREATE TABLE "messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversationId" UUID REFERENCES "conversations"("id") ON DELETE CASCADE,
  "senderId" UUID REFERENCES "users"("id"),
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "intent" TEXT,
  "nextStep" TEXT,
  "nextParty" TEXT,
  "conversationState" TEXT,
  "responses" JSONB,
  "isAutomated" BOOLEAN DEFAULT FALSE
); 