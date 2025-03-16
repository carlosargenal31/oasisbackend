// src/routes/payment.routes.js
import express from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { validatePaymentData } from '../middleware/payment.middleware.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

router.post('/', validatePaymentData, PaymentController.createPayment);
router.get('/', authorize(['admin']), PaymentController.getPayments);
router.get('/:id', PaymentController.getPayment);
router.post('/:id/refund', authorize(['admin']), PaymentController.refundPayment);

export default router;
