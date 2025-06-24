// src/routes/auth.routes.js
import express from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateRegistrationData, validateLoginData, validatePasswordChange } from '../middleware/auth.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { ValidationError } from '../utils/errors/index.js';

const router = express.Router();

// Middleware para validar datos de reset de contraseña
const validatePasswordResetRequest = (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    throw new ValidationError('Email es requerido');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }
  
  next();
};

const validatePasswordReset = (req, res, next) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    throw new ValidationError('Token y nueva contraseña son requeridos');
  }
  
  if (newPassword.length < 6) {
    throw new ValidationError('La nueva contraseña debe tener al menos 6 caracteres');
  }
  
  next();
};

const validateSecurityVerification = (req, res, next) => {
  const { email, answers } = req.body;
  
  if (!email || !answers) {
    throw new ValidationError('Email y respuestas de seguridad son requeridos');
  }
  
  if (!answers.fullName || !answers.creationYear) {
    throw new ValidationError('Nombre completo y año de creación son requeridos');
  }
  
  if (!answers.securityAnswer) {
    throw new ValidationError('Respuesta de seguridad es requerida');
  }
  
  next();
};

// Public routes
router.post('/register', validateRegistrationData, AuthController.register);
router.post('/login', validateLoginData, AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/security-info', validatePasswordResetRequest, AuthController.getUserSecurityInfo);
router.post('/verify-security', validateSecurityVerification, AuthController.verifySecurityAnswers);
router.post('/request-reset', validatePasswordResetRequest, AuthController.requestPasswordReset);
router.post('/reset-password', validatePasswordReset, AuthController.resetPassword);

// Protected routes
router.get('/me', authenticate, AuthController.getCurrentUser);
router.post('/change-password', authenticate, validatePasswordChange, AuthController.changePassword);

export default router;