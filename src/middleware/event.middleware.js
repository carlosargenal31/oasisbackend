// src/middleware/event.middleware.js
import { ValidationError } from '../utils/errors/index.js';

export const validateEventData = (req, res, next) => {
  const { event_name, event_date, event_time, location, event_type } = req.body;

  const errors = [];

  if (!event_name) errors.push('event_name');
  if (!event_date) errors.push('event_date');
  if (!event_time) errors.push('event_time');
  if (!location) errors.push('location');
  if (!event_type) errors.push('event_type');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  // Validar longitud del nombre del evento
  if (event_name && event_name.length > 255) {
    throw new ValidationError('El nombre del evento excede el límite de 255 caracteres');
  }

  // Validar formato de fecha 
  if (event_date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(event_date)) {
      throw new ValidationError('El formato de fecha debe ser YYYY-MM-DD');
    }
  }

  // Validar formato de hora
  if (event_time) {
    const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
    if (!timeRegex.test(event_time)) {
      throw new ValidationError('El formato de hora debe ser HH:MM:SS');
    }
  }

  // Validar precio positivo si se proporciona
  if (req.body.price !== undefined) {
    const price = parseFloat(req.body.price);
    if (isNaN(price) || price < 0) {
      throw new ValidationError('El precio debe ser un número positivo');
    }
  }
  
  // Validar estado si se proporciona
  if (req.body.status !== undefined) {
    const validStates = ['activo', 'cancelado', 'pospuesto', 'completado'];
    if (!validStates.includes(req.body.status)) {
      throw new ValidationError(`El estado debe ser uno de estos valores: ${validStates.join(', ')}`);
    }
  }

  // Validar longitud del tipo de evento
  if (event_type && event_type.length > 100) {
    throw new ValidationError('El tipo de evento excede el límite de 100 caracteres');
  }

  // Validar longitud de ubicación
  if (location && location.length > 255) {
    throw new ValidationError('La ubicación excede el límite de 255 caracteres');
  }

  // No es necesario validar los campos is_featured e is_home, ya que son opcionales
  // Si se proporcionan, deben ser valores booleanos
  if (req.body.is_featured !== undefined && typeof req.body.is_featured !== 'boolean') {
    throw new ValidationError('El campo is_featured debe ser un valor booleano');
  }

  if (req.body.is_home !== undefined && typeof req.body.is_home !== 'boolean') {
    throw new ValidationError('El campo is_home debe ser un valor booleano');
  }

  next();
};