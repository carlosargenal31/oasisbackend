// src/middleware/admin.middleware.js
import { AuthenticationError, AuthorizationError } from '../utils/errors/index.js';
import { mysqlPool } from '../config/database.js';

export const adminOnly = async (req, res, next) => {
  try {
    if (!req.userId) {
      throw new AuthenticationError('Token de autenticación requerido');
    }

    const connection = await mysqlPool.getConnection();
    
    try {
      // Verificar el rol del usuario en la base de datos
      const [users] = await connection.query(
        'SELECT role FROM users WHERE id = ?',
        [req.userId]
      );

      if (!users || users.length === 0) {
        throw new AuthenticationError('Usuario no encontrado');
      }

      if (users[0].role !== 'admin') {
        throw new AuthorizationError('Acceso denegado. Solo administradores pueden acceder a este recurso');
      }

      next();
    } finally {
      connection.release();
    }
  } catch (error) {
    next(error);
  }
};