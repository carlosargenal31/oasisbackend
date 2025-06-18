// src/services/payment.service.js - CORRECCIÓN FINAL
import { mysqlPool } from '../config/database.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  ConflictError,
  AuthorizationError 
} from '../utils/errors/index.js';

export class PaymentService {
  /**
   * Create payment for a booking - VERSIÓN FINAL CORREGIDA
   */
  static async createPayment(paymentData) {
    console.log('PaymentService.createPayment - Iniciando proceso con datos:', paymentData);

    // Validación inicial más robusta
    if (!paymentData) {
      throw new ValidationError('No se recibieron datos de pago');
    }

    // Validar campos requeridos
    const requiredFields = ['booking_id', 'amount', 'payment_method'];
    const missingFields = requiredFields.filter(field => !paymentData[field]);
    
    if (missingFields.length > 0) {
      throw new ValidationError(`Campos requeridos faltantes: ${missingFields.join(', ')}`);
    }

    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      console.log('Conexión a BD establecida, iniciando transacción');

      // Procesar booking_id
      let bookingId = paymentData.booking_id;
      let actualBookingId = null;
      let isTemporaryBooking = String(bookingId).startsWith('temp-');

      console.log('Procesando booking_id:', bookingId, 'es temporal:', isTemporaryBooking);

      if (!isTemporaryBooking) {
        // ID numérico - verificar que existe
        actualBookingId = parseInt(bookingId);
        if (isNaN(actualBookingId)) {
          throw new ValidationError('ID de reserva no válido');
        }

        // Verificar si la reserva existe
        const [existingBooking] = await connection.query(
          'SELECT id, status, total_price, property_id, user_id FROM bookings WHERE id = ? AND deleted_at IS NULL',
          [actualBookingId]
        );

        if (existingBooking.length === 0) {
          console.log('Reserva no encontrada, creando nueva reserva');
          // Si no existe, crear una nueva
          actualBookingId = await this.createNewBooking(connection, paymentData);
        } else {
          console.log('Reserva encontrada:', existingBooking[0]);
          actualBookingId = existingBooking[0].id;
        }
      } else {
        // ID temporal - crear nueva reserva
        console.log('Creando nueva reserva para ID temporal');
        actualBookingId = await this.createNewBooking(connection, paymentData);
      }

      // Verificar si ya existe un pago para esta reserva
      const [existingPayments] = await connection.query(
        'SELECT id, status FROM payments WHERE booking_id = ?',
        [actualBookingId]
      );

      if (existingPayments.length > 0 && existingPayments[0].status === 'completed') {
        throw new ConflictError('Esta reserva ya tiene un pago completado');
      }

      // Generar ID de transacción único
      const transactionId = 'TX-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

      // Preparar detalles del pago
      let detailsJson = '{}';
      if (paymentData.details) {
        try {
          if (typeof paymentData.details === 'string') {
            // Validar que sea JSON válido
            JSON.parse(paymentData.details);
            detailsJson = paymentData.details;
          } else {
            detailsJson = JSON.stringify(paymentData.details);
          }
        } catch (e) {
          console.warn('Detalles de pago no son JSON válido, usando objeto vacío');
          detailsJson = '{}';
        }
      }

      console.log('Insertando pago en la base de datos');

      // Insertar el pago
      const [paymentResult] = await connection.query(
        `INSERT INTO payments 
         (booking_id, amount, currency, payment_method, status, transaction_id, details, payment_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          actualBookingId,
          parseFloat(paymentData.amount),
          paymentData.currency || 'HNL',
          paymentData.payment_method,
          'pending', // Todos los pagos inician como pending
          transactionId,
          detailsJson
        ]
      );

      const paymentId = paymentResult.insertId;
      console.log('Pago creado con ID:', paymentId);

      // Actualizar el estado de la reserva
      await connection.query(
        'UPDATE bookings SET payment_status = ?, updated_at = NOW() WHERE id = ?',
        ['pending', actualBookingId]
      );

      await connection.commit();
      console.log('Transacción completada exitosamente');

      return {
        success: true,
        paymentId: paymentId,
        bookingId: actualBookingId,
        transactionId: transactionId,
        status: 'pending',
        message: 'Pago registrado exitosamente. Esperando confirmación del propietario.'
      };

    } catch (error) {
      console.error('Error en PaymentService.createPayment:', error);
      
      if (connection) {
        try {
          await connection.rollback();
          console.log('Rollback completado');
        } catch (rollbackError) {
          console.error('Error en rollback:', rollbackError);
        }
      }
      
      // Re-lanzar errores conocidos
      if (error instanceof ValidationError || 
          error instanceof NotFoundError ||
          error instanceof ConflictError) {
        throw error;
      }
      
      // Para errores de base de datos, crear un DatabaseError
      throw new DatabaseError('Error al procesar el pago: ' + error.message);
    } finally {
      if (connection) {
        try {
          connection.release();
          console.log('Conexión liberada');
        } catch (releaseError) {
          console.error('Error liberando conexión:', releaseError);
        }
      }
    }
  }

  /**
   * Método auxiliar para crear una nueva reserva
   */
  static async createNewBooking(connection, paymentData) {
    console.log('Creando nueva reserva con datos de pago');
    
    // Datos por defecto para la nueva reserva
    const currentDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6); // 6 meses por defecto

    // Extraer información adicional de los detalles si está disponible
    let guestName = 'Cliente';
    let guestEmail = 'cliente@example.com';
    
    try {
      if (paymentData.details) {
        const details = typeof paymentData.details === 'string' ? 
                       JSON.parse(paymentData.details) : paymentData.details;
        
        if (details.card_holder) {
          guestName = details.card_holder;
        }
      }
    } catch (e) {
      console.warn('Error parseando detalles para extraer datos del huésped:', e);
    }

    // Verificar si existe al menos una propiedad para asignar
    const [properties] = await connection.query('SELECT id FROM properties LIMIT 1');
    const defaultPropertyId = properties.length > 0 ? properties[0].id : 1;

    // Verificar si existe al menos un usuario para asignar
    const [users] = await connection.query('SELECT id FROM users LIMIT 1');
    const defaultUserId = users.length > 0 ? users[0].id : null;

    const insertQuery = defaultUserId ? 
      `INSERT INTO bookings 
       (property_id, user_id, guest_name, guest_email, guest_phone, 
        check_in_date, check_out_date, guests, total_price, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())` :
      `INSERT INTO bookings 
       (property_id, guest_name, guest_email, guest_phone, 
        check_in_date, check_out_date, guests, total_price, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

    const insertParams = defaultUserId ? [
      defaultPropertyId,
      defaultUserId,
      guestName,
      guestEmail,
      '', // guest_phone
      currentDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      1, // guests
      paymentData.amount,
      'pending'
    ] : [
      defaultPropertyId,
      guestName,
      guestEmail,
      '', // guest_phone
      currentDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      1, // guests
      paymentData.amount,
      'pending'
    ];

    const [bookingResult] = await connection.query(insertQuery, insertParams);
    
    const newBookingId = bookingResult.insertId;
    console.log('Nueva reserva creada con ID:', newBookingId);
    
    return newBookingId;
  }

  // Resto de métodos sin cambios...
  static async getPayments(filters = {}) {
    const connection = await mysqlPool.getConnection();
    try {
      let query = `
        SELECT p.*, b.check_in_date, b.check_out_date, b.guest_name
        FROM payments p
        LEFT JOIN bookings b ON p.booking_id = b.id
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

      const [payments] = await connection.query(query, params);
      return payments;

    } catch (error) {
      console.error('Error en getPayments:', error);
      throw new DatabaseError('Error al obtener los pagos: ' + error.message);
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
         LEFT JOIN bookings b ON p.booking_id = b.id
         WHERE p.id = ?`,
        [id]
      );

      if (payment.length === 0) {
        throw new NotFoundError('Pago no encontrado');
      }

      return payment[0];
    } catch (error) {
      console.error('Error en getPaymentById:', error);
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Error al obtener el pago: ' + error.message);
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

      // Actualizar estado del pago
      await connection.query(
        'UPDATE payments SET status = "refunded", updated_at = NOW() WHERE id = ?',
        [id]
      );

      // Actualizar el estado de la reserva
      await connection.query(
        'UPDATE bookings SET status = "cancelled", payment_status = "refunded", updated_at = NOW() WHERE id = ?',
        [payment[0].booking_id]
      );

      await connection.commit();
      return true;

    } catch (error) {
      await connection.rollback();
      console.error('Error en refundPayment:', error);
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError || 
          error instanceof AuthorizationError) {
        throw error;
      }
      
      throw new DatabaseError('Error al procesar reembolso: ' + error.message);
    } finally {
      connection.release();
    }
  }
}