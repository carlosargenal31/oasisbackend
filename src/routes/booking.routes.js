// src/routes/booking.routes.js
import express from 'express';
import { BookingController } from '../controllers/booking.controller.js';
import { 
  validateBookingData, 
  validateBookingStatus,
  validateCancelBooking 
} from '../middleware/booking.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Log para debugging - asegúrate de que las rutas se están registrando
console.log('Registrando rutas de booking...');

// Rutas públicas (no requieren autenticación)
router.get('/public/:id', BookingController.getBooking);

// Rutas protegidas (requieren autenticación)
router.get('/', authenticate, BookingController.getBookings);
router.post('/', authenticate, validateBookingData, BookingController.createBooking);
router.get('/pending-confirmations', authenticate, BookingController.getPendingConfirmations);
router.get('/:id', authenticate, BookingController.getBooking);
router.put('/:id/status', authenticate, validateBookingStatus, BookingController.updateBookingStatus);
router.patch('/:id/cancel', authenticate, validateCancelBooking, BookingController.cancelBooking);
router.patch('/:bookingId/confirm-payment', authenticate, BookingController.confirmPayment);
router.post('/batch-cancel', authenticate, BookingController.batchCancelBookings);

// Ruta para cron job (podría protegerse con una clave API)
router.post('/cancel-expired', BookingController.cancelExpiredBookings);

console.log('Rutas de booking registradas correctamente');

export default router;