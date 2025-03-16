// src/middleware/booking.middleware.js
export const validateBookingData = (req, res, next) => {
  const { property_id, guest_name, guest_email, check_in_date, check_out_date, total_price } = req.body;

  const errors = [];

  if (!property_id) errors.push('property_id');
  if (!guest_name) errors.push('guest_name');
  if (!guest_email) errors.push('guest_email');
  if (!check_in_date) errors.push('check_in_date');
  if (!check_out_date) errors.push('check_out_date');
  if (!total_price) errors.push('total_price');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(guest_email)) {
    throw new ValidationError('Formato de email inválido');
  }

  const checkIn = new Date(check_in_date);
  const checkOut = new Date(check_out_date);
  const today = new Date();

  if (checkIn < today) {
    throw new ValidationError('La fecha de entrada no puede estar en el pasado');
  }

  if (checkOut <= checkIn) {
    throw new ValidationError('La fecha de salida debe ser posterior a la fecha de entrada');
  }

  next();
};

export const validateBookingStatus = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'cancelled'];

  if (!status || !validStatuses.includes(status)) {
    throw new ValidationError('Estado de reserva inválido');
  }

  next();
};