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

    // Si no se proporciona reviewer_id, es un error (requerimos autenticación)
    if (!reviewData.reviewer_id) {
      throw new ValidationError('Se requiere autenticación para dejar una reseña');
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Verificar si la propiedad existe
      const [property] = await connection.query(
        'SELECT id FROM properties WHERE id = ?',
        [reviewData.property_id]
      );

      if (property.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      // Verificar que el usuario existe
      const [user] = await connection.query(
        'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
        [reviewData.reviewer_id]
      );

      if (user.length === 0) {
        throw new NotFoundError('Usuario no encontrado');
      }

      // Si no se proporcionaron reviewer_name y email, usar los datos del usuario
      if (!reviewData.reviewer_name || !reviewData.email) {
        reviewData.reviewer_name = `${user[0].first_name} ${user[0].last_name}`.trim();
        reviewData.email = user[0].email;
      }

      // Verificar si el usuario ya ha dejado una reseña para esta propiedad
      const [existingReview] = await connection.query(
        'SELECT id FROM reviews WHERE property_id = ? AND reviewer_id = ?',
        [reviewData.property_id, reviewData.reviewer_id]
      );

      if (existingReview.length > 0) {
        throw new ConflictError('Ya has dejado una reseña para esta propiedad. Puedes editarla si deseas.');
      }

      // Crear la reseña
      const [result] = await connection.query(
        `INSERT INTO reviews 
         (property_id, reviewer_id, reviewer_name, email, rating, comment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          reviewData.property_id,
          reviewData.reviewer_id,
          reviewData.reviewer_name,
          reviewData.email || null,
          reviewData.rating,
          reviewData.comment || null
        ]
      ).catch(error => {
        console.error('Error al crear la reseña:', error);
        throw new DatabaseError('Error al crear la reseña');
      });
      
      const reviewId = result.insertId;

      // Calcular y actualizar el rating promedio de la propiedad
      await this.updatePropertyAverageRating(reviewData.property_id, connection);

      await connection.commit();
      return reviewId;
    } catch (error) {
      await connection.rollback();
      throw error;
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
               u.last_name as reviewer_last_name,
               u.profile_image
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
        `SELECT r.*, p.title as property_title,
                u.first_name as reviewer_first_name,
                u.last_name as reviewer_last_name,
                u.profile_image 
         FROM reviews r 
         JOIN properties p ON r.property_id = p.id
         LEFT JOIN users u ON r.reviewer_id = u.id 
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
      await connection.beginTransaction();
      
      // Verificar si la reseña existe y pertenece al usuario
      const [review] = await connection.query(
        'SELECT reviewer_id, property_id FROM reviews WHERE id = ?',
        [id]
      );

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      // Verificar si el usuario es el autor o un administrador
      if (review[0].reviewer_id !== userId) {
        // Comprobar si es administrador
        const [user] = await connection.query(
          'SELECT role FROM users WHERE id = ?',
          [userId]
        );

        if (user.length === 0 || (user[0].role !== 'admin' && user[0].role !== 'owner')) {
          throw new AuthorizationError('No autorizado para actualizar esta reseña');
        }
      }

      const propertyId = review[0].property_id;

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
        await connection.rollback();
        connection.release();
        return false; // No hay campos para actualizar
      }
      
      // Agregar ID de la reseña para WHERE
      updateValues.push(id);
      
      // Actualizar la reseña
      const [result] = await connection.query(
        `UPDATE reviews SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
        updateValues
      ).catch(error => {
        console.error('Error al actualizar la reseña:', error);
        throw new DatabaseError('Error al actualizar la reseña');
      });

      // Si cambiamos la calificación, actualizar el rating promedio
      if (reviewData.rating) {
        await this.updatePropertyAverageRating(propertyId, connection);
      }

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
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
      await connection.beginTransaction();
      
      // Verificar si la reseña existe y pertenece al usuario
      const [review] = await connection.query(
        'SELECT reviewer_id, property_id FROM reviews WHERE id = ?',
        [id]
      );

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      // Verificar si el usuario es el autor o un administrador
      if (review[0].reviewer_id !== userId) {
        // Comprobar si es administrador
        const [user] = await connection.query(
          'SELECT role FROM users WHERE id = ?',
          [userId]
        );

        if (user.length === 0 || (user[0].role !== 'admin' && user[0].role !== 'owner')) {
          throw new AuthorizationError('No autorizado para eliminar esta reseña');
        }
      }

      const propertyId = review[0].property_id;

      // Eliminar la reseña
      const [result] = await connection.query(
        'DELETE FROM reviews WHERE id = ?',
        [id]
      ).catch(error => {
        console.error('Error al eliminar la reseña:', error);
        throw new DatabaseError('Error al eliminar la reseña');
      });

      // Actualizar el rating promedio de la propiedad después de eliminar la reseña
      await this.updatePropertyAverageRating(propertyId, connection);

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
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
   * Quita un like de una reseña
   * @param {number} id - ID de la reseña
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async unlikeReview(id) {
    if (!id) {
      throw new ValidationError('ID de reseña es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la reseña existe
      const [review] = await connection.query(
        'SELECT id, likes FROM reviews WHERE id = ?',
        [id]
      );

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      // Solo decrementar si hay likes
      if (review[0].likes > 0) {
        // Decrementar los likes
        const [result] = await connection.query(
          'UPDATE reviews SET likes = likes - 1 WHERE id = ? AND likes > 0',
          [id]
        ).catch(error => {
          console.error('Error al quitar like a la reseña:', error);
          throw new DatabaseError('Error al quitar like a la reseña');
        });

        return result.affectedRows > 0;
      }
      
      return false;
    } finally {
      connection.release();
    }
  }

  /**
   * Quita un dislike de una reseña
   * @param {number} id - ID de la reseña
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async undislikeReview(id) {
    if (!id) {
      throw new ValidationError('ID de reseña es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la reseña existe
      const [review] = await connection.query(
        'SELECT id, dislikes FROM reviews WHERE id = ?',
        [id]
      );

      if (review.length === 0) {
        throw new NotFoundError('Reseña no encontrada');
      }

      // Solo decrementar si hay dislikes
      if (review[0].dislikes > 0) {
        // Decrementar los dislikes
        const [result] = await connection.query(
          'UPDATE reviews SET dislikes = dislikes - 1 WHERE id = ? AND dislikes > 0',
          [id]
        ).catch(error => {
          console.error('Error al quitar dislike a la reseña:', error);
          throw new DatabaseError('Error al quitar dislike a la reseña');
        });

        return result.affectedRows > 0;
      }
      
      return false;
    } finally {
      connection.release();
    }
  }

  /**
   * Actualiza el rating promedio de una propiedad
   * @param {number} propertyId - ID de la propiedad
   * @param {Object} connection - Conexión a la base de datos (opcional)
   * @returns {Promise<number>} - Rating promedio actualizado
   */
  static async updatePropertyAverageRating(propertyId, connection) {
    const shouldReleaseConnection = !connection;
    
    try {
      if (shouldReleaseConnection) {
        connection = await mysqlPool.getConnection();
      }
      
      // Obtener el promedio de calificaciones para la propiedad
      const [ratings] = await connection.query(
        'SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE property_id = ?',
        [propertyId]
      );

      const avgRating = ratings[0].avg_rating || 0;
      const reviewCount = ratings[0].review_count || 0;
      
      console.log(`Actualizando rating promedio para property_id=${propertyId}: ${avgRating} (${reviewCount} reseñas)`);
      
      // Actualizar el campo average_rating en la tabla properties
      await connection.query(
        'UPDATE properties SET average_rating = ? WHERE id = ?',
        [avgRating, propertyId]
      );
      
      return avgRating;
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
    if (!propertyId) {
      throw new ValidationError('ID de propiedad es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la propiedad existe
      const [propertyExists] = await connection.query(
        'SELECT id FROM properties WHERE id = ?',
        [propertyId]
      );

      if (propertyExists.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      // Obtener promedio directamente de la tabla reviews
      const [results] = await connection.query(
        'SELECT AVG(rating) as average_rating, COUNT(*) as review_count FROM reviews WHERE property_id = ?',
        [propertyId]
      );

      console.log('Resultado de rating query:', results);

      // Actualizar el valor en properties para asegurar la consistencia
      const avgRating = results[0].average_rating !== null ? Number(results[0].average_rating) : 0;
      
      // Actualizar el campo average_rating en la tabla properties
      await connection.query(
        'UPDATE properties SET average_rating = ? WHERE id = ?',
        [avgRating, propertyId]
      );

      return avgRating;
    } catch (error) {
      console.error('Error al obtener el rating promedio:', error);
      throw new DatabaseError('Error al obtener el rating promedio de la propiedad');
    } finally {
      connection.release();
    }
  }

  /**
   * Recalcula y actualiza los ratings promedio de todas las propiedades
   * @returns {Promise<Object>} - Resultado de la operación
   */
  static async recalculateAllPropertyRatings() {
    const connection = await mysqlPool.getConnection();
    
    try {
      console.log('Iniciando actualización de ratings promedio para todas las propiedades...');
      
      // Obtener todas las propiedades que tienen reseñas
      const [properties] = await connection.query(`
        SELECT DISTINCT p.id 
        FROM properties p
        JOIN reviews r ON p.id = r.property_id
      `);
      
      console.log(`Se encontraron ${properties.length} propiedades con reseñas.`);
      
      // Para cada propiedad, calcular y actualizar el rating promedio
      let updated = 0;
      
      for (const property of properties) {
        const propertyId = property.id;
        
        // Calcular promedio
        const [ratings] = await connection.query(
          'SELECT AVG(rating) as avg_rating FROM reviews WHERE property_id = ?',
          [propertyId]
        );
        
        const avgRating = ratings[0].avg_rating || 0;
        
        // Actualizar rating en la tabla properties
        await connection.query(
          'UPDATE properties SET average_rating = ? WHERE id = ?',
          [avgRating, propertyId]
        );
        
        updated++;
        
        if (updated % 10 === 0) {
          console.log(`Actualizadas ${updated} de ${properties.length} propiedades...`);
        }
      }
      
      console.log(`¡Completado! Se actualizaron los ratings promedio de ${updated} propiedades.`);
      
      return {
        success: true,
        totalProperties: properties.length,
        updatedProperties: updated
      };
    } catch (error) {
      console.error('Error al actualizar los ratings promedio:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}