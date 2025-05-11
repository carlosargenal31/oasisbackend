// src/services/admin.service.js
import { mysqlPool } from '../config/database.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError 
} from '../utils/errors/index.js';

export class AdminService {
  // Obtener todos los negocios (properties) para admin
  static async getAllBusinesses(filters = {}) {
    const connection = await mysqlPool.getConnection();
    try {
      let query = `
        SELECT p.*, 
               u.first_name as host_first_name, 
               u.last_name as host_last_name,
               u.email as host_email,
               u.phone as host_phone,
               u.profile_image as host_profile_image,
               GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
               GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
        FROM properties p
        LEFT JOIN users u ON p.host_id = u.id
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
        WHERE 1=1
      `;
      
      const queryParams = [];
      
      // Aplicar filtros
      if (filters.category) {
        query += ' AND p.category = ?';
        queryParams.push(filters.category);
      }
      
      if (filters.status) {
        query += ' AND p.status = ?';
        queryParams.push(filters.status);
      }
      
      if (filters.verified !== undefined) {
        query += ' AND p.isVerified = ?';
        queryParams.push(filters.verified ? 1 : 0);
      }
      
      if (filters.search) {
        query += ' AND (p.title LIKE ? OR p.address LIKE ? OR u.email LIKE ?)';
        const searchPattern = `%${filters.search}%`;
        queryParams.push(searchPattern, searchPattern, searchPattern);
      }
      
      query += ' GROUP BY p.id';
      
      // Ordenamiento
      if (filters.sort === 'newest') {
        query += ' ORDER BY p.created_at DESC';
      } else if (filters.sort === 'oldest') {
        query += ' ORDER BY p.created_at ASC';
      } else if (filters.sort === 'rating') {
        query += ' ORDER BY p.average_rating DESC';
      } else {
        query += ' ORDER BY p.created_at DESC';
      }
      
      // Paginación
      if (filters.limit) {
        query += ' LIMIT ?';
        queryParams.push(parseInt(filters.limit));
        
        if (filters.offset) {
          query += ' OFFSET ?';
          queryParams.push(parseInt(filters.offset));
        }
      }
      
      const [properties] = await connection.query(query, queryParams);
      
      // Contar total
      let countQuery = `
        SELECT COUNT(DISTINCT p.id) as total
        FROM properties p
        LEFT JOIN users u ON p.host_id = u.id
        WHERE 1=1
      `;
      
      const countParams = [];
      
      if (filters.category) {
        countQuery += ' AND p.category = ?';
        countParams.push(filters.category);
      }
      
      if (filters.status) {
        countQuery += ' AND p.status = ?';
        countParams.push(filters.status);
      }
      
      if (filters.verified !== undefined) {
        countQuery += ' AND p.isVerified = ?';
        countParams.push(filters.verified ? 1 : 0);
      }
      
      if (filters.search) {
        countQuery += ' AND (p.title LIKE ? OR p.address LIKE ? OR u.email LIKE ?)';
        const searchPattern = `%${filters.search}%`;
        countParams.push(searchPattern, searchPattern, searchPattern);
      }
      
      const [countResult] = await connection.query(countQuery, countParams);
      
      // Procesar resultados
      const processedProperties = properties.map(property => ({
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : [],
        host_name: `${property.host_first_name || ''} ${property.host_last_name || ''}`.trim()
      }));
      
      return {
        businesses: processedProperties,
        total: countResult[0]?.total || 0
      };
    } catch (error) {
      console.error('Error getting all businesses:', error);
      throw new DatabaseError('Error al obtener negocios');
    } finally {
      connection.release();
    }
  }
  
  // Actualizar estado de verificación
  static async updateVerificationStatus(propertyId, isVerified) {
    const connection = await mysqlPool.getConnection();
    try {
      const [result] = await connection.query(
        'UPDATE properties SET isVerified = ? WHERE id = ?',
        [isVerified ? 1 : 0, propertyId]
      );
      
      if (result.affectedRows === 0) {
        throw new NotFoundError('Negocio no encontrado');
      }
      
      return true;
    } catch (error) {
      console.error('Error updating verification status:', error);
      throw new DatabaseError('Error al actualizar estado de verificación');
    } finally {
      connection.release();
    }
  }
  
  // Actualizar estado de destacado
  static async updateFeaturedStatus(propertyId, isFeatured) {
    const connection = await mysqlPool.getConnection();
    try {
      const [result] = await connection.query(
        'UPDATE properties SET isFeatured = ? WHERE id = ?',
        [isFeatured ? 1 : 0, propertyId]
      );
      
      if (result.affectedRows === 0) {
        throw new NotFoundError('Negocio no encontrado');
      }
      
      return true;
    } catch (error) {
      console.error('Error updating featured status:', error);
      throw new DatabaseError('Error al actualizar estado de destacado');
    } finally {
      connection.release();
    }
  }
  
  // Obtener estadísticas del panel de admin
  static async getAdminStats() {
    const connection = await mysqlPool.getConnection();
    try {
      // Total de negocios
      const [totalBusinesses] = await connection.query(
        'SELECT COUNT(*) as total FROM properties'
      );
      
      // Total de usuarios
      const [totalUsers] = await connection.query(
        'SELECT COUNT(*) as total FROM users'
      );
      
      // Negocios por categoría
      const [businessesByCategory] = await connection.query(`
        SELECT category, COUNT(*) as count
        FROM properties
        GROUP BY category
        ORDER BY count DESC
      `);
      
      // Negocios por estado
      const [businessesByStatus] = await connection.query(`
        SELECT status, COUNT(*) as count
        FROM properties
        GROUP BY status
      `);
      
      // Negocios verificados vs no verificados
      const [verificationStats] = await connection.query(`
        SELECT 
          SUM(CASE WHEN isVerified = 1 THEN 1 ELSE 0 END) as verified,
          SUM(CASE WHEN isVerified = 0 THEN 1 ELSE 0 END) as unverified
        FROM properties
      `);
      
      return {
        totalBusinesses: totalBusinesses[0]?.total || 0,
        totalUsers: totalUsers[0]?.total || 0,
        businessesByCategory: businessesByCategory || [],
        businessesByStatus: businessesByStatus || [],
        verificationStats: verificationStats[0] || { verified: 0, unverified: 0 }
      };
    } catch (error) {
      console.error('Error getting admin stats:', error);
      throw new DatabaseError('Error al obtener estadísticas');
    } finally {
      connection.release();
    }
  }
}