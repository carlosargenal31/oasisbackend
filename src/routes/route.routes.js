
// src/routes/route.routes.js
import express from 'express';
import { RouteController } from '../controllers/route.controller.js';

const router = express.Router();

// Ruta para geocodificar una dirección
router.get('/geocode', RouteController.geocodeAddress);

// Ruta para calcular una ruta entre dos puntos
router.get('/calculate', RouteController.calculateRoute);

export default router;