import { CommentService } from '../services/comment.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';
import { mysqlPool } from '../config/database.js';

export class CommentController {
  /**
   * Crea un nuevo comentario
   */
  static createComment = asyncErrorHandler(async (req, res) => {
    // Extraer datos de la solicitud
    const { blog_id, content, user_id } = req.body;
    
    // El userId está disponible del middleware o del cuerpo de la solicitud
    const userId = req.userId || user_id;
    
    // Validaciones básicas
    if (!blog_id || !content || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Datos de comentario incompletos',
        missingFields: !blog_id ? 'blog_id' : (!content ? 'content' : 'user_id')
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
      
      // Usar nombre del cuerpo si se proporciona o el nombre de la BD
      const userName = req.body.name || `${user.first_name} ${user.last_name}`.trim();
      
      // Crear el comentario con los datos del usuario
      const commentId = await CommentService.createComment({
        blog_id: parseInt(blog_id),
        user_id: userId,
        name: userName,
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
    // Obtener userId del middleware o del cuerpo de la solicitud
    const userId = req.userId || req.body.user_id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido para actualizar el comentario'
      });
    }
    
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
    // Obtener userId del middleware o del cuerpo de la solicitud
    const userId = req.userId || req.body.user_id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido para eliminar el comentario'
      });
    }
    
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
    // Ver si hay un userId en el cuerpo para seguimiento (opcional)
    if (req.body.user_id) {
      // Aquí podrías implementar una función para rastrear qué usuario dio like
      console.log(`Usuario ${req.body.user_id} dio like al comentario ${req.params.id}`);
    }
    
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
    // Ver si hay un userId en el cuerpo para seguimiento (opcional)
    if (req.body.user_id) {
      // Aquí podrías implementar una función para rastrear qué usuario dio dislike
      console.log(`Usuario ${req.body.user_id} dio dislike al comentario ${req.params.id}`);
    }
    
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
    // Ver si hay un userId en el cuerpo para seguimiento (opcional)
    if (req.body.user_id) {
      // Aquí podrías implementar una función para rastrear qué usuario quitó el like
      console.log(`Usuario ${req.body.user_id} quitó like al comentario ${req.params.id}`);
    }
    
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
    // Ver si hay un userId en el cuerpo para seguimiento (opcional)
    if (req.body.user_id) {
      // Aquí podrías implementar una función para rastrear qué usuario quitó el dislike
      console.log(`Usuario ${req.body.user_id} quitó dislike al comentario ${req.params.id}`);
    }
    
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