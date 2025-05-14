// src/routes/property.routes.js
import express from 'express';
import multer from 'multer';
import { PropertyController } from '../controllers/property.controller.js';
import { validatePropertyData } from '../middleware/property.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

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

// Rutas públicas - IMPORTANTE: Las rutas específicas deben ir ANTES de /:id
router.get('/', PropertyController.getProperties);
router.get('/all', PropertyController.getAllProperties);
router.get('/search', PropertyController.searchProperties);
router.get('/featured', PropertyController.getFeaturedProperties);
router.get('/recent', PropertyController.getRecentProperties);
router.get('/popular', PropertyController.getPopularProperties);
router.get('/stats', PropertyController.getPropertyStats);

// Agregar las rutas de categorías
router.get('/categories', PropertyController.getMainCategories);
router.get('/categories/featured', PropertyController.getMainFeaturedCategories);
router.get('/categories/:category', PropertyController.getPropertiesByCategory);

router.get('/user/archived', authenticate, PropertyController.getArchivedProperties);
router.get('/host/stats/:hostId?', authenticate, PropertyController.getHostStats);

// Estas rutas deben estar después de todas las rutas específicas
router.get('/:id', PropertyController.getProperty);
router.get('/:id/similar', PropertyController.getSimilarProperties);
router.post('/:id/view', PropertyController.incrementPropertyViews);

// Rutas protegidas
router.post('/', authenticate, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'additional_images', maxCount: 10 }
]), validatePropertyData, PropertyController.createProperty);
router.put('/:id', authenticate, upload.single('image'), validatePropertyData, PropertyController.updateProperty);
router.delete('/:id', authenticate, PropertyController.deleteProperty);

// Rutas para archivar/restaurar propiedades (protegidas)
router.patch('/:id/archive', authenticate, PropertyController.archiveProperty);
router.patch('/:id/restore', authenticate, PropertyController.restoreProperty);
router.delete('/:id/soft', authenticate, PropertyController.softDeleteProperty);

// Rutas para imágenes
router.post('/:id/images', authenticate, upload.single('image'), PropertyController.addPropertyImage);

// Rutas para funcionalidades administrativas
router.patch('/:id/featured', authenticate, PropertyController.toggleFeatured);
router.patch('/:id/verified', authenticate, PropertyController.toggleVerified);
router.post('/bulk-update', authenticate, PropertyController.bulkUpdateStatus);

export default router;