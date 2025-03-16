// src/controllers/booking.controller.js
import bookingService from '../services/booking.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class BookingController {
  static createBooking = asyncErrorHandler(async (req, res) => {
    const bookingData = {
      ...req.body,
      user_id: req.userId
    };
    const bookingId = await BookingService.createBooking(bookingData);
    res.status(201).json({
      success: true,
      data: {
        bookingId,
        message: 'Reserva creada exitosamente'
      }
    });
  });

  static getBookings = asyncErrorHandler(async (req, res) => {
    const filters = {
      status: req.query.status,
      property_id: req.query.property_id,
      guest_email: req.query.guest_email,
      user_id: req.userId
    };

    const bookings = await BookingService.getBookings(filters);
    res.json({
      success: true,
      data: bookings
    });
  });

  static getBooking = asyncErrorHandler(async (req, res) => {
    const booking = await BookingService.getBookingById(req.params.id, req.userId);
    res.json({
      success: true,
      data: booking
    });
  });

  static updateBookingStatus = asyncErrorHandler(async (req, res) => {
    await BookingService.updateBookingStatus(req.params.id, req.body.status, req.userId);
    res.json({
      success: true,
      message: 'Estado de la reserva actualizado exitosamente'
    });
  });
  
  static cancelBooking = asyncErrorHandler(async (req, res) => {
    await BookingService.cancelBooking(req.params.id, req.userId);
    res.json({
      success: true,
      message: 'Reserva cancelada exitosamente'
    });
  });
}