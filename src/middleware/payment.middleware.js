// src/middleware/payment.middleware.js
export const validatePaymentData = (req, res, next) => {
  const { booking_id, amount, payment_method } = req.body;

  const errors = [];

  if (!booking_id) errors.push('booking_id');
  if (!amount) errors.push('amount');
  if (!payment_method) errors.push('payment_method');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  if (amount <= 0) {
    throw new ValidationError('El monto debe ser mayor a 0');
  }

  const validPaymentMethods = ['credit_card', 'debit_card', 'paypal', 'bank_transfer'];
  if (!validPaymentMethods.includes(payment_method)) {
    throw new ValidationError(`Método de pago inválido. Debe ser uno de: ${validPaymentMethods.join(', ')}`);
  }

  next();
};