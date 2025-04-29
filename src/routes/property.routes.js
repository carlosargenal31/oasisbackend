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

// Rutas públicas
router.get('/', PropertyController.getProperties);
router.get('/search', PropertyController.searchProperties);
router.get('/featured', PropertyController.getFeaturedProperties);
router.get('/recent', PropertyController.getRecentProperties);
router.get('/stats', PropertyController.getPropertyStats);
router.get('/:id', PropertyController.getProperty);
router.post('/:id/view', PropertyController.incrementPropertyViews); // Ruta para contador de vistas

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

// Ruta para obtener propiedades archivadas del usuario
router.get('/user/archived', authenticate, PropertyController.getArchivedProperties);

// Rutas para imágenes
router.post('/:id/images', authenticate, upload.single('image'), PropertyController.addPropertyImage);

export default router;