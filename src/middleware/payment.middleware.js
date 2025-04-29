// src/middleware/payment.middleware.js

import { ValidationError } from '../utils/errors/index.js';

export const validatePaymentData = (req, res, next) => {
  try {
    const { booking_id, amount, payment_method, currency, details } = req.body;
    
    const errors = [];
    
    // Validaciones básicas
    if (!booking_id) errors.push('ID de reserva es requerido');
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) 
      errors.push('Monto debe ser un número positivo');
    
    // Validar método de pago
    const validPaymentMethods = [
      'credit_card', 'debit_card', 'bank_transfer', 'paypal', 'cash'
    ];
    if (!payment_method || !validPaymentMethods.includes(payment_method)) 
      errors.push(`Método de pago inválido. Debe ser uno de: ${validPaymentMethods.join(', ')}`);
    
    // Validar moneda
    const validCurrencies = ['HNL', 'USD', 'EUR'];
    if (currency && !validCurrencies.includes(currency)) 
      errors.push(`Moneda inválida. Debe ser una de: ${validCurrencies.join(', ')}`);
    
    // Validaciones específicas por método de pago
    if ((payment_method === 'credit_card' || payment_method === 'debit_card') && details) {
      let parsedDetails;
      
      // Intentar parsear los detalles
      try {
        parsedDetails = typeof details === 'string' ? JSON.parse(details) : details;
      } catch (e) {
        errors.push('Formato de detalles de pago inválido');
      }
      
      if (parsedDetails) {
        if (!parsedDetails.card_holder) 
          errors.push('Nombre del titular de la tarjeta es requerido');
        if (!parsedDetails.card_last_four || !/^\d{4}$/.test(parsedDetails.card_last_four)) 
          errors.push('Últimos 4 dígitos de la tarjeta inválidos');
        if (!parsedDetails.card_expiry || !/^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/.test(parsedDetails.card_expiry)) 
          errors.push('Fecha de expiración de tarjeta inválida');
      }
    }
    
    // Si hay errores, lanzar una excepción de validación
    if (errors.length > 0) {
      throw new ValidationError('Error en los datos del pago', errors);
    }
    
    // Si pasa todas las validaciones, continuar
    next();
  } catch (error) {
    // Si es un error de validación, devolver los errores específicos
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.fields
      });
    }
    
    // Para otros errores, devolver un mensaje genérico
    return res.status(500).json({
      success: false,
      message: 'Error al validar los datos de pago'
    });
  }
};

export const validateRefundRequest = (req, res, next) => {
  try {
    const { reason } = req.body;
    
    // Validar que se proporcione una razón para el reembolso
    if (!reason || reason.trim().length < 5) {
      throw new ValidationError('Se requiere una razón válida para el reembolso');
    }
    
    // Validar que el ID del pago sea un número
    const paymentId = parseInt(req.params.id);
    if (isNaN(paymentId)) {
      throw new ValidationError('ID de pago inválido');
    }
    
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la solicitud de reembolso'
    });
  }
};