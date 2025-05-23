import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import usersRouter from './routes/users.js';
import conversationsRouter from './routes/conversations.js';
import messagesRouter from './routes/messages.js';
import { setupSocketIO } from './socket/socketHandler.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Setup Socket.IO and store the instance
const io = setupSocketIO(httpServer);

// Enable CORS for frontend
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_LIVE_URL,
  'http://localhost:5173'
].filter(Boolean); // Remove undefined

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like Postman or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.use(express.json());

// Make io instance available in request object
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/messages', messagesRouter);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Frontend URL:', process.env.FRONTEND_URL || process.env.FRONTEND_LIVE_URL || 'http://localhost:5173');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}); 