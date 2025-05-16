// src/routes/comment.routes.js
import express from 'express';
import { CommentController } from '../controllers/comment.controller.js';
import { commentAuth, validateCommentData } from '../middleware/auth.middleware.js';

const router = express.Router();

// Rutas públicas (solo lectura)
router.get('/', CommentController.getComments);
router.get('/:id', CommentController.getComment);
router.get('/blog/:blogId/count', CommentController.getBlogCommentCount);

// Rutas que usan autenticación simplificada para comentarios
router.post('/', validateCommentData, commentAuth, CommentController.createComment);
router.post('/:id/like', CommentController.likeComment);
router.post('/:id/dislike', CommentController.dislikeComment);
router.post('/:id/unlike', CommentController.unlikeComment);
router.post('/:id/undislike', CommentController.undislikeComment);

// Rutas que siguen usando autenticación tradicional
// (en caso de que quieras mantener la autenticación completa para algunas operaciones)
import { authenticate } from '../middleware/auth.middleware.js';
router.put('/:id', authenticate, validateCommentData, CommentController.updateComment);
router.delete('/:id', authenticate, CommentController.deleteComment);

export default router;