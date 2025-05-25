// src/routes/admin.routes.js
import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/admin.middleware.js';

// Controladores
import { PropertyController } from '../controllers/property.controller.js';
import { EventController } from '../controllers/event.controller.js';
import { BlogController } from '../controllers/blog.controller.js';

const router = express.Router();

// Aplicar middleware de autenticación y admin a todas las rutas
router.use(authenticate, adminOnly);

// Rutas para gestionar propiedades/negocios
router.get('/businesses', PropertyController.getAllProperties);
router.post('/businesses', PropertyController.createProperty);
router.put('/businesses/:id', PropertyController.updateProperty);
router.delete('/businesses/:id', PropertyController.deleteProperty);

// Rutas para gestionar eventos
router.get('/events', EventController.getEvents);
router.post('/events', EventController.createEvent);
router.put('/events/:id', EventController.updateEvent);
router.delete('/events/:id', EventController.deleteEvent);
router.put('/events/:id/status', EventController.updateEventStatus);

// Rutas para gestionar blogs
router.get('/blogs', BlogController.getBlogs);
router.post('/blogs', BlogController.createBlog);
router.put('/blogs/:id', BlogController.updateBlog);
router.delete('/blogs/:id', BlogController.deleteBlog);
router.put('/blogs/:id/featured', BlogController.updateFeaturedStatus);

export default router;