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
  static async createPayment(paymentData) {
    // Validaciones iniciales
    if (!paymentData.booking_id || !paymentData.amount || !paymentData.payment_method) {
      throw new ValidationError('Datos de pago incompletos', [
        'booking_id',
        'amount',
        'payment_method'
      ]);
    }

    // Validar método de pago
    const validPaymentMethods = ['credit_card', 'debit_card', 'paypal', 'transfer'];
    if (!validPaymentMethods.includes(paymentData.payment_method)) {
      throw new ValidationError('Método de pago no válido');
    }

    // Validar monto
    if (paymentData.amount <= 0) {
      throw new ValidationError('El monto debe ser mayor a 0');
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();

      // Verificar si la reserva existe y no está pagada
      const [booking] = await connection.query(
        'SELECT * FROM bookings WHERE id = ?',
        [paymentData.booking_id]
      ).catch(error => {
        throw new DatabaseError('Error al verificar la reserva');
      });

      if (booking.length === 0) {
        throw new NotFoundError('Reserva no encontrada');
      }

      // Verificar si ya existe un pago completado para esta reserva
      const [existingPayment] = await connection.query(
        'SELECT * FROM payments WHERE booking_id = ? AND status = "completed"',
        [paymentData.booking_id]
      ).catch(error => {
        throw new DatabaseError('Error al verificar pagos existentes');
      });

      if (existingPayment.length > 0) {
        throw new ConflictError('La reserva ya está pagada');
      }

      // Verificar que el monto coincida con el de la reserva
      if (booking[0].total_price !== paymentData.amount) {
        throw new ValidationError('El monto del pago no coincide con el de la reserva');
      }

      // Simular procesamiento de pago (aquí se integraría con un servicio real como Stripe)
      const transactionId = 'TX' + Date.now() + Math.random().toString(36).substring(7);

      // Crear el registro de pago
      const [result] = await connection.query(
        `INSERT INTO payments 
         (booking_id, amount, payment_method, status, transaction_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
          paymentData.booking_id,
          paymentData.amount,
          paymentData.payment_method,
          'completed',
          transactionId
        ]
      ).catch(error => {
        throw new DatabaseError('Error al registrar el pago');
      });

      // Actualizar el estado de la reserva
      await connection.query(
        'UPDATE bookings SET status = "confirmed" WHERE id = ?',
        [paymentData.booking_id]
      ).catch(error => {
        throw new DatabaseError('Error al actualizar el estado de la reserva');
      });

      await connection.commit();

      return {
        paymentId: result.insertId,
        transactionId,
        status: 'completed'
      };
    } catch (error) {
      await connection.rollback();
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