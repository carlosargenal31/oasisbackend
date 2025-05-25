// src/middleware/admin.middleware.js
import { AuthenticationError, AuthorizationError } from '../utils/errors/index.js';

export const adminOnly = (req, res, next) => {
  try {
    if (!req.userId) {
      throw new AuthenticationError('Token de autenticación requerido');
    }
    
    // Verificar el rol directamente desde la solicitud, sin consultar la BD
    if (!req.userRole || (req.userRole !== 'admin' && req.userRole !== 'owner')) {
      throw new AuthorizationError('Acceso denegado. Solo administradores pueden acceder a este recurso');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};