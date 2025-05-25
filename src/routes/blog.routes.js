// Modificación para src/routes/blog.routes.js

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

// IMPORTANTE: Primero definir rutas específicas antes de las rutas paramétrizadas

// Rutas públicas específicas (sin parámetros variables)
router.get('/', BlogController.getBlogs);
router.get('/featured', BlogController.getFeaturedBlogs);
router.get('/categories', BlogController.getCategories);

// Nueva ruta específica para panel de administrador (debe ir ANTES de /:id)
router.get('/admin', authenticate, BlogController.getAdminBlogs);

// Rutas para operaciones específicas
router.post('/image', authenticate, upload.single('image'), uploadBlogImage);

// Rutas con parámetros variables
router.get('/author/:authorId', BlogController.getBlogsByAuthor);
router.get('/:id', BlogController.getBlog); // Esta ruta debe ir después de las rutas específicas

// Rutas protegidas (requieren autenticación)
router.post('/', authenticate, validateBlogData, BlogController.createBlog);
router.put('/:id', authenticate, validateBlogData, BlogController.updateBlog);
router.delete('/:id', authenticate, BlogController.deleteBlog);
router.patch('/:id/featured', authenticate, BlogController.updateFeaturedStatus);
router.patch('/:id/status', authenticate, BlogController.updateBlogStatus);
// Ruta para actualizar sólo la imagen de un blog
router.patch('/:id/image', authenticate, BlogController.updateBlogImage);

// IMPORTANTE: Asegúrate de añadir esta ruta ANTES de la ruta /:id


// Ruta para actualizar sólo la imagen de un blog

export default router;