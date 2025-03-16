// src/services/message.service.js
import { Message } from '../models/mongodb/message.model.js';
import { mysqlPool } from '../config/database.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  AuthorizationError 
} from '../utils/errors/index.js';

export class MessageService {
  static generateConversationId(user1Id, user2Id) {
    if (!user1Id || !user2Id) {
      throw new ValidationError('Se requieren dos IDs de usuario para generar un ID de conversación');
    }
    const [smallerId, largerId] = [user1Id, user2Id].sort((a, b) => a - b);
    return `conv_${smallerId}_${largerId}`;
  }

  static async createMessage(messageData) {
    // Validaciones iniciales
    if (!messageData.sender_id || !messageData.receiver_id || !messageData.content) {
      throw new ValidationError('Datos del mensaje incompletos', [
        'sender_id',
        'receiver_id',
        'content'
      ]);
    }

    if (messageData.sender_id === messageData.receiver_id) {
      throw new ValidationError('No puedes enviarte mensajes a ti mismo');
    }

    const conversationId = this.generateConversationId(
      messageData.sender_id,
      messageData.receiver_id
    );

    // Verificar si los usuarios existen en MySQL
    const connection = await mysqlPool.getConnection();
    try {
      const [users] = await connection.query(
        'SELECT id FROM users WHERE id IN (?, ?)',
        [messageData.sender_id, messageData.receiver_id]
      ).catch(error => {
        throw new DatabaseError('Error al verificar usuarios');
      });

      if (users.length !== 2) {
        throw new NotFoundError('Uno o ambos usuarios no existen');
      }
    } finally {
      connection.release();
    }

    try {
      const message = new Message({
        sender_id: messageData.sender_id,
        receiver_id: messageData.receiver_id,
        conversation_id: conversationId,
        content: messageData.content
      });

      await message.save();
      return message;
    } catch (error) {
      throw new DatabaseError('Error al guardar el mensaje en MongoDB');
    }
  }

  static async getConversation(user1Id, user2Id) {
    if (!user1Id || !user2Id) {
      throw new ValidationError('Se requieren ambos IDs de usuario');
    }

    const conversationId = this.generateConversationId(user1Id, user2Id);
    
    try {
      const messages = await Message.find({ conversation_id: conversationId })
        .sort({ created_at: 'asc' });
      
      return messages;
    } catch (error) {
      throw new DatabaseError('Error al obtener la conversación de MongoDB');
    }
  }

  static async getUserConversations(userId) {
    if (!userId) {
      throw new ValidationError('ID de usuario es requerido');
    }

    try {
      // Encontrar todas las conversaciones únicas del usuario
      const messages = await Message.aggregate([
        {
          $match: {
            $or: [{ sender_id: userId }, { receiver_id: userId }]
          }
        },
        {
          $sort: { created_at: -1 }
        },
        {
          $group: {
            _id: '$conversation_id',
            lastMessage: { $first: '$$ROOT' },
            unreadCount: {
              $sum: {
                $cond: [
                  { $and: [
                    { $eq: ['$receiver_id', userId] },
                    { $eq: ['$read', false] }
                  ]},
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      // Obtener información de usuarios de MySQL
      const connection = await mysqlPool.getConnection();
      try {
        for (let conversation of messages) {
          const otherUserId = conversation.lastMessage.sender_id === userId 
            ? conversation.lastMessage.receiver_id 
            : conversation.lastMessage.sender_id;

          const [users] = await connection.query(
            'SELECT id, first_name, last_name, profile_image FROM users WHERE id = ?',
            [otherUserId]
          ).catch(error => {
            throw new DatabaseError('Error al obtener información de usuario');
          });

          if (users.length > 0) {
            conversation.otherUser = users[0];
          }
        }
      } finally {
        connection.release();
      }

      return messages;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError('Error al obtener las conversaciones');
    }
  }

  static async markAsRead(conversationId, userId) {
    if (!conversationId || !userId) {
      throw new ValidationError('ID de conversación y usuario son requeridos');
    }

    try {
      const result = await Message.updateMany(
        {
          conversation_id: conversationId,
          receiver_id: userId,
          read: false
        },
        {
          $set: { read: true }
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      throw new DatabaseError('Error al marcar mensajes como leídos');
    }
  }

  static async deleteMessage(messageId, userId) {
    if (!messageId || !userId) {
      throw new ValidationError('ID de mensaje y usuario son requeridos');
    }

    try {
      const message = await Message.findById(messageId);
      
      if (!message) {
        throw new NotFoundError('Mensaje no encontrado');
      }

      if (message.sender_id !== userId) {
        throw new AuthorizationError('No estás autorizado para eliminar este mensaje');
      }

      await message.deleteOne();
      return true;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      throw new DatabaseError('Error al eliminar el mensaje');
    }
  }
}