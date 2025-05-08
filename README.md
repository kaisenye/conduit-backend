# Conduit Backend - Triadic Communication System

This backend implements a triadic communication system between Guests, Vendors, and an automated Business representative (LLM).

## Components

- **Socket.IO**: Handles real-time messaging
- **LLM Pipeline**: Processes messages to extract intent and generate responses
- **Supabase**: Stores conversations, messages, and user data

## Triadic Communication Flow

The LLM serves as the Business role in conversations, mediating between Guests and Vendors:

1. A Guest or Vendor sends a message
2. The LLM analyzes the message to extract intent, determine conversation state, and identify which party to contact next
3. The LLM generates appropriate responses:
   - To the original sender
   - To the other party (if necessary)
4. The system automatically sends messages on behalf of the Business

### Example Workflow:

1. Guest reports a broken appliance
2. LLM (Business) asks clarifying questions
3. LLM determines the issue and contacts a suitable Vendor
4. Vendor responds with availability
5. LLM confirms with Guest if the proposed time works
6. Guest confirms
7. LLM informs Vendor of the confirmed appointment
8. LLM confirms the final details with Guest

## Database Schema

Key tables:
- `users`: Information about users (role can be BUSINESS, VENDOR, GUEST)
- `conversations`: Groups messages together, includes conversationState
- `messages`: Individual messages, includes metadata from LLM processing

## Environment Setup

```
npm install
node scripts/run-migrations.js
npm start
```

## Required Environment Variables

- `OPENAI_API_KEY`: API key for OpenAI
- `SUPABASE_URL`: URL for Supabase instance
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `FRONTEND_URL`: URL for the frontend (CORS)

## Features
- Express 5 (ESM)
- Supabase Postgres (camelCase columns)
- Modular routes: users, conversations, messages

## Setup

1. **Clone the repo and cd into backend:**
   ```sh
   cd backend
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your Supabase project details.

4. **Run the server:**
   ```sh
   npm run dev
   ```

## API Endpoints

- `GET /api/users` — List users
- `POST /api/users` — Create user
- `GET /api/conversations` — List conversations
- `POST /api/conversations` — Create conversation
- `GET /api/messages?conversationId=...` — List messages (optionally filter by conversation)
- `POST /api/messages` — Create message

## Notes
- All payloads and DB columns use camelCase.
- Supabase client uses the service-role key (no auth).
- See `db.js` for Supabase client setup. 