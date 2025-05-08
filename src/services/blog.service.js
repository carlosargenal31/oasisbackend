// src/services/blog.service.js
import { mysqlPool } from '../config/database.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  AuthorizationError 
} from '../utils/errors/index.js';

// Importar el modelo Blog
import { Blog } from '../models/mysql/blog.model.js';

export class BlogService {
  static async createBlog(blogData, userId) {
    // Validaciones iniciales
    if (!blogData.title || !blogData.category || !blogData.content) {
      throw new ValidationError('Datos de blog incompletos', [
        'title',
        'category',
        'content'
      ]);
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Crear el blog
      const blogId = await Blog.create({
        ...blogData,
        author_id: userId,
        is_featured: blogData.is_featured || false
      });

      return blogId;
    } catch (error) {
      console.error('Error creating blog:', error);
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Error al crear el blog');
    } finally {
      connection.release();
    }
  }

  static async getBlogs(filters = {}) {
    try {
      // Obtener blogs con los filtros proporcionados
      const blogs = await Blog.findAll(filters);
      
      // Obtener el total de blogs con los mismos filtros (sin paginación)
      const total = await Blog.count(filters);
      
      return {
        blogs,
        total,
        page: filters.offset ? Math.floor(filters.offset / filters.limit) + 1 : 1,
        limit: filters.limit ? parseInt(filters.limit) : blogs.length
      };
    } catch (error) {
      console.error('Error getting blogs:', error);
      throw new DatabaseError('Error al obtener los blogs');
    }
  }

  static async getFeaturedBlogs(limit = 2) {
    try {
      // Obtener blogs destacados
      const blogs = await Blog.getFeatured(limit);
      
      return blogs;
    } catch (error) {
      console.error('Error getting featured blogs:', error);
      throw new DatabaseError('Error al obtener los blogs destacados');
    }
  }

  static async getBlogById(id) {
    if (!id) {
      throw new ValidationError('ID de blog es requerido');
    }

    try {
      const blog = await Blog.findById(id);
      
      if (!blog) {
        throw new NotFoundError('Blog no encontrado');
      }
      
      return blog;
    } catch (error) {
      console.error('Error getting blog:', error);
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Error al obtener el blog');
    }
  }

  static async updateBlog(id, blogData, userId) {
    if (!id) {
      throw new ValidationError('ID de blog es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si el blog existe
      const blog = await Blog.findById(id);
      
      if (!blog) {
        throw new NotFoundError('Blog no encontrado');
      }
      
      // Verificar autorización - solo el autor puede actualizar
      if (blog.author_id !== parseInt(userId)) {
        throw new AuthorizationError('No autorizado para actualizar este blog');
      }

      // Actualizar blog
      const updated = await Blog.update(id, blogData);
      
      return updated;
    } catch (error) {
      console.error('Error updating blog:', error);
      if (error instanceof ValidationError || 
          error instanceof NotFoundError || 
          error instanceof AuthorizationError) {
        throw error;
      }
      throw new DatabaseError('Error al actualizar el blog');
    } finally {
      connection.release();
    }
  }

  static async deleteBlog(id, userId) {
    if (!id) {
      throw new ValidationError('ID de blog es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si el blog existe
      const blog = await Blog.findById(id);
      
      if (!blog) {
        throw new NotFoundError('Blog no encontrado');
      }
      
      // Verificar autorización - solo el autor puede eliminar
      if (blog.author_id !== parseInt(userId)) {
        throw new AuthorizationError('No autorizado para eliminar este blog');
      }

      // Eliminar blog
      const deleted = await Blog.delete(id);
      
      return deleted;
    } catch (error) {
      console.error('Error deleting blog:', error);
      if (error instanceof ValidationError || 
          error instanceof NotFoundError ||
          error instanceof AuthorizationError) {
        throw error;
      }
      throw new DatabaseError('Error al eliminar el blog');
    } finally {
      connection.release();
    }
  }
  
  static async getBlogCategories() {
    try {
      const categories = await Blog.getCategories();
      return categories;
    } catch (error) {
      console.error('Error getting blog categories:', error);
      throw new DatabaseError('Error al obtener las categorías de blog');
    }
  }
  
  static async getBlogsByAuthor(authorId, limit = 10) {
    if (!authorId) {
      throw new ValidationError('ID de autor es requerido');
    }
    
    try {
      const blogs = await Blog.findAll({
        author_id: authorId,
        limit: limit
      });
      
      return blogs;
    } catch (error) {
      console.error('Error getting blogs by author:', error);
      throw new DatabaseError('Error al obtener los blogs del autor');
    }
  }

  static async updateFeaturedStatus(id, isFeatured, userId) {
    if (!id) {
      throw new ValidationError('ID de blog es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si el blog existe
      const blog = await Blog.findById(id);
      
      if (!blog) {
        throw new NotFoundError('Blog no encontrado');
      }
      
      // Verificar autorización - solo el autor puede cambiar el estado destacado
      if (blog.author_id !== parseInt(userId)) {
        throw new AuthorizationError('No autorizado para actualizar este blog');
      }

      // Actualizar estado destacado
      const updated = await Blog.updateFeaturedStatus(id, isFeatured);
      
      return updated;
    } catch (error) {
      console.error('Error updating featured status:', error);
      if (error instanceof ValidationError || 
          error instanceof NotFoundError || 
          error instanceof AuthorizationError) {
        throw error;
      }
      throw new DatabaseError('Error al actualizar el estado destacado del blog');
    } finally {
      connection.release();
    }
  }
}