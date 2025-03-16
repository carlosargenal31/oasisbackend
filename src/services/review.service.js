// src/services/review.service.js
import { mysqlPool } from '../config/database.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  AuthorizationError,
  ConflictError 
} from '../utils/errors/index.js';

export class ReviewService {
  /**
   * Crea una nueva reseña
   * @param {Object} reviewData - Datos de la reseña
   * @returns {Promise<number>} - ID de la reseña creada
   */
  // src/services/review.service.js - Modificación para corregir la creación de reseñas

/**
 * Crea una nueva reseña
 * @param {Object} reviewData - Datos de la reseña
 * @returns {Promise<number>} - ID de la reseña creada
 */
static async createReview(reviewData) {
  // Validaciones iniciales
  if (!reviewData.property_id || !reviewData.rating) {
    throw new ValidationError('Datos de reseña incompletos', [
      'property_id',
      'rating'
    ]);
  }

  // Validar rating
  if (reviewData.rating < 1 || reviewData.rating > 5) {
    throw new ValidationError('El rating debe estar entre 1 y 5');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Verificar si la propiedad existe
    const [property] = await connection.query(
      'SELECT id FROM properties WHERE id = ?',
      [reviewData.property_id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Si hay booking_id, verificar que la reserva exista
    if (reviewData.booking_id) {
      const [booking] = await connection.query(
        'SELECT id, user_id, status FROM bookings WHERE id = ?',
        [reviewData.booking_id]
      );

      if (booking.length === 0) {
        throw new NotFoundError('Reserva no encontrada');
      }

      if (booking[0].user_id !== reviewData.reviewer_id) {
        throw new AuthorizationError('No autorizado para hacer reseña de esta reserva');
      }

      if (booking[0].status !== 'completed') {
        throw new ValidationError('Solo se pueden hacer reseñas de reservas completadas');
      }

      // Verificar si ya existe una reseña para esta reserva
      const [existingReview] = await connection.query(
        'SELECT id FROM reviews WHERE booking_id = ?',
        [reviewData.booking_id]
      );

      if (existingReview.length > 0) {
        throw new ConflictError('Ya existe una reseña para esta reserva');
      }
    }

    // Crear la reseña - Aquí añadimos el email
    const [result] = await connection.query(
      `INSERT INTO reviews 
       (property_id, booking_id, reviewer_id, reviewer_name, email, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        reviewData.property_id,
        reviewData.booking_id || null,
        reviewData.reviewer_id || 0, // Usar 0 para usuario anónimo
        reviewData.reviewer_name,
        reviewData.email || null, // Añadir email
        reviewData.rating,
        reviewData.comment || null
      ]
    ).catch(error => {
      console.error('Error al crear la reseña:', error);
      throw new DatabaseError('Error al crear la reseña');
    });

    // Actualizar rating promedio de la propiedad
    await this.updatePropertyAverageRating(reviewData.property_id, connection);

    return result.insertId;
  } finally {
    connection.release();
  }
}

  /**
   * Obtiene reseñas con filtros opcionales
   * @param {Object} filters - Filtros para las reseñas
   * @returns {Promise<Array>} - Lista de reseñas
   */
  static async getReviews(filters = {}) {
    const connection = await mysqlPool.getConnection();
    try {
      let query = `
        SELECT r.*, 
               p.title as property_title,
               u.first_name as reviewer_first_name,
               u.last_name as reviewer_last_name 
        FROM reviews r 
        JOIN properties p ON r.property_id = p.id
        LEFT JOIN users u ON r.reviewer_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (filters.property_id) {
        query += ' AND r.property_id = ?';
        params.push(parseInt(filters.property_id));
      }

      if (filters.reviewer_id) {
        query += ' AND r.reviewer_id = ?';
        params.push(parseInt(filters.reviewer_id));
      }

      if (filters.min_rating) {
        query += ' AND r.rating >= ?';
        params.push(parseInt(filters.min_rating));
      }

      if (filters.max_rating) {
        query += ' AND r.rating <= ?';
        params.push(parseInt(filters.max_rating));
      }

      query += ' ORDER BY r.created_at DESC';

      const [reviews] = await connection.query(query, params)
        .catch(error => {
          console.error('Error al obtener las reseñas:', error);
          throw new DatabaseError('Error al obtener las reseñas');
        });

      return reviews;
    } finally {
      connection.release();
    }
  }

  /**
   * Obtiene una reseña por su ID
   * @param {number} id - ID de la reseña
   * @returns {Promise<Object>} - Reseña encontrada
   */
  static async getReviewById(id) {
    if (!id) {
      throw new ValidationError('ID de reseña es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      const [review] = await connection.query(
        `SELECT r.*, p.title as property_title 
         FROM reviews r 
         JOIN properties p ON r.property_id = p.id 
         WHERE r.id = ?`,
        [id]
      ).catch(error => {
        console.error('Error al obtener la reseña:', error);
        throw new DatabaseError('Error al obtener la reseña');
      });

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      return review[0];
    } finally {
      connection.release();
    }
  }

  /**
   * Actualiza una reseña existente
   * @param {number} id - ID de la reseña
   * @param {Object} reviewData - Datos actualizados
   * @param {number} userId - ID del usuario que realiza la actualización
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async updateReview(id, reviewData, userId) {
    if (!id) {
      throw new ValidationError('ID de reseña es requerido');
    }

    if (reviewData.rating && (reviewData.rating < 1 || reviewData.rating > 5)) {
      throw new ValidationError('El rating debe estar entre 1 y 5');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la reseña existe y pertenece al usuario
      const [review] = await connection.query(
        'SELECT reviewer_id, property_id FROM reviews WHERE id = ?',
        [id]
      );

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      if (review[0].reviewer_id !== userId) {
        throw new AuthorizationError('No autorizado para actualizar esta reseña');
      }

      // Construir la consulta de actualización con los campos proporcionados
      const updateFields = [];
      const updateValues = [];
      
      if (reviewData.rating) {
        updateFields.push('rating = ?');
        updateValues.push(reviewData.rating);
      }
      
      if (reviewData.comment !== undefined) {
        updateFields.push('comment = ?');
        updateValues.push(reviewData.comment);
      }
      
      if (updateFields.length === 0) {
        return false; // No hay campos para actualizar
      }
      
      // Agregar ID de la reseña para WHERE
      updateValues.push(id);
      
      const [result] = await connection.query(
        `UPDATE reviews SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      ).catch(error => {
        console.error('Error al actualizar la reseña:', error);
        throw new DatabaseError('Error al actualizar la reseña');
      });

      // Actualizar el rating promedio si cambiamos la calificación
      if (reviewData.rating) {
        await this.updatePropertyAverageRating(review[0].property_id, connection);
      }

      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Elimina una reseña
   * @param {number} id - ID de la reseña
   * @param {number} userId - ID del usuario que realiza la eliminación
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async deleteReview(id, userId) {
    if (!id) {
      throw new ValidationError('ID de reseña es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la reseña existe y pertenece al usuario
      const [review] = await connection.query(
        'SELECT reviewer_id, property_id FROM reviews WHERE id = ?',
        [id]
      );

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      if (review[0].reviewer_id !== userId) {
        throw new AuthorizationError('No autorizado para eliminar esta reseña');
      }

      const [result] = await connection.query(
        'DELETE FROM reviews WHERE id = ?',
        [id]
      ).catch(error => {
        console.error('Error al eliminar la reseña:', error);
        throw new DatabaseError('Error al eliminar la reseña');
      });

      // Actualizar el rating promedio de la propiedad
      await this.updatePropertyAverageRating(review[0].property_id, connection);

      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Incrementa los likes de una reseña
   * @param {number} id - ID de la reseña
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async likeReview(id) {
    if (!id) {
      throw new ValidationError('ID de reseña es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la reseña existe
      const [review] = await connection.query(
        'SELECT id FROM reviews WHERE id = ?',
        [id]
      );

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      // Incrementar los likes
      const [result] = await connection.query(
        'UPDATE reviews SET likes = COALESCE(likes, 0) + 1 WHERE id = ?',
        [id]
      ).catch(error => {
        console.error('Error al dar like a la reseña:', error);
        throw new DatabaseError('Error al dar like a la reseña');
      });

      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Incrementa los dislikes de una reseña
   * @param {number} id - ID de la reseña
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async dislikeReview(id) {
    if (!id) {
      throw new ValidationError('ID de reseña es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la reseña existe
      const [review] = await connection.query(
        'SELECT id FROM reviews WHERE id = ?',
        [id]
      );

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      // Incrementar los dislikes
      const [result] = await connection.query(
        'UPDATE reviews SET dislikes = COALESCE(dislikes, 0) + 1 WHERE id = ?',
        [id]
      ).catch(error => {
        console.error('Error al dar dislike a la reseña:', error);
        throw new DatabaseError('Error al dar dislike a la reseña');
      });

      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Actualiza el rating promedio de una propiedad
   * @param {number} propertyId - ID de la propiedad
   * @param {Object} connection - Conexión a la base de datos (opcional)
   * @returns {Promise<void>}
   */
  static async updatePropertyAverageRating(propertyId, connection) {
    const shouldReleaseConnection = !connection;
    
    try {
      if (shouldReleaseConnection) {
        connection = await mysqlPool.getConnection();
      }
      
      const [ratings] = await connection.query(
        'SELECT AVG(rating) as avg_rating FROM reviews WHERE property_id = ?',
        [propertyId]
      );

      await connection.query(
        'UPDATE properties SET average_rating = ? WHERE id = ?',
        [ratings[0].avg_rating || 0, propertyId]
      );
    } catch (error) {
      console.error('Error al actualizar el rating promedio:', error);
      throw new DatabaseError('Error al actualizar el rating promedio de la propiedad');
    } finally {
      if (shouldReleaseConnection && connection) {
        connection.release();
      }
    }
  }

  /**
   * Obtiene el rating promedio de una propiedad
   * @param {number} propertyId - ID de la propiedad
   * @returns {Promise<number>} - Rating promedio
   */
  static async getPropertyAverageRating(propertyId) {
    const connection = await mysqlPool.getConnection();
    try {
      const [result] = await connection.query(
        'SELECT average_rating FROM properties WHERE id = ?',
        [propertyId]
      );

      if (result.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      return result[0].average_rating || 0;
    } catch (error) {
      console.error('Error al obtener el rating promedio:', error);
      throw new DatabaseError('Error al obtener el rating promedio de la propiedad');
    } finally {
      connection.release();
    }
  }
}