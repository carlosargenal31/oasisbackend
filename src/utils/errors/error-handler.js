// src/utils/errors/error-handler.js
import { BaseError } from './base-error.js';

export const errorMiddleware = (err, req, res, next) => {
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

  if (err instanceof BaseError) {
    return res.status(err.statusCode).json({
      status: 'error',
      errorCode: err.errorCode,
      message: err.message,
      errors: err.errors,
      timestamp: new Date().toISOString()
    });
  }

  return res.status(500).json({
    status: 'error',
    errorCode: 'INTERNAL_SERVER_ERROR',
    message: 'Ha ocurrido un error interno',
    timestamp: new Date().toISOString()
  });
};

export const asyncErrorHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};