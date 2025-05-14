import { CommentService } from '../services/comment.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';
import { mysqlPool } from '../config/database.js';

export class CommentController {
  /**
   * Crea un nuevo comentario
   */
  static createComment = asyncErrorHandler(async (req, res) => {
    // Extraer datos de la solicitud
    const { blog_id, content } = req.body;
    
    // El userId está disponible gracias al middleware authenticate
    const userId = req.userId;
    
    // Validaciones básicas
    if (!blog_id || !content) {
      return res.status(400).json({
        success: false,
        message: 'Datos de comentario incompletos'
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
      
      // Crear el comentario con los datos del usuario
      const commentId = await CommentService.createComment({
        blog_id: parseInt(blog_id),
        user_id: userId,
        name: `${user.first_name} ${user.last_name}`.trim(),
        email: user.email,
        content
      });

      res.status(201).json({
        success: true,
        data: {
          commentId,
          message: 'Comentario creado exitosamente'
        }
      });
    } catch (error) {
      console.error('Error al crear comentario:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear el comentario'
      });
    }
  });

  /**
   * Obtiene comentarios con filtros opcionales
   */
  static getComments = asyncErrorHandler(async (req, res) => {
    const filters = {
      blog_id: req.query.blog_id,
      status: req.query.status
    };

    const comments = await CommentService.getComments(filters);
    
    res.json({
      success: true,
      data: comments
    });
  });

  /**
   * Obtiene un comentario específico por ID
   */
  static getComment = asyncErrorHandler(async (req, res) => {
    const comment = await CommentService.getCommentById(req.params.id);
    
    res.json({
      success: true,
      data: comment
    });
  });

  /**
   * Actualiza un comentario existente
   */
  static updateComment = asyncErrorHandler(async (req, res) => {
    const userId = req.userId;
    
    await CommentService.updateComment(
      req.params.id,
      req.body,
      userId
    );
    
    res.json({
      success: true,
      message: 'Comentario actualizado exitosamente'
    });
  });

  /**
   * Elimina un comentario
   */
  static deleteComment = asyncErrorHandler(async (req, res) => {
    const userId = req.userId;
    
    await CommentService.deleteComment(
      req.params.id,
      userId
    );
    
    res.json({
      success: true,
      message: 'Comentario eliminado exitosamente'
    });
  });

  /**
   * Da like a un comentario
   */
 static likeComment = asyncErrorHandler(async (req, res) => {
  const success = await CommentService.likeComment(req.params.id);
  
  res.json({
    success: true,
    message: success ? 'Like registrado exitosamente' : 'No se pudo registrar el like'
  });
});


  /**
   * Da dislike a un comentario
   */
static dislikeComment = asyncErrorHandler(async (req, res) => {
  const success = await CommentService.dislikeComment(req.params.id);
  
  res.json({
    success: true,
    message: success ? 'Dislike registrado exitosamente' : 'No se pudo registrar el dislike'
  });
});

/**
 * Quita un like a un comentario
 */
static unlikeComment = asyncErrorHandler(async (req, res) => {
  const success = await CommentService.unlikeComment(req.params.id);
  
  res.json({
    success: true,
    message: success ? 'Like removido exitosamente' : 'No se pudo remover el like'
  });
});

/**
 * Quita un dislike a un comentario
 */
static undislikeComment = asyncErrorHandler(async (req, res) => {
  const success = await CommentService.undislikeComment(req.params.id);
  
  res.json({
    success: true,
    message: success ? 'Dislike removido exitosamente' : 'No se pudo remover el dislike'
  });
});

  /**
   * Obtiene la cantidad de comentarios de un blog
   */
  static getBlogCommentCount = asyncErrorHandler(async (req, res) => {
    const blogId = req.params.blogId;
    
    try {
      // Obtener número de comentarios
      const commentCount = await CommentService.getBlogCommentCount(blogId);
      
      res.json({
        success: true,
        data: {
          blogId,
          commentCount
        }
      });
    } catch (error) {
      console.error(`Error al obtener comentarios para blog ${blogId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener cantidad de comentarios',
        data: {
          blogId,
          commentCount: 0
        }
      });
    }
  });
}