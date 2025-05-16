// src/routes/event.routes.js
import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import { EventController, uploadEventImage } from '../controllers/event.controller.js';
import { validateEventData } from '../middleware/event.middleware.js';

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
router.get('/', EventController.getEvents);
router.get('/featured', EventController.getFeaturedEvents);
router.get('/home', EventController.getHomeEvents);
router.get('/upcoming', EventController.getUpcomingEvents);
router.get('/types', EventController.getEventTypes);
router.get('/:id', EventController.getEvent);
router.get('/creator/:creatorId', EventController.getEventsByCreator);

// Rutas protegidas (requieren autenticación)
router.post('/', authenticate, validateEventData, EventController.createEvent);
router.put('/:id', authenticate, validateEventData, EventController.updateEvent);
router.delete('/:id', authenticate, EventController.deleteEvent);
router.post('/image', authenticate, upload.single('image'), uploadEventImage);
router.put('/:id/featured', authenticate, EventController.updateFeaturedStatus);
router.put('/:id/home', authenticate, EventController.updateHomeStatus);
router.put('/:id/status', authenticate, EventController.updateEventStatus);

export default router;