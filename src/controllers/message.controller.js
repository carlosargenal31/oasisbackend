// src/controllers/message.controller.js
import { MessageService } from '../services/message.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class MessageController {
  static sendMessage = asyncErrorHandler(async (req, res) => {
    const messageData = {
      sender_id: req.userId, // Asumiendo que viene del middleware de autenticación
      receiver_id: req.body.receiver_id,
      content: req.body.content
    };

    const message = await MessageService.createMessage(messageData);
    res.status(201).json({
      status: 'success',
      data: {
        message,
        messageId: message._id,
        info: 'Mensaje enviado exitosamente'
      }
    });
  });

  static getConversation = asyncErrorHandler(async (req, res) => {
    const { user1Id, user2Id } = req.params;
    const messages = await MessageService.getConversation(
      parseInt(user1Id),
      parseInt(user2Id)
    );

    res.json({
      status: 'success',
      data: {
        messages,
        count: messages.length
      }
    });
  });

  static getUserConversations = asyncErrorHandler(async (req, res) => {
    const { userId } = req.params;
    const conversations = await MessageService.getUserConversations(parseInt(userId));

    res.json({
      status: 'success',
      data: {
        conversations,
        count: conversations.length
      }
    });
  });

  static markAsRead = asyncErrorHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.userId; // Asumiendo que viene del middleware de autenticación

    await MessageService.markAsRead(conversationId, parseInt(userId));
    
    res.json({
      status: 'success',
      message: 'Mensajes marcados como leídos'
    });
  });

  static deleteMessage = asyncErrorHandler(async (req, res) => {
    const { messageId } = req.params;
    const userId = req.userId; // Asumiendo que viene del middleware de autenticación
    
    await MessageService.deleteMessage(messageId, userId);
    
    res.json({
      status: 'success',
      message: 'Mensaje eliminado exitosamente'
    });
  });
}