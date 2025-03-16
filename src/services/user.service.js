// src/services/user.service.js
import { mysqlPool } from '../config/database.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  ConflictError,
  AuthorizationError 
} from '../utils/errors/index.js';

export class UserService {
  // Add these methods to your existing UserService class
static async getFavorites(userId) {
  try {
    const [favorites] = await mysqlPool.query(
      `SELECT p.* FROM properties p
       JOIN favorites f ON p.id = f.property_id
       WHERE f.user_id = ?`,
      [userId]
    );
    
    return favorites;
  } catch (error) {
    console.error('Error getting favorites:', error);
    throw new DatabaseError('Error al obtener favoritos');
  }
}

static async addFavorite(userId, propertyId) {
  try {
    // First check if property exists
    const [property] = await mysqlPool.query(
      'SELECT id FROM properties WHERE id = ?',
      [propertyId]
    );
    
    if (!property[0]) {
      throw new NotFoundError('Propiedad no encontrada');
    }
    
    // Check if already favorited
    const [existing] = await mysqlPool.query(
      'SELECT id FROM favorites WHERE user_id = ? AND property_id = ?',
      [userId, propertyId]
    );
    
    if (existing[0]) {
      return; // Already favorited, no action needed
    }
    
    // Add to favorites
    await mysqlPool.query(
      'INSERT INTO favorites (user_id, property_id) VALUES (?, ?)',
      [userId, propertyId]
    );
    
    return true;
  } catch (error) {
    console.error('Error adding favorite:', error);
    if (error instanceof BaseError) {
      throw error;
    }
    throw new DatabaseError('Error al añadir a favoritos');
  }
}

static async removeFavorite(userId, propertyId) {
  try {
    // Remove from favorites
    const [result] = await mysqlPool.query(
      'DELETE FROM favorites WHERE user_id = ? AND property_id = ?',
      [userId, propertyId]
    );
    
    if (result.affectedRows === 0) {
      throw new NotFoundError('Favorito no encontrado');
    }
    
    return true;
  } catch (error) {
    console.error('Error removing favorite:', error);
    if (error instanceof BaseError) {
      throw error;
    }
    throw new DatabaseError('Error al eliminar de favoritos');
  }
}
  static async createUser(userData) {
    // Validaciones iniciales
    if (!userData.email || !userData.first_name || !userData.last_name) {
      throw new ValidationError('Datos de usuario incompletos', [
        'email',
        'first_name',
        'last_name'
      ]);
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      throw new ValidationError('Email no válido');
    }

    // Validar rol
    const validRoles = ['guest', 'host', 'admin'];
    if (userData.role && !validRoles.includes(userData.role)) {
      throw new ValidationError('Rol no válido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si el email ya existe
      const [existingUser] = await connection.query(
        'SELECT id FROM users WHERE email = ?',
        [userData.email]
      );

      if (existingUser.length > 0) {
        throw new ConflictError('El email ya está registrado');
      }

      // Crear usuario
      const [result] = await connection.query(
        `INSERT INTO users 
         (first_name, last_name, email, phone, role, profile_image, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userData.first_name,
          userData.last_name,
          userData.email,
          userData.phone || null,
          userData.role || 'guest',
          userData.profile_image || null,
          'active'
        ]
      ).catch(error => {
        throw new DatabaseError('Error al crear el usuario');
      });

      return result.insertId;
    } finally {
      connection.release();
    }
  }

  static async getUsers(filters = {}) {
    const connection = await mysqlPool.getConnection();
    try {
      let query = 'SELECT * FROM users WHERE 1=1';
      const params = [];

      // Filtro por rol
      if (filters.role) {
        const validRoles = ['guest', 'host', 'admin'];
        if (!validRoles.includes(filters.role)) {
          throw new ValidationError('Rol no válido');
        }
        query += ' AND role = ?';
        params.push(filters.role);
      }

      // Filtro por estado
      if (filters.status) {
        const validStatuses = ['active', 'inactive', 'suspended'];
        if (!validStatuses.includes(filters.status)) {
          throw new ValidationError('Estado no válido');
        }
        query += ' AND status = ?';
        params.push(filters.status);
      }

      // Búsqueda por términos
      if (filters.search) {
        query += ` AND (
          first_name LIKE ? OR 
          last_name LIKE ? OR 
          email LIKE ? OR 
          phone LIKE ?
        )`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      query += ' ORDER BY created_at DESC';

      const [users] = await connection.query(query, params)
        .catch(error => {
          throw new DatabaseError('Error al obtener los usuarios');
        });

      // Remover datos sensibles
      return users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
    } finally {
      connection.release();
    }
  }

  static async getUserById(id) {
    if (!id) {
      throw new ValidationError('ID de usuario es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      const [users] = await connection.query(
        'SELECT * FROM users WHERE id = ?',
        [id]
      ).catch(error => {
        throw new DatabaseError('Error al obtener el usuario');
      });

      if (users.length === 0) {
        throw new NotFoundError('Usuario no encontrado');
      }

      // Remover datos sensibles
      const { password, ...userWithoutPassword } = users[0];
      return userWithoutPassword;
    } finally {
      connection.release();
    }
  }

  static async updateUser(id, userData, requestUserId) {
    if (!id) {
      throw new ValidationError('ID de usuario es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si el usuario existe
      const [existingUser] = await connection.query(
        'SELECT role FROM users WHERE id = ?',
        [id]
      );

      if (existingUser.length === 0) {
        throw new NotFoundError('Usuario no encontrado');
      }

      // Verificar autorización
      const [requestUser] = await connection.query(
        'SELECT role FROM users WHERE id = ?',
        [requestUserId]
      );

      const isAdmin = requestUser[0]?.role === 'admin';
      const isSameUser = parseInt(id) === parseInt(requestUserId);

      if (!isAdmin && !isSameUser) {
        throw new AuthorizationError('No autorizado para actualizar este usuario');
      }

      // Validar email si se va a actualizar
      if (userData.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
          throw new ValidationError('Email no válido');
        }

        // Verificar si el email ya existe para otro usuario
        const [emailExists] = await connection.query(
          'SELECT id FROM users WHERE email = ? AND id != ?',
          [userData.email, id]
        );

        if (emailExists.length > 0) {
          throw new ConflictError('El email ya está registrado por otro usuario');
        }
      }

      // Validar rol si se va a actualizar
      if (userData.role) {
        const validRoles = ['guest', 'host', 'admin'];
        if (!validRoles.includes(userData.role)) {
          throw new ValidationError('Rol no válido');
        }
        // Solo admins pueden cambiar roles
        if (!isAdmin) {
          throw new AuthorizationError('No autorizado para cambiar roles');
        }
      }

      const [result] = await connection.query(
        `UPDATE users 
         SET first_name = COALESCE(?, first_name),
             last_name = COALESCE(?, last_name),
             email = COALESCE(?, email),
             phone = COALESCE(?, phone),
             role = COALESCE(?, role),
             profile_image = COALESCE(?, profile_image),
             status = COALESCE(?, status)
         WHERE id = ?`,
        [
          userData.first_name,
          userData.last_name,
          userData.email,
          userData.phone,
          userData.role,
          userData.profile_image,
          userData.status,
          id
        ]
      ).catch(error => {
        throw new DatabaseError('Error al actualizar el usuario');
      });

      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  static async deleteUser(id, requestUserId) {
    if (!id) {
      throw new ValidationError('ID de usuario es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar autorización
      const [requestUser] = await connection.query(
        'SELECT role FROM users WHERE id = ?',
        [requestUserId]
      );

      const isAdmin = requestUser[0]?.role === 'admin';
      const isSameUser = parseInt(id) === parseInt(requestUserId);

      if (!isAdmin && !isSameUser) {
        throw new AuthorizationError('No autorizado para eliminar este usuario');
      }

      // Verificar si el usuario existe
      const [existingUser] = await connection.query(
        'SELECT id FROM users WHERE id = ?',
        [id]
      );

      if (existingUser.length === 0) {
        throw new NotFoundError('Usuario no encontrado');
      }

      // Verificar dependencias (reservas activas, propiedades, etc.)
      const [activeBookings] = await connection.query(
        'SELECT id FROM bookings WHERE user_id = ? AND status IN ("confirmed", "pending")',
        [id]
      );

      if (activeBookings.length > 0) {
        throw new ValidationError('No se puede eliminar un usuario con reservas activas');
      }

      const [properties] = await connection.query(
        'SELECT id FROM properties WHERE host_id = ? AND status = "available"',
        [id]
      );

      if (properties.length > 0) {
        throw new ValidationError('No se puede eliminar un usuario con propiedades activas');
      }

      const [result] = await connection.query(
        'DELETE FROM users WHERE id = ?',
        [id]
      ).catch(error => {
        throw new DatabaseError('Error al eliminar el usuario');
      });

      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  static async getUsersByRole(role) {
    if (!role) {
      throw new ValidationError('Rol es requerido');
    }

    const validRoles = ['guest', 'host', 'admin'];
    if (!validRoles.includes(role)) {
      throw new ValidationError('Rol no válido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      const [users] = await connection.query(
        'SELECT * FROM users WHERE role = ? AND status = "active"',
        [role]
      ).catch(error => {
        throw new DatabaseError('Error al obtener los usuarios por rol');
      });

      return users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
    } finally {
      connection.release();
    }
  }
}