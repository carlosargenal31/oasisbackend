// src/middleware/user.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validateUserData = (req, res, next) => {
  const { first_name, last_name, email } = req.body;

  const errors = [];

  if (!first_name) errors.push('first_name');
  if (!last_name) errors.push('last_name');
  if (!email) errors.push('email');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }

  next();
};