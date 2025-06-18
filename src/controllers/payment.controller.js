// src/controllers/payment.controller.js - VERSIÓN CORREGIDA
import { PaymentService } from '../services/payment.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class PaymentController {
  static createPayment = asyncErrorHandler(async (req, res) => {
    try {
      console.log('PaymentController.createPayment - Datos recibidos:', req.body);
      
      // Validación inicial
      if (!req.body) {
        return res.status(400).json({
          success: false,
          message: 'No se recibieron datos'
        });
      }

      // Procesar el pago
      const result = await PaymentService.createPayment(req.body);
      
      console.log('PaymentController.createPayment - Resultado:', result);
      
      res.status(201).json({
        success: true,
        status: 'success',
        data: result,
        message: result.message || 'Pago procesado exitosamente'
      });
      
    } catch (error) {
      console.error('Error en PaymentController.createPayment:', error);
      
      // Determinar el tipo de error y código de estado
      let statusCode = 500;
      let errorMessage = 'Error interno del servidor';
      
      if (error.name === 'ValidationError') {
        statusCode = 400;
        errorMessage = error.message;
      } else if (error.name === 'NotFoundError') {
        statusCode = 404;
        errorMessage = error.message;
      } else if (error.name === 'ConflictError') {
        statusCode = 409;
        errorMessage = error.message;
      } else if (error.name === 'DatabaseError') {
        statusCode = 500;
        errorMessage = 'Error en la base de datos';
        console.error('Database error details:', error.message);
      }
      
      res.status(statusCode).json({
        success: false,
        status: 'error',
        message: errorMessage,
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });

  static getPayments = asyncErrorHandler(async (req, res) => {
    try {
      const filters = {
        status: req.query.status,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo
      };

      const payments = await PaymentService.getPayments(filters);
      
      res.json({
        success: true,
        status: 'success',
        data: {
          payments,
          count: payments.length
        }
      });
      
    } catch (error) {
      console.error('Error en PaymentController.getPayments:', error);
      
      res.status(500).json({
        success: false,
        status: 'error',
        message: 'Error al obtener los pagos',
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });

  static getPayment = asyncErrorHandler(async (req, res) => {
    try {
      const payment = await PaymentService.getPaymentById(req.params.id);
      
      res.json({
        success: true,
        status: 'success',
        data: payment
      });
      
    } catch (error) {
      console.error('Error en PaymentController.getPayment:', error);
      
      let statusCode = 500;
      let errorMessage = 'Error al obtener el pago';
      
      if (error.name === 'NotFoundError') {
        statusCode = 404;
        errorMessage = error.message;
      } else if (error.name === 'ValidationError') {
        statusCode = 400;
        errorMessage = error.message;
      }
      
      res.status(statusCode).json({
        success: false,
        status: 'error',
        message: errorMessage,
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });

  static refundPayment = asyncErrorHandler(async (req, res) => {
    try {
      await PaymentService.refundPayment(req.params.id, req.userId);
      
      res.json({
        success: true,
        status: 'success',
        message: 'Pago reembolsado exitosamente'
      });
      
    } catch (error) {
      console.error('Error en PaymentController.refundPayment:', error);
      
      let statusCode = 500;
      let errorMessage = 'Error al procesar el reembolso';
      
      if (error.name === 'NotFoundError') {
        statusCode = 404;
        errorMessage = error.message;
      } else if (error.name === 'ValidationError') {
        statusCode = 400;
        errorMessage = error.message;
      } else if (error.name === 'AuthorizationError') {
        statusCode = 403;
        errorMessage = error.message;
      }
      
      res.status(statusCode).json({
        success: false,
        status: 'error',
        message: errorMessage,
        error: process.env.NODE_ENV === 'production' ? null : error.message
      });
    }
  });
}