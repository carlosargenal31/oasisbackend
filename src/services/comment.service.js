import { mysqlPool } from '../config/database.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  AuthorizationError,
  ConflictError 
} from '../utils/errors/index.js';
import { Comment } from '../models/mysql/comment.model.js';

export class CommentService {
  /**
   * Crea un nuevo comentario
   * @param {Object} commentData - Datos del comentario
   * @returns {Promise<number>} - ID del comentario creado
   */
  static async createComment(commentData) {
    // Validaciones iniciales
    if (!commentData.blog_id || !commentData.content) {
      throw new ValidationError('Datos de comentario incompletos', [
        'blog_id',
        'content'
      ]);
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Verificar si el blog existe
      const [blog] = await connection.query(
        'SELECT id FROM blogs WHERE id = ?',
        [commentData.blog_id]
      );

      if (blog.length === 0) {
        throw new NotFoundError('Blog no encontrado');
      }

      // Si no se proporciona user_id, es un error (ahora requerimos autenticación)
      if (!commentData.user_id) {
        throw new ValidationError('Se requiere autenticación para comentar');
      }

      // Verificar que el usuario existe
      const [user] = await connection.query(
        'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
        [commentData.user_id]
      );

      if (user.length === 0) {
        throw new NotFoundError('Usuario no encontrado');
      }

      // Si no se proporcionaron name y email, usar los datos del usuario
      if (!commentData.name || !commentData.email) {
        commentData.name = `${user[0].first_name} ${user[0].last_name}`.trim();
        commentData.email = user[0].email;
      }

      // Crear el comentario
      const [result] = await connection.query(
        `INSERT INTO blog_comments 
         (blog_id, user_id, name, email, content, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          commentData.blog_id,
          commentData.user_id,
          commentData.name,
          commentData.email,
          commentData.content,
          'approved' // Por defecto aprobado
        ]
      ).catch(error => {
        console.error('Error al crear el comentario:', error);
        throw new DatabaseError('Error al crear el comentario');
      });
      
      const commentId = result.insertId;

      await connection.commit();
      return commentId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Obtiene comentarios con filtros opcionales
   * @param {Object} filters - Filtros para los comentarios
   * @returns {Promise<Array>} - Lista de comentarios
   */
  static async getComments(filters = {}) {
    const connection = await mysqlPool.getConnection();
    try {
      let query = `
        SELECT c.*, 
               b.title as blog_title,
               u.first_name as user_first_name,
               u.last_name as user_last_name,
               u.profile_image
        FROM blog_comments c 
        JOIN blogs b ON c.blog_id = b.id
        LEFT JOIN users u ON c.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (filters.blog_id) {
        query += ' AND c.blog_id = ?';
        params.push(parseInt(filters.blog_id));
      }

      if (filters.status) {
        query += ' AND c.status = ?';
        params.push(filters.status);
      } else {
        // Por defecto mostrar solo aprobados
        query += ' AND c.status = "approved"';
      }

      query += ' ORDER BY c.created_at DESC';

      const [comments] = await connection.query(query, params)
        .catch(error => {
          console.error('Error al obtener los comentarios:', error);
          throw new DatabaseError('Error al obtener los comentarios');
        });

      return comments;
    } finally {
      connection.release();
    }
  }

  /**
   * Obtiene un comentario por su ID
   * @param {number} id - ID del comentario
   * @returns {Promise<Object>} - Comentario encontrado
   */
  static async getCommentById(id) {
    if (!id) {
      throw new ValidationError('ID de comentario es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      const [comment] = await connection.query(
        `SELECT c.*, b.title as blog_title 
         FROM blog_comments c 
         JOIN blogs b ON c.blog_id = b.id 
         WHERE c.id = ?`,
        [id]
      ).catch(error => {
        console.error('Error al obtener el comentario:', error);
        throw new DatabaseError('Error al obtener el comentario');
      });

      if (comment.length === 0) {
        throw new NotFoundError('Comentario no encontrado');
      }

      return comment[0];
    } finally {
      connection.release();
    }
  }

  /**
   * Actualiza un comentario existente
   * @param {number} id - ID del comentario
   * @param {Object} commentData - Datos actualizados
   * @param {number} userId - ID del usuario que realiza la actualización
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async updateComment(id, commentData, userId) {
    if (!id) {
      throw new ValidationError('ID de comentario es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Verificar si el comentario existe y pertenece al usuario
      const [comment] = await connection.query(
        'SELECT user_id FROM blog_comments WHERE id = ?',
        [id]
      );

      if (comment.length === 0) {
        throw new NotFoundError('Comentario no encontrado');
      }

      // Solo el autor o un admin puede editar el comentario
      if (comment[0].user_id !== userId) {
        // Verificar si el usuario es admin
        const [user] = await connection.query(
          'SELECT role FROM users WHERE id = ?',
          [userId]
        );
        
        if (user.length === 0 || (user[0].role !== 'admin' && user[0].role !== 'owner')) {
          throw new AuthorizationError('No autorizado para actualizar este comentario');
        }
      }

      // Construir la consulta de actualización con los campos proporcionados
      const updateFields = [];
      const updateValues = [];
      
      if (commentData.content !== undefined) {
        updateFields.push('content = ?');
        updateValues.push(commentData.content);
      }
      
      if (commentData.status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(commentData.status);
      }
      
      if (updateFields.length === 0) {
        await connection.rollback();
        connection.release();
        return false; // No hay campos para actualizar
      }
      
      // Agregar ID de la comentario para WHERE
      updateValues.push(id);
      
      // Actualizar el comentario
      const [result] = await connection.query(
        `UPDATE blog_comments SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      ).catch(error => {
        console.error('Error al actualizar el comentario:', error);
        throw new DatabaseError('Error al actualizar el comentario');
      });

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
   * Elimina un comentario
   * @param {number} id - ID del comentario
   * @param {number} userId - ID del usuario que realiza la eliminación
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async deleteComment(id, userId) {
    if (!id) {
      throw new ValidationError('ID de comentario es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Verificar si el comentario existe y pertenece al usuario
      const [comment] = await connection.query(
        'SELECT user_id FROM blog_comments WHERE id = ?',
        [id]
      );

      if (comment.length === 0) {
        throw new NotFoundError('Comentario no encontrado');
      }

      // Solo el autor o un admin puede eliminar el comentario
      if (comment[0].user_id !== userId) {
        // Verificar si el usuario es admin
        const [user] = await connection.query(
          'SELECT role FROM users WHERE id = ?',
          [userId]
        );
        
        if (user.length === 0 || (user[0].role !== 'admin' && user[0].role !== 'owner')) {
          throw new AuthorizationError('No autorizado para eliminar este comentario');
        }
      }

      // Eliminar el comentario
      const [result] = await connection.query(
        'DELETE FROM blog_comments WHERE id = ?',
        [id]
      ).catch(error => {
        console.error('Error al eliminar el comentario:', error);
        throw new DatabaseError('Error al eliminar el comentario');
      });

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
   * Incrementa los likes de un comentario
   * @param {number} id - ID del comentario
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async likeComment(id) {
    if (!id) {
      throw new ValidationError('ID de comentario es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si el comentario existe
      const [comment] = await connection.query(
        'SELECT id FROM blog_comments WHERE id = ?',
        [id]
      );

      if (comment.length === 0) {
        throw new NotFoundError('Comentario no encontrado');
      }

      // Incrementar los likes
      const [result] = await connection.query(
        'UPDATE blog_comments SET likes = COALESCE(likes, 0) + 1 WHERE id = ?',
        [id]
      ).catch(error => {
        console.error('Error al dar like al comentario:', error);
        throw new DatabaseError('Error al dar like al comentario');
      });

      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  /**
   * Incrementa los dislikes de un comentario
   * @param {number} id - ID del comentario
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async dislikeComment(id) {
    if (!id) {
      throw new ValidationError('ID de comentario es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si el comentario existe
      const [comment] = await connection.query(
        'SELECT id FROM blog_comments WHERE id = ?',
        [id]
      );

      if (comment.length === 0) {
        throw new NotFoundError('Comentario no encontrado');
      }

      // Incrementar los dislikes
      const [result] = await connection.query(
        'UPDATE blog_comments SET dislikes = COALESCE(dislikes, 0) + 1 WHERE id = ?',
        [id]
      ).catch(error => {
        console.error('Error al dar dislike al comentario:', error);
        throw new DatabaseError('Error al dar dislike al comentario');
      });

      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }
  
  /**
   * Obtiene el número de comentarios para un blog
   * @param {number} blogId - ID del blog
   * @returns {Promise<number>} - Número de comentarios
   */
  static async getBlogCommentCount(blogId) {
    if (!blogId) {
      throw new ValidationError('ID de blog es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si el blog existe
      const [blogExists] = await connection.query(
        'SELECT id FROM blogs WHERE id = ?',
        [blogId]
      );

      if (blogExists.length === 0) {
        throw new NotFoundError('Blog no encontrado');
      }

      // Obtener cantidad de comentarios aprobados
      const [results] = await connection.query(
        'SELECT COUNT(*) as comment_count FROM blog_comments WHERE blog_id = ? AND status = "approved"',
        [blogId]
      );

      return results[0].comment_count || 0;
    } catch (error) {
      console.error('Error al obtener cantidad de comentarios:', error);
      throw new DatabaseError('Error al obtener cantidad de comentarios');
    } finally {
      connection.release();
    }
  }

  /**
 * Quita un like de un comentario
 * @param {number} id - ID del comentario
 * @returns {Promise<boolean>} - Resultado de la operación
 */
static async unlikeComment(id) {
  if (!id) {
    throw new ValidationError('ID de comentario es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Verificar si el comentario existe
    const [comment] = await connection.query(
      'SELECT id, likes FROM blog_comments WHERE id = ?',
      [id]
    );

    if (comment.length === 0) {
      throw new NotFoundError('Comentario no encontrado');
    }

    // Solo decrementar si hay likes
    if (comment[0].likes > 0) {
      // Decrementar los likes
      const [result] = await connection.query(
        'UPDATE blog_comments SET likes = likes - 1 WHERE id = ? AND likes > 0',
        [id]
      ).catch(error => {
        console.error('Error al quitar like al comentario:', error);
        throw new DatabaseError('Error al quitar like al comentario');
      });

      return result.affectedRows > 0;
    }
    
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Quita un dislike de un comentario
 * @param {number} id - ID del comentario
 * @returns {Promise<boolean>} - Resultado de la operación
 */
static async undislikeComment(id) {
  if (!id) {
    throw new ValidationError('ID de comentario es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Verificar si el comentario existe
    const [comment] = await connection.query(
      'SELECT id, dislikes FROM blog_comments WHERE id = ?',
      [id]
    );

    if (comment.length === 0) {
      throw new NotFoundError('Comentario no encontrado');
    }

    // Solo decrementar si hay dislikes
    if (comment[0].dislikes > 0) {
      // Decrementar los dislikes
      const [result] = await connection.query(
        'UPDATE blog_comments SET dislikes = dislikes - 1 WHERE id = ? AND dislikes > 0',
        [id]
      ).catch(error => {
        console.error('Error al quitar dislike al comentario:', error);
        throw new DatabaseError('Error al quitar dislike al comentario');
      });

      return result.affectedRows > 0;
    }
    
    return false;
  } finally {
    connection.release();
  }
}
}