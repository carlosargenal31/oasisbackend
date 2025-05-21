// src/routes/blog.routes.js
import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import { BlogController, uploadBlogImage } from '../controllers/blog.controller.js';
import { validateBlogData } from '../middleware/blog.middleware.js';

const router = express.Router();

// Configuración de multer para manejar imágenes
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
  fileFilter: (req, file, cb) => {
    // Aceptar solo imágenes
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'), false);
    }
  }
});

// Rutas públicas (no requieren autenticación)
router.get('/', BlogController.getBlogs);
router.get('/featured', BlogController.getFeaturedBlogs);
router.get('/categories', BlogController.getCategories);
router.get('/:id', BlogController.getBlog);
router.get('/author/:authorId', BlogController.getBlogsByAuthor);

// Rutas protegidas (requieren autenticación)
router.post('/', authenticate, validateBlogData, BlogController.createBlog);
router.put('/:id', authenticate, validateBlogData, BlogController.updateBlog);
router.delete('/:id', authenticate, BlogController.deleteBlog);
router.post('/image', authenticate, upload.single('image'), uploadBlogImage);
router.patch('/:id/featured', authenticate, BlogController.updateFeaturedStatus);
router.patch('/:id/status', authenticate, BlogController.updateBlogStatus);

export default router;