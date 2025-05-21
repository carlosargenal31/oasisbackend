// src/controllers/blog.controller.js

import { BlogService } from '../services/blog.service.js';
import { azureStorageService } from '../services/azure-storage.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';
import { mysqlPool } from '../config/database.js';
import { Blog } from '../models/mysql/blog.model.js';

export class BlogController {
  // Método getBlogs mejorado para manejar la visualización de blogs activos/inactivos
static getBlogs = asyncErrorHandler(async (req, res) => {
  const filters = {
    category: req.query.category,
    search: req.query.search,
    author_id: req.query.author_id,
    limit: req.query.limit,
    offset: req.query.offset,
    featured: req.query.featured !== undefined ? req.query.featured === 'true' : undefined
  };

  // Verificar si es una solicitud autenticada de un administrador
  let isAdmin = false;
  if (req.userId) {
    const connection = await mysqlPool.getConnection();
    try {
      const [userRows] = await connection.query('SELECT role FROM users WHERE id = ?', [req.userId]);
      isAdmin = userRows.length > 0 && userRows[0].role === 'admin';
      connection.release();
    } catch (error) {
      console.error('Error verificando rol de usuario:', error);
    }
  }
  
  // Si no es administrador o no está explícitamente solicitando blogs inactivos,
  // añadir el filtro para mostrar solo blogs activos
  if (!isAdmin || req.query.active === undefined) {
    // Para solicitudes públicas o no de administrador, mostrar solo activos por defecto
    filters.active = true;
  } else if (req.query.active !== undefined) {
    // Si el admin solicita blogs explícitamente por su estado activo
    filters.active = req.query.active === 'true';
  }
  // Si es admin y no especifica filtro, no agregar filtro de active para mostrar todos

  const result = await BlogService.getBlogs(filters);
  
  res.json({
    success: true,
    data: {
      blogs: result.blogs,
      total: result.total,
      page: result.page,
      limit: result.limit
    }
  });
});

  static getFeaturedBlogs = asyncErrorHandler(async (req, res) => {
    const limit = req.query.limit || 2;
    const blogs = await BlogService.getFeaturedBlogs(limit);
    
    res.json({
      success: true,
      data: blogs
    });
  });

  static getBlog = asyncErrorHandler(async (req, res) => {
    const blog = await BlogService.getBlogById(req.params.id);
    
    res.json({
      success: true,
      data: blog
    });
  });

  static createBlog = asyncErrorHandler(async (req, res) => {
    const blogId = await BlogService.createBlog(req.body, req.userId);
    
    res.status(201).json({
      success: true,
      data: {
        blogId,
        message: 'Blog creado exitosamente'
      }
    });
  });

  static updateBlog = asyncErrorHandler(async (req, res) => {
    await BlogService.updateBlog(
      req.params.id,
      req.body,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Blog actualizado exitosamente'
    });
  });

  static deleteBlog = asyncErrorHandler(async (req, res) => {
    await BlogService.deleteBlog(
      req.params.id,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Blog eliminado exitosamente'
    });
  });
  
  static getCategories = asyncErrorHandler(async (req, res) => {
    const categories = await BlogService.getBlogCategories();
    
    res.json({
      success: true,
      data: categories
    });
  });
  
  static getBlogsByAuthor = asyncErrorHandler(async (req, res) => {
    const { authorId } = req.params;
    const limit = req.query.limit || 10;
    
    const blogs = await BlogService.getBlogsByAuthor(authorId, limit);
    
    res.json({
      success: true,
      data: blogs
    });
  });
  // Método específico para el panel de administración que devuelve todos los blogs
// Implementación correcta de getAdminBlogs para src/controllers/blog.controller.js

// Método específico para el panel de administración que devuelve todos los blogs
// Método específico para el panel de administración que devuelve todos los blogs
static getAdminBlogs = asyncErrorHandler(async (req, res) => {
  // Verificar si el usuario es administrador
  const connection = await mysqlPool.getConnection();
  try {
    const [userRows] = await connection.query('SELECT role FROM users WHERE id = ?', [req.userId]);
    const isAdmin = userRows.length > 0 && userRows[0].role === 'admin';
    connection.release();
    
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'No tiene permisos para acceder a esta función'
      });
    }
    
    // Preparar filtros, pero no incluir active por defecto para ver todos los blogs
    const filters = {
      category: req.query.category,
      search: req.query.search,
      author_id: req.query.author_id,
      limit: req.query.limit || 100, // Default a 100 para mostrar muchos blogs
      offset: req.query.offset || 0,
      featured: req.query.featured !== undefined ? req.query.featured === 'true' : undefined
    };
    
    // Solo si se proporciona explícitamente un filtro de active, aplicarlo
    if (req.query.active !== undefined) {
      filters.active = req.query.active === 'true';
    }
    
    // Obtener blogs con los filtros proporcionados
    const blogs = await Blog.findAll(filters);
    
    // Obtener el total de blogs con los mismos filtros (sin paginación)
    const total = await Blog.count(filters);
    
    res.json({
      success: true,
      data: {
        blogs,
        total,
        page: filters.offset ? Math.floor(filters.offset / filters.limit) + 1 : 1,
        limit: filters.limit
      }
    });
  } catch (error) {
    console.error('Error getting admin blogs:', error);
    if (connection) {
      connection.release();
    }
    throw error;
  }
});
 

// Controlador para actualizar la imagen de un blog
static updateBlogImage = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { image_url } = req.body;
  
  if (!image_url) {
    return res.status(400).json({
      success: false,
      message: 'URL de imagen es requerida'
    });
  }
  
  try {
    // Buscar el blog para verificar permisos
    const blog = await Blog.findById(id);
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog no encontrado'
      });
    }
    
    // Verificar si el usuario es el autor o es admin
    const connection = await mysqlPool.getConnection();
    
    try {
      const [userRows] = await connection.query('SELECT role FROM users WHERE id = ?', [req.userId]);
      const isAdmin = userRows.length > 0 && userRows[0].role === 'admin';
      
      if (blog.author_id !== parseInt(req.userId) && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'No autorizado para actualizar este blog'
        });
      }
      
      // Actualizar solo el campo de imagen
      await connection.query(
        'UPDATE blogs SET image_url = ? WHERE id = ?',
        [image_url, id]
      );
      
      connection.release();
      
      res.json({
        success: true,
        message: 'Imagen del blog actualizada exitosamente'
      });
    } catch (error) {
      if (connection) connection.release();
      throw error;
    }
  } catch (error) {
    console.error('Error al actualizar imagen del blog:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la imagen del blog'
    });
  }
});

// Modificación de uploadBlogImage para devolver la URL en el formato correcto
static uploadBlogImage = asyncErrorHandler(async (req, res) => {
  try {
    // Verificar si hay imagen en la solicitud
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha proporcionado ninguna imagen'
      });
    }
    
    // El archivo está disponible en req.file gracias a multer
    const imageFile = req.file;
    
    // Subir la imagen a Azure Blob Storage o tu servicio de almacenamiento
    const imageUrl = await azureStorageService.uploadImage(imageFile, `blog-${Date.now()}`);
    
    res.json({
      success: true,
      data: {
        url: imageUrl,
        message: 'Imagen subida exitosamente'
      }
    });
  } catch (error) {
    console.error('Error en uploadBlogImage:', error);
    res.status(500).json({
      success: false,
      message: 'Error al procesar la imagen: ' + (error.message || 'Error desconocido')
    });
  }
});
// Añadir al final de src/controllers/blog.controller.js
static updateBlogStatus = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  
  if (active === undefined) {
    return res.status(400).json({
      success: false,
      message: 'El campo active es requerido'
    });
  }
  
  await BlogService.updateBlogStatus(id, active, req.userId);
  
  res.json({
    success: true,
    message: `Blog ${active ? 'activado' : 'desactivado'} exitosamente`
  });
});
  // src/controllers/blog.controller.js - Actualizar el método updateFeaturedStatus
static updateFeaturedStatus = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { is_featured } = req.body;
  
  if (is_featured === undefined) {
    return res.status(400).json({
      success: false,
      message: 'El campo is_featured es requerido'
    });
  }
  
  await BlogService.updateFeaturedStatus(id, is_featured, req.userId);
  
  res.json({
    success: true,
    message: `Blog ${is_featured ? 'marcado como destacado' : 'desmarcado como destacado'} exitosamente`
  });
});
}



// Al final de blog.controller.js
export const uploadBlogImage = BlogController.uploadBlogImage;