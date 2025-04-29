// src/controllers/booking.controller.js
import bookingService from '../services/booking.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class BookingController {
  /**
   * Crear una nueva reserva
   */
  static createBooking = asyncErrorHandler(async (req, res) => {
    try {
      console.log('Datos de reserva recibidos:', req.body);
      
      // Obtener user_id
      let userId = null;
      
      if (req.body.user_id) {
        userId = req.body.user_id;
        console.log('User ID obtenido del cuerpo de la petición:', userId);
      } else if (req.userId) {
        userId = req.userId;
        console.log('User ID obtenido del middleware de autenticación:', userId);
      } else {
        console.log('No se proporcionó User ID, se tratará como una reserva de invitado');
      }
      
      // Map incoming frontend data to match the expected format in service
      const bookingData = {
        propertyId: req.body.property_id,
        startDate: req.body.check_in_date,
        endDate: req.body.check_out_date,
        guests: req.body.guests || 1,
        totalPrice: req.body.total_price,
        specialRequests: req.body.special_requests,
        // Guest information
        guestName: req.body.guest_name,
        guestEmail: req.body.guest_email,
        guestPhone: req.body.guest_phone,
        // Usar el userId que hemos obtenido
        userId: userId
      };
      
      console.log('Datos de reserva procesados:', bookingData);
      
      // Verificar disponibilidad primero
      const isAvailable = await bookingService.checkAvailability(
        bookingData.propertyId,
        bookingData.startDate,
        bookingData.endDate
      );
      
      if (!isAvailable) {
        return res.status(409).json({
          success: false,
          message: 'La propiedad no está disponible para las fechas seleccionadas. Por favor, elija otras fechas.',
          errorCode: 'PROPERTY_UNAVAILABLE'
        });
      }
      
      // Crear la reserva solo si la propiedad está disponible
      const booking = await bookingService.create(bookingData, userId);
      
      res.status(201).json({
        success: true,
        data: {
          bookingId: booking.id,
          message: 'Reserva creada exitosamente'
        }
      });
    } catch (error) {
      console.error('Error in BookingController.createBooking:', error);
      
      // Return appropriate error response based on error type
      if (error.name === 'ValidationError') {
        res.status(400).json({
          success: false,
          message: error.message,
          fields: error.fields
        });
      } else if (error.name === 'ConflictError') {
        res.status(409).json({
          success: false,
          message: error.message,
          errorCode: 'CONFLICT_ERROR'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Error al crear la reserva',
          error: process.env.NODE_ENV === 'production' ? null : error.message
        });
      }
    }
  });

  /**
   * Obtener listado de reservas con filtros
   */
  static getBookings = asyncErrorHandler(async (req, res) => {
    try {
      // Extraer parámetros de la consulta
      const { 
        status, 
        property_id, 
        user_id, 
        page = 1, 
        limit = 10 
      } = req.query;
      
      // Preparar filtros
      const filters = {};
      
      // Añadir filtros si existen
      if (status) {
        if (Array.isArray(status)) {
          filters.status = status;
        } else {
          filters.status = [status];
        }
      }
      
      if (property_id) {
        filters.propertyId = property_id;
      }
      
      if (user_id) {
        filters.userId = user_id;
      }
      
      // Configurar paginación
      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit)
      };
      
      console.log('Buscando reservas con filtros:', filters);
      console.log('Paginación:', pagination);
      
      // Obtener reservas a través del servicio
      const result = await bookingService.find(filters, pagination);
      
      // Devolver respuesta
      res.json({
        success: true,
        data: {
          bookings: result.bookings || [],
          total: result.total || 0,
          page: pagination.page,
          limit: pagination.limit,
          totalPages: Math.ceil((result.total || 0) / pagination.limit)
        }
      });
    } catch (error) {
      console.error('Error obteniendo reservas:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las reservas',
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });

  /**
   * Obtener una reserva por ID con detalles
   */
  static getBooking = asyncErrorHandler(async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`Solicitando datos de la reserva #${id}`);
      
      // Validar que el ID tenga formato correcto
      if (!id || (isNaN(parseInt(id)) && !id.startsWith('temp-'))) {
        return res.status(400).json({
          success: false,
          message: 'ID de reserva inválido'
        });
      }
      
      // Si es un ID temporal, devolver una estructura básica
      if (id.startsWith('temp-')) {
        console.log(`ID temporal ${id}, devolviendo estructura básica`);
        
        const tempBooking = {
          id: id,
          property_id: req.query.propertyId || null,
          guest_name: 'Cliente temporal',
          guest_email: '',
          check_in_date: req.query.checkIn || new Date().toISOString().split('T')[0],
          check_out_date: req.query.checkOut || new Date().toISOString().split('T')[0],
          guests: req.query.guests || 1,
          total_price: req.query.amount || 0,
          status: 'pending'
        };
        
        return res.json({
          success: true,
          data: tempBooking
        });
      }
      
      // Intentar buscar la reserva en la base de datos
      try {
        const booking = await bookingService.findById(parseInt(id));
        
        if (!booking) {
          return res.status(404).json({
            success: false,
            message: 'Reserva no encontrada'
          });
        }
        
        return res.json({
          success: true,
          data: booking
        });
      } catch (dbError) {
        console.error(`Error al consultar la reserva #${id} en la base de datos:`, dbError);
        return res.status(500).json({
          success: false,
          message: 'Error al consultar la base de datos',
          error: process.env.NODE_ENV === 'production' ? null : dbError.message
        });
      }
    } catch (error) {
      console.error(`Error general al obtener la reserva #${req.params.id}:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });

  /**
   * Actualizar el estado de una reserva
   */
  static updateBookingStatus = asyncErrorHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!id || !status) {
        return res.status(400).json({
          success: false,
          message: 'ID de reserva y estado son requeridos'
        });
      }
      
      // Obtener userId del middleware de autenticación
      const userId = req.userId;
      
      // Actualizar estado de la reserva
      const updatedBooking = await bookingService.updateStatus(parseInt(id), status, userId);
      
      res.json({
        success: true,
        data: updatedBooking,
        message: 'Estado de la reserva actualizado exitosamente'
      });
    } catch (error) {
      console.error(`Error al actualizar estado de reserva:`, error);
      
      // Determinar el código de estado apropiado
      let statusCode = 500;
      if (error.name === 'ValidationError') {
        statusCode = 400;
      } else if (error.name === 'NotFoundError') {
        statusCode = 404;
      } else if (error.name === 'AuthorizationError') {
        statusCode = 403;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });
  
  /**
   * Cancelar una reserva
   */
  static cancelBooking = asyncErrorHandler(async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validar ID
      if (!id || (isNaN(parseInt(id)) && !id.startsWith('temp-'))) {
        return res.status(400).json({
          success: false,
          message: 'ID de reserva inválido'
        });
      }
      
      // Si es un ID temporal, simplemente devolver éxito
      if (id.startsWith('temp-')) {
        return res.json({
          success: true,
          message: 'No se requiere cancelación'
        });
      }
      
      console.log(`Cancelando reserva #${id}`);
      
      // Obtener ID de usuario del middleware de autenticación
      const userId = req.userId;
      
      // Cancelar la reserva
      await bookingService.cancelBooking(parseInt(id), userId);
      
      res.json({
        success: true,
        message: 'Reserva cancelada exitosamente'
      });
    } catch (error) {
      console.error(`Error al cancelar reserva:`, error);
      
      // Determinar el código de estado apropiado
      let statusCode = 500;
      let message = 'Error al cancelar la reserva';
      
      if (error.name === 'ValidationError') {
        statusCode = 400;
        message = error.message;
      } else if (error.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Reserva no encontrada';
      } else if (error.name === 'AuthorizationError') {
        statusCode = 403;
        message = 'No tienes permiso para cancelar esta reserva';
      }
      
      res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });

  /**
   * Cancelar reservas pendientes expiradas (utilizada por cron jobs)
   */
  static cancelExpiredBookings = asyncErrorHandler(async (req, res) => {
    try {
      // Tiempo en minutos después del cual se considera que una reserva ha expirado
      const timeoutMinutes = req.query.timeout ? parseInt(req.query.timeout) : 30;
      
      // Llamar al servicio para cancelar reservas pendientes expiradas
      const cancelledCount = await bookingService.cancelExpiredBookings(timeoutMinutes);
      
      res.json({
        success: true,
        data: {
          cancelledCount,
          message: `Se cancelaron ${cancelledCount} reservas pendientes expiradas`
        }
      });
    } catch (error) {
      console.error('Error al cancelar reservas pendientes expiradas:', error);
      
      res.status(500).json({
        success: false,
        message: 'Error al cancelar reservas pendientes expiradas',
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });
  
  /**
   * Cancelar múltiples reservas (batch cancellation)
   */
  static batchCancelBookings = asyncErrorHandler(async (req, res) => {
    try {
      const { bookingIds } = req.body;
      
      if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un array de IDs de reservas'
        });
      }
      
      // Obtener ID de usuario del middleware de autenticación
      const userId = req.userId;
      
      // Validar que todos los IDs sean válidos
      const validIds = bookingIds.filter(id => !isNaN(parseInt(id)));
      
      if (validIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No hay IDs de reserva válidos'
        });
      }
      
      // Convertir todos los IDs a enteros
      const parsedIds = validIds.map(id => parseInt(id));
      
      // Cancelar las reservas
      const results = await Promise.allSettled(
        parsedIds.map(id => bookingService.cancelBooking(id, userId))
      );
      
      // Contar éxitos y fallos
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      res.json({
        success: true,
        data: {
          total: parsedIds.length,
          succeeded,
          failed,
          message: `Se cancelaron ${succeeded} reservas con éxito, fallaron ${failed} cancelaciones`
        }
      });
    } catch (error) {
      console.error('Error en cancelación masiva de reservas:', error);
      
      res.status(500).json({
        success: false,
        message: 'Error al procesar la cancelación masiva de reservas',
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });
}

export default BookingController;