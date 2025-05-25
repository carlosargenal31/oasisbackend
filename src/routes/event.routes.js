// src/routes/event.routes.js
import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import { EventController, uploadEventImageFunction } from '../controllers/event.controller.js';
import { validateEventData } from '../middleware/event.middleware.js';
import { asyncErrorHandler } from '../utils/errors/index.js';
import { Event } from '../models/mysql/event.model.js';

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

// IMPORTANTE: Ordenar las rutas - rutas específicas primero, luego las que tienen parámetros
// Ruta específica para el panel de admin
router.get('/admin', authenticate, EventController.getAdminEvents);

// Rutas específicas
router.get('/featured', EventController.getFeaturedEvents);
router.get('/upcoming', EventController.getUpcomingEvents);
router.get('/types', EventController.getEventTypes);
router.post('/image', authenticate, upload.single('image'), EventController.uploadEventImage);

// Ruta especial SOLO para actualizar la URL de la imagen
router.patch('/:id/image', authenticate, asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  const { image_url } = req.body;
  
  if (!image_url) {
    return res.status(400).json({
      success: false,
      message: 'La URL de la imagen es requerida'
    });
  }
  
  try {
    // Verificar si el evento existe
    const event = await Event.findById(id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Evento no encontrado'
      });
    }
    
    // Actualizar solo la URL de la imagen
    const updated = await Event.update(id, { image_url });
    
    if (updated) {
      res.json({
        success: true,
        message: 'URL de imagen actualizada correctamente'
      });
    } else {
      throw new Error('No se pudo actualizar la URL de la imagen');
    }
  } catch (error) {
    console.error('Error al actualizar URL de imagen:', error);
    res.status(500).json({
      success: false,
      message: `Error al actualizar URL de imagen: ${error.message}`
    });
  }
}));

// Rutas con parámetros
router.get('/creator/:creatorId', EventController.getEventsByCreator);
router.get('/:id', EventController.getEvent);

// Rutas genéricas
router.get('/', EventController.getEvents);
router.post('/', authenticate, validateEventData, EventController.createEvent);

// Rutas de actualización
router.put('/:id', authenticate, validateEventData, EventController.updateEvent);
router.delete('/:id', authenticate, EventController.deleteEvent);
router.patch('/:id/featured', authenticate, EventController.updateFeaturedStatus);
router.patch('/:id/home', authenticate, EventController.updateHomeStatus);
router.patch('/:id/status', authenticate, EventController.updateEventStatus);

export default router;