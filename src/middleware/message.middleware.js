// src/middleware/message.middleware.js
export const validateMessageData = (req, res, next) => {
  const { receiver_id, content } = req.body;

  const errors = [];

  if (!receiver_id) errors.push('receiver_id');
  if (!content) errors.push('content');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  if (content.length > 1000) {
    throw new ValidationError('El contenido del mensaje debe tener menos de 1000 caracteres');
  }

  next();
};