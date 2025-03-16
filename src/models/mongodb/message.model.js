// src/models/mongodb/message.model.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender_id: {
    type: Number,
    required: true,
    ref: 'User'
  },
  receiver_id: {
    type: Number,
    required: true,
    ref: 'User'
  },
  conversation_id: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Crear índices para búsquedas eficientes
messageSchema.index({ conversation_id: 1 });
messageSchema.index({ sender_id: 1, receiver_id: 1 });

export const Message = mongoose.model('Message', messageSchema);