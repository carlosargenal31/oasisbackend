// src/middleware/booking.middleware.js
import { ValidationError } from '../utils/errors/index.js';

// Función auxiliar para validar formato de fecha
const isValidDate = (dateString) => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

export const validateBookingData = (req, res, next) => {
  try {
    const {
      property_id,
      guest_name,
      guest_email,
      guest_phone,
      check_in_date,
      check_out_date,
      guests,
      total_price,
      special_requests
    } = req.body;

    const errors = [];

    // Validaciones obligatorias
    if (!property_id || isNaN(parseInt(property_id))) 
      errors.push('ID de propiedad inválido');
    
    if (!guest_name || guest_name.trim().length < 3) 
      errors.push('Nombre del huésped es requerido (mínimo 3 caracteres)');
    
    // Validación de correo electrónico
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!guest_email || !emailRegex.test(guest_email)) 
      errors.push('Correo electrónico inválido');
    
    // Validación de teléfono (opcional)
    if (guest_phone) {
      const phoneRegex = /^[\d\s\+\(\)\-]{8,15}$/;
      if (!phoneRegex.test(guest_phone)) 
        errors.push('Número de teléfono inválido');
    }
    
    // Validación de fechas
    if (!check_in_date || !isValidDate(check_in_date)) 
      errors.push('Fecha de entrada inválida');
    
    if (!check_out_date || !isValidDate(check_out_date)) 
      errors.push('Fecha de salida inválida');
    
    // Verificar que la fecha de salida sea posterior a la de entrada
    if (check_in_date && check_out_date && isValidDate(check_in_date) && isValidDate(check_out_date)) {
      const checkIn = new Date(check_in_date);
      const checkOut = new Date(check_out_date);
      
      if (checkOut <= checkIn) {
        errors.push('La fecha de salida debe ser posterior a la fecha de entrada');
      }
      
      // Verificar que el período no sea excesivamente largo
      const diffTime = Math.abs(checkOut - checkIn);
      const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30);
      
      if (diffMonths > 36) { // Máximo 3 años
        errors.push('El período máximo de arrendamiento es de 36 meses');
      }
    }
    
    // Validación de número de huéspedes
    if (!guests || isNaN(parseInt(guests)) || parseInt(guests) < 1) 
      errors.push('Número de huéspedes inválido');
    
    // Validación de precio total
    if (!total_price || isNaN(parseFloat(total_price)) || parseFloat(total_price) <= 0) 
      errors.push('Precio total inválido');
    
    // Validación de solicitudes especiales (opcional pero con límite de longitud)
    if (special_requests && special_requests.length > 500) 
      errors.push('Las solicitudes especiales no pueden exceder los 500 caracteres');
    
    // Si hay errores, lanzar excepción
    if (errors.length > 0) {
      throw new ValidationError('Datos de reserva inválidos', errors);
    }
    
    // Si todo está bien, pasar al siguiente middleware
    next();
  } catch (error) {
    // Si es un error de validación, devolver los errores específicos
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.fields
      });
    }
    
    // Para otros errores, devolver un mensaje genérico
    return res.status(500).json({
      success: false,
      message: 'Error al validar los datos de la reserva'
    });
  }
};

export const validateBookingStatus = (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];

    if (!status || !validStatuses.includes(status)) {
      throw new ValidationError(`Estado de reserva inválido. Debe ser uno de: ${validStatuses.join(', ')}`);
    }

    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error al validar el estado de la reserva'
    });
  }
};

export const validateCancelBooking = (req, res, next) => {
  try {
    const bookingId = req.params.id;
    
    // Validar que el ID sea un número válido o un ID temporal
    if (!bookingId || (isNaN(parseInt(bookingId)) && !bookingId.startsWith('temp-'))) {
      throw new ValidationError('ID de reserva inválido');
    }
    
    // Pasar el ID validado
    req.validatedBookingId = bookingId.startsWith('temp-') ? bookingId : parseInt(bookingId);
    
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error al validar la solicitud de cancelación'
    });
  }
};