// src/models/mysql/review.model.js
import { mysqlPool } from '../../config/database.js';

export const createReviewTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS reviews (
      id INT PRIMARY KEY AUTO_INCREMENT,
      property_id INT NOT NULL,
      booking_id INT,
      reviewer_id INT,
      reviewer_name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      likes INT DEFAULT 0,
      dislikes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
      -- No agregamos FK para reviewer_id porque podría ser anónimo (valor 0)
    )
  `;
  
  try {
    const connection = await mysqlPool.getConnection();
    await connection.query(query);
    connection.release();
    console.log('Reviews table created successfully');
  } catch (error) {
    console.error('Error creating reviews table:', error);
    throw error;
  }
};

// Clase para operaciones básicas del modelo
export class Review {
  // Crear una nueva reseña
  static async create(reviewData) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        `INSERT INTO reviews 
         (property_id, booking_id, reviewer_id, reviewer_name, email, rating, comment) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          reviewData.property_id,
          reviewData.booking_id || null,
          reviewData.reviewer_id || null,
          reviewData.reviewer_name,
          reviewData.email || null,
          reviewData.rating,
          reviewData.comment || null
        ]
      );
      
      connection.release();
      return result.insertId;
    } catch (error) {
      console.error('Error creating review:', error);
      throw error;
    }
  }

  // Obtener todas las reseñas (con filtros opcionales)
  static async findAll(filters = {}) {
    try {
      const connection = await mysqlPool.getConnection();
      
      let query = `
        SELECT r.*, p.title as property_title 
        FROM reviews r 
        JOIN properties p ON r.property_id = p.id 
        WHERE 1=1
      `;
      
      const params = [];
      
      if (filters.property_id) {
        query += ' AND r.property_id = ?';
        params.push(filters.property_id);
      }
      
      if (filters.reviewer_id) {
        query += ' AND r.reviewer_id = ?';
        params.push(filters.reviewer_id);
      }
      
      if (filters.min_rating) {
        query += ' AND r.rating >= ?';
        params.push(filters.min_rating);
      }
      
      if (filters.max_rating) {
        query += ' AND r.rating <= ?';
        params.push(filters.max_rating);
      }
      
      query += ' ORDER BY r.created_at DESC';
      
      const [reviews] = await connection.query(query, params);
      connection.release();
      
      return reviews;
    } catch (error) {
      console.error('Error finding reviews:', error);
      throw error;
    }
  }

  // Encontrar una reseña por ID
  static async findById(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [reviews] = await connection.query(
        `SELECT r.*, p.title as property_title 
         FROM reviews r 
         JOIN properties p ON r.property_id = p.id 
         WHERE r.id = ?`,
        [id]
      );
      
      connection.release();
      
      return reviews.length > 0 ? reviews[0] : null;
    } catch (error) {
      console.error('Error finding review by ID:', error);
      throw error;
    }
  }

  // Actualizar una reseña
  static async update(id, reviewData) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Construir consulta dinámica en base a los campos proporcionados
      const updateFields = [];
      const updateValues = [];
      
      // Añadir campos a actualizar
      if (reviewData.rating !== undefined) {
        updateFields.push('rating = ?');
        updateValues.push(reviewData.rating);
      }
      
      if (reviewData.comment !== undefined) {
        updateFields.push('comment = ?');
        updateValues.push(reviewData.comment);
      }
      
      if (reviewData.email !== undefined) {
        updateFields.push('email = ?');
        updateValues.push(reviewData.email);
      }
      
      if (reviewData.likes !== undefined) {
        updateFields.push('likes = ?');
        updateValues.push(reviewData.likes);
      }
      
      if (reviewData.dislikes !== undefined) {
        updateFields.push('dislikes = ?');
        updateValues.push(reviewData.dislikes);
      }
      
      if (updateFields.length === 0) {
        connection.release();
        return false; // No hay campos para actualizar
      }
      
      // Añadir ID al final
      updateValues.push(id);
      
      const [result] = await connection.query(
        `UPDATE reviews SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating review:', error);
      throw error;
    }
  }

  // Eliminar una reseña
  static async delete(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'DELETE FROM reviews WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting review:', error);
      throw error;
    }
  }

  // Incrementar likes
  static async incrementLikes(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'UPDATE reviews SET likes = likes + 1 WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error incrementing likes:', error);
      throw error;
    }
  }

  // Incrementar dislikes
  static async incrementDislikes(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'UPDATE reviews SET dislikes = dislikes + 1 WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error incrementing dislikes:', error);
      throw error;
    }
  }
  
  // Obtener promedio de calificaciones por propiedad
  static async getAverageRatingByProperty(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'SELECT AVG(rating) as average_rating FROM reviews WHERE property_id = ?',
        [propertyId]
      );
      
      connection.release();
      return result[0].average_rating || 0;
    } catch (error) {
      console.error('Error getting average rating:', error);
      throw error;
    }
  }
  
  // Contar reseñas por propiedad
  static async countByProperty(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'SELECT COUNT(*) as count FROM reviews WHERE property_id = ?',
        [propertyId]
      );
      
      connection.release();
      return result[0].count || 0;
    } catch (error) {
      console.error('Error counting reviews:', error);
      throw error;
    }
  }
}