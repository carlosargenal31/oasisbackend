// src/middleware/comment.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validateCommentData = (req, res, next) => {
  const { blog_id, name, content } = req.body;
  const errors = [];

  // Validar blog
  if (!blog_id) {
    errors.push('blog_id');
  }

  // Validar nombre del comentarista (requerido solo si no hay usuario autenticado)
  if (!req.userId && !name) {
    errors.push('name');
  }

  // Validar contenido
  if (!content) {
    errors.push('content');
  }

  // Si hay errores, lanzar error de validación
  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  // Validar longitud del comentario
  if (content && content.length > 1000) {
    throw new ValidationError('El comentario debe tener menos de 1000 caracteres');
  }

  // Validar email si se proporciona
  if (req.body.email && !isValidEmail(req.body.email)) {
    throw new ValidationError('Email inválido');
  }

  // Convertir datos a los tipos correctos
  req.body.blog_id = parseInt(blog_id);

  next();
};

// Función auxiliar para validar formato de email
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}