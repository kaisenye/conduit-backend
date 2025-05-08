# LLM Service

This directory contains the LLM integration for the backend, using OpenAI and Supabase. All code and API payloads use camelCase.

## Files

- `openaiClient.js`: Singleton OpenAI client, initialized from `OPENAI_API_KEY`.
- `functions.js`: JSON-schema function definitions for OpenAI function calling (`extract_intent`, `generate_business_responses`).
- `promptTemplates.js`: Exports `systemPrompt({ unitId, businessName, senderRole })` and `userPrompt(body)` for prompt construction.
- `pipeline.js`: Exports `runLLMPipeline(body, senderId, conversationId)`, which:
  - Looks up the sender's role (CUSTOMER or VENDOR),
  - Fetches the last 6 messages for context,
  - Gets unit metadata from `conversations.unitId`,
  - Calls OpenAI with a system prompt explaining the Business's role as a middleman,
  - Uses function calling to extract intent and generate business responses.

## Usage

Import and call `runLLMPipeline(body, senderId, conversationId)` to process a new message and get intent and suggested replies. All database and API fields use camelCase. 