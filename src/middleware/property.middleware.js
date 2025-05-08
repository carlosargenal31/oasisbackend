// src/middleware/property.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validatePropertyData = (req, res, next) => {
  // Validamos campos esenciales
  const errors = [];
  
  // Solo validamos el tipo de propiedad si se proporciona
  if (req.body.property_type) {
    const validTypes = [
      'Gym', 'Balneario', 'Belleza', 'Futbol', 'Motocross', 'Cafetería', 
      'Restaurante', 'Bar y restaurante', 'Comida rápida', 'Otro', 
      'Repostería', 'Heladería', 'Bebidas', 'Bar', 'Hotel', 'Motel', 
      'Casino', 'Cine', 'Videojuegos'
    ];
    
    if (!validTypes.includes(req.body.property_type)) {
      throw new ValidationError(`Tipo de propiedad inválido. Debe ser uno de: ${validTypes.join(', ')}`);
    }
  }

  // Validamos precio si se proporciona
  if (req.body.price !== undefined && req.body.price !== null) {
    if (isNaN(parseFloat(req.body.price)) || parseFloat(req.body.price) <= 0) {
      throw new ValidationError('El precio debe ser un número positivo');
    }
    // Convertir a float
    req.body.price = parseFloat(req.body.price);
  }

  // Convertir valores booleanos de string a booleanos reales para MySQL
  if (req.body.isNew !== undefined) {
    req.body.isNew = req.body.isNew === 'true' || req.body.isNew === true || req.body.isNew === 1 ? 1 : 0;
  }

  if (req.body.isFeatured !== undefined) {
    req.body.isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true || req.body.isFeatured === 1 ? 1 : 0;
  }

  if (req.body.isVerified !== undefined) {
    req.body.isVerified = req.body.isVerified === 'true' || req.body.isVerified === true || req.body.isVerified === 1 ? 1 : 0;
  }

  // Convertir valores numéricos si están presentes
  if (req.body.bedrooms !== undefined && req.body.bedrooms !== null) {
    req.body.bedrooms = parseInt(req.body.bedrooms);
  }
  
  if (req.body.bathrooms !== undefined && req.body.bathrooms !== null) {
    req.body.bathrooms = parseFloat(req.body.bathrooms);
  }
  
  if (req.body.square_feet !== undefined && req.body.square_feet !== null) {
    req.body.square_feet = parseFloat(req.body.square_feet);
  }
  
  if (req.body.parkingSpaces !== undefined && req.body.parkingSpaces !== null) {
    req.body.parkingSpaces = parseInt(req.body.parkingSpaces);
  }
  
  if (req.body.lat !== undefined && req.body.lat !== null) {
    req.body.lat = parseFloat(req.body.lat);
  }
  
  if (req.body.lng !== undefined && req.body.lng !== null) {
    req.body.lng = parseFloat(req.body.lng);
  }

  next();
};