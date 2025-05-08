// src/middleware/blog.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validateBlogData = (req, res, next) => {
  const { title, category, content } = req.body;

  const errors = [];

  if (!title) errors.push('title');
  if (!category) errors.push('category');
  if (!content) errors.push('content');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  // Validar longitud del título
  if (title && title.length > 255) {
    throw new ValidationError('El título excede el límite de 255 caracteres');
  }

  // Validar longitud de la categoría
  if (category && category.length > 100) {
    throw new ValidationError('La categoría excede el límite de 100 caracteres');
  }

  // No es necesario validar el campo is_featured, ya que es opcional
  // Si se proporciona, debe ser un valor booleano
  if (req.body.is_featured !== undefined && typeof req.body.is_featured !== 'boolean') {
    throw new ValidationError('El campo is_featured debe ser un valor booleano');
  }

  next();
};