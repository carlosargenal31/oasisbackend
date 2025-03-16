// src/middleware/user.middleware.js
export const validateUserData = (req, res, next) => {
  const { first_name, last_name, email, role } = req.body;

  const errors = [];

  if (!first_name) errors.push('first_name');
  if (!last_name) errors.push('last_name');
  if (!email) errors.push('email');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }

  if (role && !['guest', 'host', 'admin'].includes(role)) {
    throw new ValidationError('Rol inválido. Debe ser: guest, host, o admin');
  }

  next();
};