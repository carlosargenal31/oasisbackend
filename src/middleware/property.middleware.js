// src/middleware/property.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validatePropertyData = (req, res, next) => {
  const { title, description, address, city, price, property_type } = req.body;

  const errors = [];

  if (!title) errors.push('title');
  if (!description) errors.push('description');
  if (!address) errors.push('address');
  if (!city) errors.push('city');
  if (!price) errors.push('price');
  if (!property_type) errors.push('property_type');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  if (isNaN(price) || price <= 0) {
    throw new ValidationError('El precio debe ser un número positivo');
  }

  const validTypes = ['house', 'apartment', 'room', 'office', 'commercial', 'land', 'daily-rental', 'new-building', 'parking-lot'];
  if (!validTypes.includes(property_type)) {
    throw new ValidationError(`Tipo de propiedad inválido. Debe ser uno de: ${validTypes.join(', ')}`);
  }

  next();
};