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
router.get('/all', PropertyController.getAllProperties);
router.get('/search', PropertyController.searchProperties);
router.get('/featured', PropertyController.getFeaturedProperties);
router.get('/recent', PropertyController.getRecentProperties);
router.get('/popular', PropertyController.getPopularProperties); // Nueva ruta para propiedades más vistas
router.get('/stats', PropertyController.getPropertyStats);
router.get('/user/archived', authenticate, PropertyController.getArchivedProperties); // Mover antes de /:id para evitar conflictos
router.get('/:id', PropertyController.getProperty);
router.get('/:id/similar', PropertyController.getSimilarProperties); // Nueva ruta para propiedades similares
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

// Estadísticas del anfitrión
router.get('/host/stats/:hostId?', authenticate, PropertyController.getHostStats); // Nueva ruta para estadísticas del anfitrión

// Rutas para imágenes
router.post('/:id/images', authenticate, upload.single('image'), PropertyController.addPropertyImage);

// Rutas para funcionalidades administrativas (se puede agregar middleware isAdmin si es necesario)
router.patch('/:id/featured', authenticate, PropertyController.toggleFeatured); // Destacar/quitar destacado
router.patch('/:id/verified', authenticate, PropertyController.toggleVerified); // Verificar/quitar verificación 
router.post('/bulk-update', authenticate, PropertyController.bulkUpdateStatus); // Actualización masiva de estado

export default router;