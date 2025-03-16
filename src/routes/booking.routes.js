// src/routes/booking.routes.js
import express from 'express';
import { BookingController } from '../controllers/booking.controller.js';
import { validateBookingData, validateBookingStatus } from '../middleware/booking.middleware.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protected routes
router.get('/', authenticate, BookingController.getBookings);
router.get('/:id', authenticate, BookingController.getBooking);
router.post('/', authenticate, validateBookingData, BookingController.createBooking);
router.put('/:id/status', authenticate, authorize(['admin', 'host']), validateBookingStatus, BookingController.updateBookingStatus);
router.patch('/:id/cancel', authenticate, BookingController.cancelBooking);

export default router;