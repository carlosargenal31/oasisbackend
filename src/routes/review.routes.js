// src/routes/review.routes.js
import express from 'express';
import { ReviewController } from '../controllers/review.controller.js';
import { validateReviewData } from '../middleware/review.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Rutas públicas (solo lectura)
router.get('/', ReviewController.getReviews);
router.get('/:id', ReviewController.getReview);
router.get('/property/:propertyId/rating', ReviewController.getPropertyRating);

// Rutas para likes/dislikes (no requieren autenticación)
router.post('/:id/like', ReviewController.likeReview);
router.post('/:id/dislike', ReviewController.dislikeReview);

// Crear reseña (ahora requiere autenticación)
router.post('/', authenticate, validateReviewData, ReviewController.createReview);

// Rutas protegidas (requieren autenticación)
router.put('/:id', authenticate, validateReviewData, ReviewController.updateReview);
router.delete('/:id', authenticate, ReviewController.deleteReview);

// Ruta para recalcular todos los ratings promedio (solo admins)
router.post('/recalculate-ratings', authenticate, ReviewController.recalculateAllPropertyRatings);

export default router;