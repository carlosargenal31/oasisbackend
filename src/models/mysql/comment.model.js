import { mysqlPool } from '../../config/database.js';

export const createCommentTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS blog_comments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      blog_id INT NOT NULL,
      user_id INT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      content TEXT NOT NULL,
      likes INT DEFAULT 0,
      dislikes INT DEFAULT 0,
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
    )
  `;
  
  try {
    const connection = await mysqlPool.getConnection();
    await connection.query(query);
    connection.release();
    console.log('Blog comments table created successfully');
  } catch (error) {
    console.error('Error creating blog comments table:', error);
    throw error;
  }
};

// Clase para operaciones básicas del modelo
export class Comment {
  // Crear un nuevo comentario
  static async create(commentData) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        `INSERT INTO blog_comments 
         (blog_id, user_id, name, email, content) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          commentData.blog_id,
          commentData.user_id || null,
          commentData.name,
          commentData.email || null,
          commentData.content
        ]
      );
      
      connection.release();
      return result.insertId;
    } catch (error) {
      console.error('Error creating comment:', error);
      throw error;
    }
  }

  // Obtener todos los comentarios para un blog
  static async findByBlogId(blogId, status = 'approved') {
    try {
      const connection = await mysqlPool.getConnection();
      
      let query = `
        SELECT * FROM blog_comments
        WHERE blog_id = ?
      `;
      
      const params = [blogId];
      
      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const [comments] = await connection.query(query, params);
      connection.release();
      
      return comments;
    } catch (error) {
      console.error('Error finding comments:', error);
      throw error;
    }
  }

  // Encontrar un comentario por ID
  static async findById(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [comments] = await connection.query(
        'SELECT * FROM blog_comments WHERE id = ?',
        [id]
      );
      
      connection.release();
      
      return comments.length > 0 ? comments[0] : null;
    } catch (error) {
      console.error('Error finding comment by ID:', error);
      throw error;
    }
  }

  // Actualizar un comentario
  static async update(id, commentData) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Construir consulta dinámica en base a los campos proporcionados
      const updateFields = [];
      const updateValues = [];
      
      // Añadir campos a actualizar
      if (commentData.content !== undefined) {
        updateFields.push('content = ?');
        updateValues.push(commentData.content);
      }
      
      if (commentData.status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(commentData.status);
      }
      
      if (commentData.likes !== undefined) {
        updateFields.push('likes = ?');
        updateValues.push(commentData.likes);
      }
      
      if (commentData.dislikes !== undefined) {
        updateFields.push('dislikes = ?');
        updateValues.push(commentData.dislikes);
      }
      
      if (updateFields.length === 0) {
        connection.release();
        return false; // No hay campos para actualizar
      }
      
      // Añadir ID al final
      updateValues.push(id);
      
      const [result] = await connection.query(
        `UPDATE blog_comments SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  // Eliminar un comentario
  static async delete(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'DELETE FROM blog_comments WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }

  // Incrementar likes
  static async incrementLikes(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'UPDATE blog_comments SET likes = COALESCE(likes, 0) + 1 WHERE id = ?',
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
        'UPDATE blog_comments SET dislikes = COALESCE(dislikes, 0) + 1 WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error incrementing dislikes:', error);
      throw error;
    }
  }
  
  // Contar comentarios por blogId
  static async countByBlogId(blogId, status = 'approved') {
    try {
      const connection = await mysqlPool.getConnection();
      
      let query = 'SELECT COUNT(*) as count FROM blog_comments WHERE blog_id = ?';
      const params = [blogId];
      
      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }
      
      const [result] = await connection.query(query, params);
      
      connection.release();
      return result[0].count || 0;
    } catch (error) {
      console.error('Error counting comments:', error);
      throw error;
    }
  }
}