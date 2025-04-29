// src/services/payment.service.js
import { mysqlPool } from '../config/database.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  ConflictError,
  AuthorizationError 
} from '../utils/errors/index.js';

export class PaymentService {
  // Modificación para corregir el error en payment.service.js
// Añade esta función a la clase PaymentService

/**
 * Create payment for a booking
 * @param {Object} paymentData - Payment data including booking_id, amount, etc.
 * @returns {Promise<Object>} - Payment result with transaction ID
 */
static async createPayment(paymentData) {
  // Validar que todos los campos requeridos estén presentes
  if (!paymentData.booking_id || !paymentData.amount || !paymentData.payment_method) {
    console.error('Datos de pago incompletos:', paymentData);
    throw new Error('Datos de pago incompletos');
  }

  // Asegurarse de que booking_id sea un número
  let bookingId;
  
  // Manejo de IDs temporales vs IDs numéricos
  if (typeof paymentData.booking_id === 'string' && paymentData.booking_id.startsWith('temp-')) {
    // Es un ID temporal
    console.log('ID temporal detectado:', paymentData.booking_id);
    bookingId = paymentData.booking_id;
  } else {
    // Intentar convertir a número
    bookingId = parseInt(paymentData.booking_id);
    if (isNaN(bookingId)) {
      console.error('ID de reserva no válido:', paymentData.booking_id);
      throw new Error('ID de reserva no válido');
    }
  }
  
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    // Verificar si la reserva existe
    let bookingExists = false;
    let actualBookingId = bookingId;
    
    // Solo verificamos existencia si no es un ID temporal
    if (!String(bookingId).startsWith('temp-')) {
      try {
        const [booking] = await connection.query(
          'SELECT * FROM bookings WHERE id = ?',
          [bookingId]
        );
        
        bookingExists = booking.length > 0;
      } catch (error) {
        console.error('Error verificando la reserva:', error);
        bookingExists = false;
      }
    } else {
      bookingExists = false;
    }
    
    // Si la reserva no existe y es un ID temporal, la creamos
    if (!bookingExists) {
      console.log('Creando reserva para el pago');
      
      // Extraer datos de booking
      let guestName = 'Cliente';
      let guestEmail = 'cliente@example.com';
      let checkInDate = new Date();
      let checkOutDate = new Date();
      checkOutDate.setMonth(checkOutDate.getMonth() + 6); // + 6 meses por defecto
      
      // Intentar obtener datos del detalle del pago
      try {
        if (paymentData.details) {
          const details = typeof paymentData.details === 'string' ? 
                         JSON.parse(paymentData.details) : paymentData.details;
                         
          if (details.card_holder) {
            guestName = details.card_holder;
          }
        }
      } catch (e) {
        console.warn('Error parseando detalles:', e);
      }
      
      // ID de usuario por defecto (ajustar según tu sistema)
      const defaultUserId = 1;
      
      // Crear la reserva
      const [bookingResult] = await connection.query(
        `INSERT INTO bookings 
         (property_id, user_id, guest_name, guest_email, check_in_date, check_out_date, 
          guests, total_price, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          1, // ID de propiedad por defecto
          defaultUserId, // Siempre asignar user_id
          guestName,
          guestEmail,
          checkInDate,
          checkOutDate,
          1, // 1 invitado por defecto
          paymentData.amount,
          'confirmed'
        ]
      );
      
      // Usar el nuevo ID de reserva
      actualBookingId = bookingResult.insertId;
      console.log('Nueva reserva creada con ID:', actualBookingId);
    }

    // Generar ID de transacción único
    const transactionId = 'TX-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

    // Formatear los detalles como JSON string si no lo son ya
    let detailsJson = '{}';
    if (paymentData.details) {
      if (typeof paymentData.details === 'string') {
        detailsJson = paymentData.details;
      } else {
        detailsJson = JSON.stringify(paymentData.details);
      }
    }

    // Insertar el pago con fecha actual
    const [result] = await connection.query(
      `INSERT INTO payments 
       (booking_id, amount, currency, payment_method, status, transaction_id, details, payment_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        actualBookingId,
        paymentData.amount,
        paymentData.currency || 'HNL',
        paymentData.payment_method,
        paymentData.status || 'completed',
        transactionId,
        detailsJson
      ]
    );

    // Actualizar el estado de la reserva a confirmado
    await connection.query(
      'UPDATE bookings SET status = ? WHERE id = ?',
      ['confirmed', actualBookingId]
    );

    await connection.commit();
    
    return {
      success: true,
      paymentId: result.insertId,
      transactionId,
      status: paymentData.status || 'completed',
      message: 'Pago procesado exitosamente'
    };
  } catch (error) {
    await connection.rollback();
    console.error('Error procesando pago:', error);
    throw error;
  } finally {
    connection.release();
  }
}
  static async getPayments(filters = {}) {
    const connection = await mysqlPool.getConnection();
    try {
      let query = `
        SELECT p.*, b.check_in_date, b.check_out_date, b.guest_name
        FROM payments p
        JOIN bookings b ON p.booking_id = b.id
        WHERE 1=1
      `;
      const params = [];

      if (filters.status) {
        if (!['pending', 'completed', 'refunded', 'failed'].includes(filters.status)) {
          throw new ValidationError('Estado de pago no válido');
        }
        query += ' AND p.status = ?';
        params.push(filters.status);
      }

      if (filters.dateFrom) {
        query += ' AND p.payment_date >= ?';
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ' AND p.payment_date <= ?';
        params.push(filters.dateTo);
      }

      query += ' ORDER BY p.payment_date DESC';

      const [payments] = await connection.query(query, params)
        .catch(error => {
          throw new DatabaseError('Error al obtener los pagos');
        });

      return payments;
    } finally {
      connection.release();
    }
  }

  static async getPaymentById(id) {
    if (!id) {
      throw new ValidationError('ID de pago es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      const [payment] = await connection.query(
        `SELECT p.*, b.check_in_date, b.check_out_date, b.guest_name
         FROM payments p
         JOIN bookings b ON p.booking_id = b.id
         WHERE p.id = ?`,
        [id]
      ).catch(error => {
        throw new DatabaseError('Error al obtener el pago');
      });

      if (payment.length === 0) {
        throw new NotFoundError('Pago no encontrado');
      }

      return payment[0];
    } finally {
      connection.release();
    }
  }

  static async refundPayment(id, userId) {
    if (!id) {
      throw new ValidationError('ID de pago es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();

      // Verificar si el pago existe y está completado
      const [payment] = await connection.query(
        'SELECT * FROM payments WHERE id = ? AND status = "completed"',
        [id]
      );

      if (payment.length === 0) {
        throw new NotFoundError('Pago no encontrado o no está completado');
      }

      // Verificar autorización (ejemplo: solo admin o el usuario que hizo la reserva)
      const [booking] = await connection.query(
        'SELECT user_id FROM bookings WHERE id = ?',
        [payment[0].booking_id]
      );

      if (booking[0].user_id !== userId && !isAdmin(userId)) {
        throw new AuthorizationError('No autorizado para reembolsar este pago');
      }

      // Simular proceso de reembolso (aquí se integraría con un servicio real)
      const [result] = await connection.query(
        'UPDATE payments SET status = "refunded" WHERE id = ?',
        [id]
      ).catch(error => {
        throw new DatabaseError('Error al procesar el reembolso');
      });

      // Actualizar el estado de la reserva
      await connection.query(
        'UPDATE bookings SET status = "cancelled" WHERE id = ?',
        [payment[0].booking_id]
      ).catch(error => {
        throw new DatabaseError('Error al actualizar el estado de la reserva');
      });

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}