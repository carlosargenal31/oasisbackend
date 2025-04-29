// src/middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import { ValidationError, AuthenticationError } from '../utils/errors/index.js';

export const authenticate = (req, res, next) => {
  // Permitir rutas de prueba sin autenticación en entorno de desarrollo
  if (process.env.NODE_ENV === 'development' && req.path.startsWith('/api/test/')) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Token no proporcionado');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '1234');
    req.userId = decoded.id;
    next();
  } catch (error) {
    throw new AuthenticationError('Token inválido o expirado');
  }
};

// Middleware de autenticación opcional para reseñas y funcionalidades públicas
export const optionalAuth = (req, res, next) => {
  // Permitir rutas de prueba sin autenticación en entorno de desarrollo
  if (process.env.NODE_ENV === 'development' && req.path.startsWith('/api/test/')) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Sin token - continuar como usuario no autenticado
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '1234');
    req.userId = decoded.id;
    next();
  } catch (error) {
    // Error de token - continuar como usuario no autenticado sin lanzar error
    console.warn('Token inválido en optionalAuth:', error.message);
    next();
  }
};

export const validateRegistrationData = (req, res, next) => {
  const { first_name, last_name, email, password } = req.body;

  const errors = [];

  if (!first_name) errors.push('first_name');
  if (!last_name) errors.push('last_name');
  if (!email) errors.push('email');
  if (!password) errors.push('password');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }

  if (password.length < 6) {
    throw new ValidationError('La contraseña debe tener al menos 6 caracteres');
  }

  next();
};

export const validateLoginData = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email y contraseña son requeridos');
  }

  next();
};

export const validatePasswordChange = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('La contraseña actual y la nueva contraseña son requeridas');
  }

  if (newPassword.length < 6) {
    throw new ValidationError('La nueva contraseña debe tener al menos 6 caracteres');
  }

  next();
};