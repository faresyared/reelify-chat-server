const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
  // Link to the user who sent the message
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Link to the campaign this message belongs to
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
  },
}, { timestamps: true });

// We need to tell Mongoose that 'User' and 'Campaign' models exist, even though we define them elsewhere.
// This is a small but important detail for .populate() to work across services.
mongoose.model('User', new mongoose.Schema({}));
mongoose.model('Campaign', new mongoose.Schema({}));

module.exports = mongoose.models.ChatMessage || mongoose.model('ChatMessage', ChatMessageSchema);