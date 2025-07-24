require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('socketio-jwt');

const ChatMessage = require('./models/chatMessageModel');

const app = express();
const server = http.createServer(app);

// --- THIS IS THE FIX ---
// We are now explicitly telling the Express app and Socket.IO
// to trust your live frontend URL.
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

// Apply CORS to all Express API routes (like /messages/:id)
app.use(cors(corsOptions));

const io = new Server(server, {
  cors: corsOptions, // Apply the same CORS options to Socket.IO
});

// --- Connect to MongoDB ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected for Chat Server...'))
  .catch(err => console.error(err));

// --- API Route to get message history ---
app.get('/messages/:campaignId', async (req, res) => {
  try {
    const messages = await ChatMessage.find({ campaign: req.params.campaignId })
      .sort({ createdAt: 'desc' })
      .limit(50)
      .populate('author', 'username avatar');

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// --- Socket.IO Authentication Middleware ---
io.use(jwt.authorize({
  secret: process.env.JWT_SECRET,
  handshake: true
}));

// --- Main Socket.IO Connection Logic ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.decoded_token.user.username);

  socket.on('joinCampaign', (campaignId) => {
    socket.join(campaignId);
    console.log(`User ${socket.decoded_token.user.username} joined campaign room ${campaignId}`);
  });

  socket.on('chatMessage', async (data) => {
    try {
      const { campaignId, content } = data;
      const authorId = socket.decoded_token.user.id;

      const newMessage = new ChatMessage({
        content,
        campaign: campaignId,
        author: authorId,
      });
      await newMessage.save();

      const populatedMessage = await ChatMessage.findById(newMessage._id)
          .populate('author', 'username avatar');

      io.to(campaignId).emit('newMessage', populatedMessage);
    } catch (err) {
      console.error('Error handling chat message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.decoded_token.user.username);
  });
});

// --- Health Check Route ---
app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Chat server listening on port ${PORT}`);
});