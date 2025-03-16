// src/controllers/payment.controller.js
import { PaymentService } from '../services/payment.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class PaymentController {
  static createPayment = asyncErrorHandler(async (req, res) => {
    const result = await PaymentService.createPayment(req.body);
    
    res.status(201).json({
      status: 'success',
      data: {
        ...result,
        message: 'Pago procesado exitosamente'
      }
    });
  });

  static getPayments = asyncErrorHandler(async (req, res) => {
    const filters = {
      status: req.query.status,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    };

    const payments = await PaymentService.getPayments(filters);
    
    res.json({
      status: 'success',
      data: {
        payments,
        count: payments.length
      }
    });
  });

  static getPayment = asyncErrorHandler(async (req, res) => {
    const payment = await PaymentService.getPaymentById(req.params.id);
    
    res.json({
      status: 'success',
      data: payment
    });
  });

  static refundPayment = asyncErrorHandler(async (req, res) => {
    await PaymentService.refundPayment(req.params.id, req.userId); // Asumiendo que req.userId viene del middleware de auth
    
    res.json({
      status: 'success',
      message: 'Pago reembolsado exitosamente'
    });
  });
}