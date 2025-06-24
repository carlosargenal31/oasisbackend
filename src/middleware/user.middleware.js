// src/middleware/user.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validateUserData = (req, res, next) => {
  const { first_name, last_name, email, password, phone, security_question, security_answer } = req.body;

  const errors = [];

  if (!first_name) errors.push('first_name');
  if (!last_name) errors.push('last_name');
  if (!email) errors.push('email');
  if (!password) errors.push('password');
  if (!phone) errors.push('phone');
  if (!security_question) errors.push('security_question');
  if (!security_answer) errors.push('security_answer');

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

  // Validar formato de teléfono (debe incluir código de país)
  const phoneRegex = /^\+\d{1,4}\s\d{4,15}$/;
  if (!phoneRegex.test(phone)) {
    throw new ValidationError('Formato de teléfono inválido. Debe incluir código de país.');
  }

  // Validar que la pregunta de seguridad sea una de las permitidas
  const allowedQuestions = [
    '¿Cuál es el nombre de tu primera mascota?',
    '¿En qué ciudad naciste?',
    '¿Cuál es tu película favorita?',
    '¿Cuál es el nombre de soltera de tu madre?',
    '¿En qué escuela primaria estudiaste?',
    '¿Cuál es tu comida favorita?',
    '¿Cuál es el nombre de tu mejor amigo de la infancia?',
    '¿En qué año compraste tu primer auto?'
  ];

  if (!allowedQuestions.includes(security_question)) {
    throw new ValidationError('Pregunta de seguridad no válida');
  }

  if (security_answer.length < 2) {
    throw new ValidationError('La respuesta de seguridad debe tener al menos 2 caracteres');
  }

  next();
};