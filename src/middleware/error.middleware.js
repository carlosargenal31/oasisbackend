// src/middleware/error.middleware.js
import { BaseError } from '../utils/errors/base-error.js';

export const errorMiddleware = (err, req, res, next) => {
  // Log del error
  console.error('Error:', {
    name: err.name,
    message: err.message,
    statusCode: err.statusCode,
    errorCode: err.errorCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Si es un error operacional conocido
  if (err instanceof BaseError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors // Para ValidationError
    });
  }

  // Para errores no manejados/inesperados
  return res.status(500).json({
    success: false,
    message: 'Ha ocurrido un error interno'
  });
};

// Middleware para manejar errores asíncronos
export const asyncErrorHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};