// src/middleware/property.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validatePropertyData = (req, res, next) => {
  const { title, address, city, price, property_type, status } = req.body;

  const errors = [];

  // Campos obligatorios básicos
  if (!title) errors.push('title');
  if (!address) errors.push('address');
  if (!city) errors.push('city');
  if (!price) errors.push('price');
  if (!property_type) errors.push('property_type');
  if (!status) errors.push('status');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  // Validar precio
  const priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum <= 0) {
    throw new ValidationError('El precio debe ser un número positivo');
  }

  // Validar tipo de propiedad
  const validTypes = ['house', 'apartment', 'room', 'office', 'commercial', 'land', 'daily-rental', 'new-building', 'parking-lot'];
  if (!validTypes.includes(property_type)) {
    throw new ValidationError(`Tipo de propiedad inválido. Debe ser uno de: ${validTypes.join(', ')}`);
  }

  // Validar status - SOLO for-rent y for-sale
  const validStatuses = ['for-rent', 'for-sale'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Status inválido. Debe ser uno de: ${validStatuses.join(', ')}`);
  }

  // Validar habitaciones y baños si están presentes
  if (req.body.bedrooms && (isNaN(parseInt(req.body.bedrooms)) || parseInt(req.body.bedrooms) < 0)) {
    throw new ValidationError('El número de habitaciones debe ser un número entero positivo o cero');
  }

  if (req.body.bathrooms && (isNaN(parseFloat(req.body.bathrooms)) || parseFloat(req.body.bathrooms) < 0)) {
    throw new ValidationError('El número de baños debe ser un número positivo o cero');
  }

  // Validar área si está presente
  if (req.body.square_feet && (isNaN(parseFloat(req.body.square_feet)) || parseFloat(req.body.square_feet) < 0)) {
    throw new ValidationError('El área debe ser un número positivo');
  }

  // Validar estacionamientos si está presente
  if (req.body.parkingSpaces && (isNaN(parseInt(req.body.parkingSpaces)) || parseInt(req.body.parkingSpaces) < 0)) {
    throw new ValidationError('El número de estacionamientos debe ser un número entero positivo o cero');
  }

  next();
};