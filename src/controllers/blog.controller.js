// src/controllers/blog.controller.js
import { BlogService } from '../services/blog.service.js';
import { azureStorageService } from '../services/azure-storage.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class BlogController {
  static getBlogs = asyncErrorHandler(async (req, res) => {
    const filters = {
      category: req.query.category,
      search: req.query.search,
      author_id: req.query.author_id,
      limit: req.query.limit,
      offset: req.query.offset,
      featured: req.query.featured !== undefined ? req.query.featured === 'true' : undefined
    };

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
          imageUrl,
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