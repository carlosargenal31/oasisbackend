// src/models/mysql/user.model.js
import { mysqlPool } from '../../config/database.js';

// Actualizar en el método createUserTable(), agregar la columna role:
export const createUserTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      first_name VARCHAR(50) NOT NULL,
      last_name VARCHAR(50) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(20),
      status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
      role ENUM('user', 'admin') DEFAULT 'user',
      profile_image VARCHAR(255),
      refresh_token VARCHAR(255),
      last_login TIMESTAMP,
      short_bio TEXT,
      company_name VARCHAR(100),
      address TEXT,
      social_facebook VARCHAR(255),
      social_linkedin VARCHAR(255),
      social_twitter VARCHAR(255),
      social_instagram VARCHAR(255),
      social_pinterest VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;
  
  try {
    const connection = await mysqlPool.getConnection();
    await connection.query(query);
    connection.release();
    console.log('Users table created successfully');
  } catch (error) {
    console.error('Error creating users table:', error);
    throw error;
  }
};

// Nueva clase User para manejar operaciones relacionadas con usuarios
export class User {
  // Encontrar usuario por ID
  static async findById(id) {
    if (!id) {
      throw new Error('ID de usuario es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      const [users] = await connection.query(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      
      connection.release();
      
      if (users.length === 0) {
        return null;
      }
      
      // Remover datos sensibles
      const { password, refresh_token, ...userWithoutSensitiveData } = users[0];
      
      return userWithoutSensitiveData;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw error;
    }
  }
  
  // Obtener propiedades de un anfitrión
  static async getProperties(userId) {
    if (!userId) {
      throw new Error('ID de usuario es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      const [properties] = await connection.query(
        'SELECT * FROM properties WHERE host_id = ? ORDER BY created_at DESC',
        [userId]
      );
      
      connection.release();
      return properties;
    } catch (error) {
      console.error('Error getting user properties:', error);
      throw error;
    }
  }
  
  // Obtener el rating promedio de todas las propiedades de un anfitrión
  static async getAverageRating(userId) {
    if (!userId) {
      throw new Error('ID de usuario es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      // Consulta mejorada para obtener el promedio de calificaciones de todas las propiedades
      // del usuario, considerando todos los ratings de todas las propiedades
      const [result] = await connection.query(`
        SELECT AVG(r.rating) as average_rating
        FROM reviews r
        JOIN properties p ON r.property_id = p.id
        WHERE p.host_id = ?
      `, [userId]);
      
      connection.release();
      
      // Si no hay reviews, devolver 0
      if (!result[0].average_rating) {
        return 0;
      }
      
      // Devolver el rating promedio con precisión de 1 decimal
      return result[0].average_rating || 0;
    } catch (error) {
      console.error('Error getting user average rating:', error);
      throw error;
    }
  }
  
  // Contar el número total de reseñas de todas las propiedades de un anfitrión
  static async countReviews(userId) {
    if (!userId) {
      throw new Error('ID de usuario es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      // Consulta para contar todas las reseñas de las propiedades del usuario
      const [result] = await connection.query(`
        SELECT COUNT(*) as total_reviews
        FROM reviews r
        JOIN properties p ON r.property_id = p.id
        WHERE p.host_id = ?
      `, [userId]);
      
      connection.release();
      
      return result[0].total_reviews || 0;
    } catch (error) {
      console.error('Error counting user reviews:', error);
      throw error;
    }
  }
  
  // Actualizar el usuario
  static async update(id, userData) {
    if (!id) {
      throw new Error('ID de usuario es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      // Construir consulta dinámica en base a los campos proporcionados
      const updateFields = [];
      const updateValues = [];
      
      Object.entries(userData).forEach(([key, value]) => {
        if (value !== undefined && 
            key !== 'id' && 
            key !== 'created_at' && 
            key !== 'updated_at' &&
            key !== 'password') {
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }
      });
      
      if (updateFields.length === 0) {
        connection.release();
        return false; // No hay campos para actualizar
      }
      
      updateValues.push(id); // Agregar ID al final para WHERE
      
      const [result] = await connection.query(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }
}