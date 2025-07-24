require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { authorize } = require('socketio-jwt'); // Use a slightly different import style

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

// --- THIS IS THE FIX ---
// This is a more explicit and robust way to configure the authentication middleware.
// It uses a function to provide the secret, which avoids many common issues.
io.use(authorize({
  secret: (decodedToken, callback) => {
    // This function provides the secret key for verification.
    const secret = process.env.JWT_SECRET;
    callback(null, secret);
  },
  handshake: true,
}));

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

app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Chat server listening on port ${PORT}`);
});