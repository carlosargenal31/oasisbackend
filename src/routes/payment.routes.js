// src/routes/payment.routes.js
import express from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { 
  validatePaymentData,
  validateRefundRequest 
} from '../middleware/payment.middleware.js';
// Opcional: importar middleware de autenticación si lo tienes
// import { authenticateUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// Rutas públicas (no requieren autenticación)
router.get('/:id', PaymentController.getPayment);

// Rutas protegidas (requerirían autenticación en producción)
// Ejemplo comentado de cómo aplicaría autenticación:
// router.post('/', authenticateUser, validatePaymentData, PaymentController.createPayment);

// Sin autenticación para desarrollo
router.post('/', validatePaymentData, PaymentController.createPayment);
router.get('/', PaymentController.getPayments);
router.post('/:id/refund', validateRefundRequest, PaymentController.refundPayment);

export default router;