import express from 'express';
import { CommentController } from '../controllers/comment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateCommentData } from '../middleware/comment.middleware.js';

const router = express.Router();

// Rutas públicas (solo lectura)
router.get('/', CommentController.getComments);
router.get('/:id', CommentController.getComment);
router.get('/blog/:blogId/count', CommentController.getBlogCommentCount);

// Rutas que requieren autenticación
router.post('/', authenticate, validateCommentData, CommentController.createComment);
router.post('/:id/like', CommentController.likeComment);
router.post('/:id/dislike', CommentController.dislikeComment);
router.put('/:id', authenticate, validateCommentData, CommentController.updateComment);
router.delete('/:id', authenticate, CommentController.deleteComment);
router.post('/:id/unlike', CommentController.unlikeComment);
router.post('/:id/undislike', CommentController.undislikeComment);

export default router;