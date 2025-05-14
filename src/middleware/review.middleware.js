// src/middleware/review.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validateReviewData = (req, res, next) => {
  const { property_id, rating, comment } = req.body;
  const errors = [];

  // Validar que el usuario esté autenticado
  if (!req.userId) {
    throw new ValidationError('Se requiere autenticación para dejar una reseña');
  }

  // Validar propiedad
  if (!property_id) {
    errors.push('property_id');
  }

  // Validar rating
  if (!rating) {
    errors.push('rating');
  } else if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
    throw new ValidationError('El rating debe ser un número entero entre 1 y 5');
  }

  // Si hay errores, lanzar error de validación
  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  // Validar longitud del comentario si existe
  if (comment && comment.length > 2000) {
    throw new ValidationError('El comentario debe tener menos de 2000 caracteres');
  }

  // Convertir datos a los tipos correctos
  req.body.property_id = parseInt(property_id);
  req.body.rating = parseInt(rating);

  next();
};