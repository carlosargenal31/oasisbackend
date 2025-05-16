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
      role ENUM('user', 'admin', 'owner') DEFAULT 'user',
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
  
  // Obtener propiedades de un usuario
  static async getProperties(userId) {
    if (!userId) {
      throw new Error('ID de usuario es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      // Verificar si la tabla properties tiene alguna relación con usuarios
      // En este caso no hay una columna host_id, así que devolvemos un array vacío
      // Si quisieras implementar esta función en el futuro, deberías crear una relación
      // o identificar qué columna relaciona propiedades con usuarios
      
      connection.release();
      return []; // Devolver array vacío ya que no hay relación con usuarios
    } catch (error) {
      console.error('Error getting user properties:', error);
      return []; // En caso de error, también devolver array vacío
    }
  }
  
  // Obtener el rating promedio de las propiedades de un usuario
  static async getAverageRating(userId) {
    if (!userId) {
      throw new Error('ID de usuario es requerido');
    }

    try {
      // Como no hay relación entre propiedades y usuarios,
      // simplemente devolvemos 0 como valor por defecto
      return 0;
    } catch (error) {
      console.error('Error getting user average rating:', error);
      return 0; // En caso de error, devolver 0
    }
  }
  
  // Contar el número total de reseñas de las propiedades de un usuario
  static async countReviews(userId) {
    if (!userId) {
      throw new Error('ID de usuario es requerido');
    }

    try {
      // Como no hay relación entre propiedades y usuarios,
      // simplemente devolvemos 0 como valor por defecto
      return 0;
    } catch (error) {
      console.error('Error counting user reviews:', error);
      return 0; // En caso de error, devolver 0
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