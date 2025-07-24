require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // Import the standard JWT library

const ChatMessage = require('./models/chatMessageModel');

const app = express();
const server = http.createServer(app);

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

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: corsOptions,
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected for Chat Server...'))
  .catch(err => console.error(err));

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

// --- THIS IS THE NEW, RELIABLE AUTHENTICATION MIDDLEWARE ---
// We write our own simple check instead of using the old library.
io.use((socket, next) => {
  // The token is sent in the 'auth' object from the client
  const token = socket.handshake.auth.token;

  if (!token) {
    console.error('Authentication error: No token provided.');
    return next(new Error('Authentication error'));
  }

  // We verify the token using the same library and secret as our main backend
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Authentication error: Invalid token.');
      return next(new Error('Authentication error'));
    }
    // If the token is valid, we attach the user info to the socket object
    socket.decoded_token = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  // Now this will only run for successfully authenticated users
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

app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Chat server listening on port ${PORT}`);
});