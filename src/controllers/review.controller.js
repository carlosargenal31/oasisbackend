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
    const { property_id, rating, comment } = req.body;
    
    // El userId está disponible gracias al middleware authenticate
    const userId = req.userId;
    
    // Validaciones básicas
    if (!property_id || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Datos de reseña incompletos'
      });
    }
    
    try {
      // Obtener información del usuario desde la base de datos
      const connection = await mysqlPool.getConnection();
      const [userResult] = await connection.query(
        'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
        [userId]
      );
      connection.release();
      
      if (userResult.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }
      
      const user = userResult[0];
      
      // Crear la reseña con los datos del usuario
      const reviewId = await ReviewService.createReview({
        property_id: parseInt(property_id),
        reviewer_id: userId,
        reviewer_name: `${user.first_name} ${user.last_name}`.trim(),
        email: user.email,
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