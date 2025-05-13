// src/controllers/review.controller.js
import { ReviewService } from '../services/review.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';
import { mysqlPool } from '../config/database.js';

export class ReviewController {
  /**
   * Crea una nueva reseña
   */
  static createReview = asyncErrorHandler(async (req, res) => {
    // Extraer datos de la solicitud
    const { property_id, reviewer_name, email, rating, comment } = req.body;
    
    // Validaciones básicas
    if (!property_id || !reviewer_name || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Datos de reseña incompletos'
      });
    }
    
    try {
      // Para reseñas públicas (no autenticadas)
      // Usamos reviewer_id = 0 para indicar un usuario anónimo/público
      const reviewId = await ReviewService.createReview({
        property_id: parseInt(property_id),
        reviewer_id: req.userId || 0,
        reviewer_name,
        email,
        rating: parseInt(rating),
        comment
      });

      res.status(201).json({
        success: true,
        data: {
          reviewId,
          message: 'Reseña creada exitosamente'
        }
      });
    } catch (error) {
      console.error('Error al crear reseña:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear la reseña'
      });
    }
  });

  /**
   * Obtiene reseñas con filtros opcionales
   */
  static getReviews = asyncErrorHandler(async (req, res) => {
    const filters = {
      property_id: req.query.property_id,
      reviewer_id: req.query.reviewer_id,
      min_rating: req.query.min_rating,
      max_rating: req.query.max_rating
    };

    const reviews = await ReviewService.getReviews(filters);
    
    res.json({
      success: true,
      data: {
        reviews,
        count: reviews.length
      }
    });
  });

  /**
   * Obtiene una reseña específica por ID
   */
  static getReview = asyncErrorHandler(async (req, res) => {
    const review = await ReviewService.getReviewById(req.params.id);
    
    res.json({
      success: true,
      data: review
    });
  });

  /**
   * Actualiza una reseña existente
   */
  static updateReview = asyncErrorHandler(async (req, res) => {
    const userId = req.userId;
    
    await ReviewService.updateReview(
      req.params.id,
      req.body,
      userId
    );
    
    res.json({
      success: true,
      message: 'Reseña actualizada exitosamente'
    });
  });

  /**
   * Elimina una reseña
   */
  static deleteReview = asyncErrorHandler(async (req, res) => {
    const userId = req.userId;
    
    await ReviewService.deleteReview(
      req.params.id,
      userId
    );
    
    res.json({
      success: true,
      message: 'Reseña eliminada exitosamente'
    });
  });

  /**
   * Da like a una reseña
   */
  static likeReview = asyncErrorHandler(async (req, res) => {
    const success = await ReviewService.likeReview(req.params.id);
    
    res.json({
      success: true,
      message: success ? 'Like registrado exitosamente' : 'No se pudo registrar el like'
    });
  });

  /**
   * Da dislike a una reseña
   */
  static dislikeReview = asyncErrorHandler(async (req, res) => {
    const success = await ReviewService.dislikeReview(req.params.id);
    
    res.json({
      success: true,
      message: success ? 'Dislike registrado exitosamente' : 'No se pudo registrar el dislike'
    });
  });

  /**
   * Obtiene el rating promedio de una propiedad
   */
  static getPropertyRating = asyncErrorHandler(async (req, res) => {
    const propertyId = req.params.propertyId;
    
    try {
      // Obtener rating promedio
      const averageRating = await ReviewService.getPropertyAverageRating(propertyId);
      
      // Asegurar que el valor sea numérico
      const formattedRating = averageRating !== null ? Number(averageRating) : 0;
      
      res.json({
        success: true,
        data: {
          propertyId,
          averageRating: formattedRating
        }
      });
    } catch (error) {
      console.error(`Error al obtener rating para propiedad ${propertyId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener rating promedio',
        data: {
          propertyId,
          averageRating: 0
        }
      });
    }
  });

  /**
   * Recalcula y actualiza los ratings promedio de todas las propiedades
   * Solo accesible para administradores
   */
  static recalculateAllPropertyRatings = asyncErrorHandler(async (req, res) => {
    try {
      const result = await ReviewService.recalculateAllPropertyRatings();
      
      res.json({
        success: true,
        data: {
          message: 'Ratings promedio actualizados correctamente',
          totalProperties: result.totalProperties,
          updatedProperties: result.updatedProperties
        }
      });
    } catch (error) {
      console.error('Error al recalcular ratings promedio:', error);
      res.status(500).json({
        success: false,
        message: 'Error al recalcular ratings promedio'
      });
    }
  });
}