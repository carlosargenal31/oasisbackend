// src/routes/message.routes.js
import express from 'express';
import { MessageController } from '../controllers/message.controller.js';
import { validateMessageData } from '../middleware/message.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

router.post('/', validateMessageData, MessageController.sendMessage);
router.get('/conversations/:userId', MessageController.getUserConversations);
router.get('/:user1Id/:user2Id', MessageController.getConversation);
router.put('/read/:conversationId/:userId', MessageController.markAsRead);
router.delete('/:messageId', MessageController.deleteMessage);

export default router;
