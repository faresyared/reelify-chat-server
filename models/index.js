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

// --- Configure CORS ---
// We must allow our frontend's URL to connect.
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// --- Connect to MongoDB ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected for Chat Server...'))
  .catch(err => console.error(err));

// --- API Route to get message history ---
// This is a standard REST endpoint for the frontend to fetch old messages.
app.get('/messages/:campaignId', async (req, res) => {
  try {
    const messages = await ChatMessage.find({ campaign: req.params.campaignId })
      .sort({ createdAt: 'desc' })
      .limit(50) // Get the last 50 messages
      .populate('author', 'username avatar'); // Get the author's details

    res.json(messages.reverse()); // Reverse to show oldest first
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// --- Socket.IO Authentication Middleware ---
// This protects our chat server. Only users with a valid token can connect.
io.use(jwt.authorize({
  secret: process.env.JWT_SECRET,
  handshake: true
}));

// --- Main Socket.IO Connection Logic ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.decoded_token.user.username);

  // When a user joins a specific campaign's chat
  socket.on('joinCampaign', (campaignId) => {
    socket.join(campaignId);
    console.log(`User ${socket.decoded_token.user.username} joined campaign room ${campaignId}`);
  });

  // When a new chat message is received from a user
  socket.on('chatMessage', async (data) => {
    try {
      const { campaignId, content } = data;
      const authorId = socket.decoded_token.user.id;

      // 1. Create and save the message to the database
      const newMessage = new ChatMessage({
        content,
        campaign: campaignId,
        author: authorId,
      });
      await newMessage.save();

      // 2. Populate the author's details to send back to the frontend
      const populatedMessage = await ChatMessage.findById(newMessage._id)
          .populate('author', 'username avatar');

      // 3. Broadcast the new message to everyone in that specific campaign room
      io.to(campaignId).emit('newMessage', populatedMessage);

    } catch (err) {
      console.error('Error handling chat message:', err);
      // You could optionally emit an error back to the sender
      // socket.emit('chatError', 'There was an error sending your message.');
    }
  });

  // When a user disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.decoded_token.user.username);
  });
});

// --- Health Check Route ---
// A simple route for Render to know our service is alive.
app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Chat server listening on port ${PORT}`);
});