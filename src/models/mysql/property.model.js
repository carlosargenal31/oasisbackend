// models/mysql/property.model.js
import { mysqlPool } from '../../config/database.js';

// Función para mantener compatibilidad con el código existente
export const createPropertyTable = async () => {
  await createPropertyTables();
};

// Modelo principal de propiedades
export class Property {
  // Modificación al modelo Property para incluir el contador de vistas y los nuevos tipos

  // En el método createTable, asegúrate de que la definición de la tabla incluya la columna views:
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS properties (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255),
        description TEXT,
        address VARCHAR(255),
        phone VARCHAR(100),
        email VARCHAR(100),
        category VARCHAR(200),
        schedule VARCHAR(500),
        start_time VARCHAR(10),
        end_time VARCHAR(10),
        property_type ENUM('Gym', 'Balneario', 'Belleza', 'Futbol', 'Motocross', 'Cafetería', 
                           'Restaurante', 'Bar y restaurante', 'Comida rápida', 'Otro', 
                           'Repostería', 'Heladería', 'Bebidas', 'Bar', 'Hotel', 'Motel', 
                           'Casino', 'Cine', 'Videojuegos'),
        image VARCHAR(255),
        isFeatured BOOLEAN DEFAULT FALSE,
        average_rating DECIMAL(3,2) DEFAULT 0,
        views INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        lat DECIMAL(30,15),
        lng DECIMAL(30,15),
        archived BOOLEAN DEFAULT FALSE,
        archived_at TIMESTAMP NULL,
        archived_reason VARCHAR(255)
      )
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Properties table created successfully');
    } catch (error) {
      console.error('Error creating properties table:', error);
      throw error;
    }
  }

  static async create(propertyData) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Preparar campos y valores para la consulta dinámica
      const fields = [];
      const placeholders = [];
      const values = [];

      // Lista de todos los campos posibles adaptados a tu estructura actual
      // Actualizada para coincidir con la estructura de la base de datos
      const possibleFields = [
        'title', 'description', 'address', 'phone', 'email', 'category', 
        'schedule', 'start_time', 'end_time', 'property_type', 
        'image', 'isFeatured', 'average_rating', 'views', 'lat', 'lng',
        'archived', 'archived_at', 'archived_reason'
      ];

      // Añadir solo los campos que están definidos
      possibleFields.forEach(field => {
        if (propertyData[field] !== undefined) {
          fields.push(field);
          placeholders.push('?');
          values.push(propertyData[field]);
        }
      });
      
      // Si no hay campos para insertar, lanzar error
      if (fields.length === 0) {
        throw new Error('No hay datos válidos para crear la propiedad');
      }
      
      // Crear la consulta dinámica
      const query = `
        INSERT INTO properties (${fields.join(', ')})
        VALUES (${placeholders.join(', ')})
      `;
      
      const [result] = await connection.query(query, values);
      
      connection.release();
      return result.insertId;
    } catch (error) {
      console.error('Error creating property:', error);
      throw error;
    }
  }

  // Añadir un método específico para incrementar vistas
  static async incrementViews(id) {
    if (!id) {
      throw new Error('ID de propiedad es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      // Actualizar el contador de vistas
      const [result] = await connection.query(
        'UPDATE properties SET views = COALESCE(views, 0) + 1 WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error incrementing property views:', error);
      throw error;
    }
  }

  // Actualizar una propiedad existente
  static async update(id, propertyData) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Construir consulta dinámica en base a los campos proporcionados
      const updateFields = [];
      const updateValues = [];
      
      // Eliminar cualquier campo host_id si existe
      if (propertyData.host_id !== undefined) {
        delete propertyData.host_id;
      }
      
      Object.entries(propertyData).forEach(([key, value]) => {
        if (value !== undefined && 
            key !== 'id' && 
            key !== 'created_at' && 
            key !== 'updated_at' &&
            key !== 'host_id') { // Asegurarse de que host_id nunca se use
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }
      });
      
      if (updateFields.length === 0) {
        connection.release();
        return false; // No hay campos para actualizar
      }
      
      updateValues.push(id); // Agregar ID al final para WHERE
      
      const [result] = await connection.query(
        `UPDATE properties SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating property:', error);
      throw error;
    }
  }
  static async findAll(filters = {}, pagination = {}) {
  try {
    const connection = await mysqlPool.getConnection();
    
    // CAMBIO RADICAL: NO filtrar por archived por defecto
    // Mostrar TODOS los comercios, archivados o no
    
    let query = `
      SELECT p.*, 
             GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
             GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
      FROM properties p
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
      WHERE 1=1
    `;
    
    const queryParams = [];
    
    // QUITAR COMPLETAMENTE el filtro de archived por defecto
    // IMPORTANTE: Ahora siempre se muestran todas las propiedades, 
    // tanto archivadas como no archivadas
    
    // Resto de filtros
    if (filters.status) {
      query += ' AND p.status = ?';
      queryParams.push(filters.status);
    }
    
    // Si se especifica explícitamente mostrar solo activos
    if (filters.archived === false) {
      query += ' AND (p.archived IS NULL OR p.archived = FALSE)';
    }
    
    // Si se especifica explícitamente mostrar solo archivados
    if (filters.archived === true) {
      query += ' AND p.archived = TRUE';
    }
    
    // Resto del método permanece igual...
    // [Mantener código existente para categoría, property_type, etc.]
    
    // Agrupar por ID de propiedad para evitar duplicados por los JOIN
    query += ' GROUP BY p.id';
    
    // Aplicar ordenación según el parámetro sort
    if (filters.sort) {
      switch (filters.sort) {
        case 'id-asc':
          query += ' ORDER BY p.id ASC';
          break;
        case 'newest':
          query += ' ORDER BY p.created_at DESC';
          break;
        case 'views-high':
          query += ' ORDER BY p.views DESC';
          break;
        case 'views-low':
          query += ' ORDER BY p.views ASC';
          break;
        case 'title-asc':
          query += ' ORDER BY p.title ASC';
          break;
        case 'title-desc':
          query += ' ORDER BY p.title DESC';
          break;
        case 'rating-high':
          query += ' ORDER BY COALESCE(p.average_rating, 0) DESC';
          break;
        case 'rating-low':
          query += ' ORDER BY COALESCE(p.average_rating, 0) ASC';
          break;
        default:
          query += ' ORDER BY p.created_at DESC';
      }
    } else {
      // Ordenación por defecto si no se especifica
      query += ' ORDER BY p.created_at DESC';
    }
    
    // Paginación
    if (pagination.limit) {
      query += ' LIMIT ?';
      queryParams.push(parseInt(pagination.limit));
      
      if (pagination.offset) {
        query += ' OFFSET ?';
        queryParams.push(parseInt(pagination.offset));
      }
    }
    
    console.log("QUERY SQL:", query);
    console.log("PARAMS:", queryParams);
    
    // Ejecutar consulta
    const [properties] = await connection.query(query, queryParams);
    
    // CAMBIO RADICAL: Simplificar consulta de conteo para garantizar que incluye todos
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total 
      FROM properties p
      WHERE 1=1
    `;
    
    // No filtrar por archived en el conteo tampoco
    
    // Aplicar los mismos filtros a la consulta de conteo
    const countQueryParams = [];
    
    // Copiar los filtros específicos si existen
    if (filters.status) {
      countQuery += ' AND p.status = ?';
      countQueryParams.push(filters.status);
    }
    
    if (filters.archived === false) {
      countQuery += ' AND (p.archived IS NULL OR p.archived = FALSE)';
    }
    
    if (filters.archived === true) {
      countQuery += ' AND p.archived = TRUE';
    }
    
    console.log("COUNT QUERY:", countQuery);
    console.log("COUNT PARAMS:", countQueryParams);
    
    // Ejecutar consulta de conteo
    const [countResult] = await connection.query(countQuery, countQueryParams);
    const totalCount = countResult[0]?.total || 0;
    
    connection.release();
    
    // Procesar y devolver resultados
    const processedProperties = properties.map(property => ({
      ...property,
      // IMPORTANTE: Normalizar el campo archived como booleano
      archived: property.archived === 1 || property.archived === true,
      amenities: property.amenities ? property.amenities.split(',') : [],
      pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
    }));
    
    return {
      properties: processedProperties,
      total: totalCount
    };
  } catch (error) {
    console.error('Error finding properties:', error);
    throw error;
  }
}

  // Encontrar una propiedad por ID
  static async findById(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Obtener la propiedad con amenidades y mascotas permitidas
      const [properties] = await connection.query(
        `SELECT p.*, 
                GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
                GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
         FROM properties p
         LEFT JOIN property_amenities pa ON p.id = pa.property_id
         LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
         WHERE p.id = ?
         GROUP BY p.id`,
        [id]
      );
      
      if (properties.length === 0) {
        connection.release();
        return null;
      }
      
      // Obtener imágenes adicionales
      const [images] = await connection.query(
        `SELECT image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY is_primary DESC`,
        [id]
      );
      
      connection.release();
      
      // Procesar y devolver resultado
      const property = {
        ...properties[0],
        amenities: properties[0].amenities ? properties[0].amenities.split(',') : [],
        pets_allowed: properties[0].pets_allowed ? properties[0].pets_allowed.split(',') : [],
        additional_images: images.map(img => img.image_url)
      };
      
      return property;
    } catch (error) {
      console.error('Error finding property by ID:', error);
      throw error;
    }
  }

  // Eliminar una propiedad
  static async delete(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Las tablas relacionadas se eliminarán automáticamente por CASCADE
      const [result] = await connection.query(
        'DELETE FROM properties WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting property:', error);
      throw error;
    }
  }

  // Archivar una propiedad (borrado lógico)
  // Archivar una propiedad (borrado lógico)
static async archive(id, reason = null) {
  try {
    const connection = await mysqlPool.getConnection();
    
    // Modificar la consulta para no intentar actualizar la columna 'status'
    const [result] = await connection.query(
      `UPDATE properties SET 
          archived = TRUE, 
          archived_at = CURRENT_TIMESTAMP, 
          archived_reason = ?
         WHERE id = ?`,
      [reason || null, id]
    );
    
    connection.release();
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error archiving property:', error);
    throw error;
  }
}

  // Restaurar una propiedad archivada
  // Restaurar una propiedad archivada
static async restore(id, newStatus = 'for-rent') {
  try {
    const connection = await mysqlPool.getConnection();
    
    // Modificar la consulta para no intentar actualizar la columna 'status'
    const [result] = await connection.query(
      `UPDATE properties SET 
          archived = FALSE, 
          archived_at = NULL, 
          archived_reason = NULL
         WHERE id = ?`,
      [id]
    );
    
    connection.release();
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error restoring property:', error);
    throw error;
  }
}

  // Obtener propiedades destacadas
  static async getFeatured(limit = 6, status = null) {
    try {
      const connection = await mysqlPool.getConnection();
      
      let query = `
        SELECT p.*, 
               GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
               GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
        FROM properties p
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
        WHERE p.isFeatured = TRUE
        AND (p.archived IS NULL OR p.archived = FALSE)
      `;
      
      const params = [];
      
      if (status) {
        query += ' AND p.status = ?';
        params.push(status);
      }
      
      query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?';
      params.push(limit);
      
      const [properties] = await connection.query(query, params);
      
      connection.release();
      
      // Procesar y devolver resultados
      return properties.map(property => ({
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
      }));
    } catch (error) {
      console.error('Error getting featured properties:', error);
      throw error;
    }
  }

  // Obtener propiedades recientes
  static async getRecent(limit = 6, status = null) {
    try {
      const connection = await mysqlPool.getConnection();
      
      let query = `
        SELECT p.*, 
               GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
               GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
        FROM properties p
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
        WHERE (p.archived IS NULL OR p.archived = FALSE)
      `;
      
      const params = [];
      
      if (status) {
        query += ' AND p.status = ?';
        params.push(status);
      }
      
      query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?';
      params.push(limit);
      
      const [properties] = await connection.query(query, params);
      
      connection.release();
      
      // Procesar y devolver resultados
      return properties.map(property => ({
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
      }));
    } catch (error) {
      console.error('Error getting recent properties:', error);
      throw error;
    }
  }

  // Obtener propiedades más vistas
  static async getMostViewed(limit = 6, status = null) {
    try {
      const connection = await mysqlPool.getConnection();
      
      let query = `
        SELECT p.*, 
               GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
               GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
        FROM properties p
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
        WHERE (p.archived IS NULL OR p.archived = FALSE)
      `;
      
      const params = [];
      
      if (status) {
        query += ' AND p.status = ?';
        params.push(status);
      }
      
      query += ' GROUP BY p.id ORDER BY p.views DESC, p.created_at DESC LIMIT ?';
      params.push(limit);
      
      const [properties] = await connection.query(query, params);
      
      connection.release();
      
      // Procesar y devolver resultados
      return properties.map(property => ({
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
      }));
    } catch (error) {
      console.error('Error getting most viewed properties:', error);
      throw error;
    }
  }
}

// Modelo para amenidades de propiedades
export class PropertyAmenity {
  // Crear la tabla de amenidades si no existe
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS property_amenities (
        property_id INT,
        amenity VARCHAR(100),
        PRIMARY KEY (property_id, amenity),
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Property amenities table created successfully');
    } catch (error) {
      console.error('Error creating property amenities table:', error);
      throw error;
    }
  }

  // Añadir amenidades a una propiedad
  static async addToProperty(propertyId, amenities) {
    if (!Array.isArray(amenities) || amenities.length === 0) {
      return;
    }
    
    try {
      const connection = await mysqlPool.getConnection();
      
      // Eliminar amenidades existentes
      await connection.query(
        'DELETE FROM property_amenities WHERE property_id = ?',
        [propertyId]
      );
      
      // Preparar valores para inserción múltiple
      const values = amenities.map(amenity => [propertyId, amenity]);
      
      // Insertar nuevas amenidades
      await connection.query(
        'INSERT INTO property_amenities (property_id, amenity) VALUES ?',
        [values]
      );
      
      connection.release();
      return true;
    } catch (error) {
      console.error('Error adding amenities to property:', error);
      throw error;
    }
  }

  // Obtener amenidades de una propiedad
  static async getByPropertyId(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT amenity FROM property_amenities WHERE property_id = ?',
        [propertyId]
      );
      
      connection.release();
      return rows.map(row => row.amenity);
    } catch (error) {
      console.error('Error getting amenities for property:', error);
      throw error;
    }
  }
}

// Modelo para mascotas permitidas en propiedades
export class PropertyPetAllowed {
  // Crear la tabla de mascotas permitidas si no existe
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS property_pets_allowed (
        property_id INT,
        pet_type ENUM('cats-allowed', 'dogs-allowed'),
        PRIMARY KEY (property_id, pet_type),
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Property pets allowed table created successfully');
    } catch (error) {
      console.error('Error creating property pets allowed table:', error);
      throw error;
    }
  }

  // Añadir mascotas permitidas a una propiedad
  static async addToProperty(propertyId, petTypes) {
    if (!Array.isArray(petTypes) || petTypes.length === 0) {
      return;
    }
    
    try {
      const connection = await mysqlPool.getConnection();
      
      // Eliminar mascotas permitidas existentes
      await connection.query(
        'DELETE FROM property_pets_allowed WHERE property_id = ?',
        [propertyId]
      );
      
      // Preparar valores para inserción múltiple
      const values = petTypes.map(petType => [propertyId, petType]);
      
      // Insertar nuevas mascotas permitidas
      await connection.query(
        'INSERT INTO property_pets_allowed (property_id, pet_type) VALUES ?',
        [values]
      );
      
      connection.release();
      return true;
    } catch (error) {
      console.error('Error adding pets allowed to property:', error);
      throw error;
    }
  }

  // Obtener mascotas permitidas de una propiedad
  static async getByPropertyId(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT pet_type FROM property_pets_allowed WHERE property_id = ?',
        [propertyId]
      );
      
      connection.release();
      return rows.map(row => row.pet_type);
    } catch (error) {
      console.error('Error getting pets allowed for property:', error);
      throw error;
    }
  }
}

// Modelo para imágenes adicionales de propiedades
export class PropertyImage {
  // Crear la tabla de imágenes si no existe
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS property_images (
        id INT PRIMARY KEY AUTO_INCREMENT,
        property_id INT,
        image_url VARCHAR(255) NOT NULL,
        is_primary BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Property images table created successfully');
    } catch (error) {
      console.error('Error creating property images table:', error);
      throw error;
    }
  }

  // Añadir una imagen a una propiedad
  static async addToProperty(propertyId, imageUrl, isPrimary = false) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Si es primaria, actualizar las existentes
      if (isPrimary) {
        await connection.query(
          'UPDATE property_images SET is_primary = FALSE WHERE property_id = ?',
          [propertyId]
        );
      }
      
      // Insertar nueva imagen
      const [result] = await connection.query(
        'INSERT INTO property_images (property_id, image_url, is_primary) VALUES (?, ?, ?)',
        [propertyId, imageUrl, isPrimary]
      );
      
      connection.release();
      return result.insertId;
    } catch (error) {
      console.error('Error adding image to property:', error);
      throw error;
    }
  }

  // Obtener imágenes de una propiedad
  static async getByPropertyId(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT id, image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY is_primary DESC',
        [propertyId]
      );
      
      connection.release();
      return rows;
    } catch (error) {
      console.error('Error getting images for property:', error);
      throw error;
    }
  }

  // Eliminar una imagen
  static async delete(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'DELETE FROM property_images WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting property image:', error);
      throw error;
    }
  }
}

// Función para crear todas las tablas
export const createPropertyTables = async () => {
  try {
    await Property.createTable();
    await PropertyAmenity.createTable();
    await PropertyPetAllowed.createTable();
    await PropertyImage.createTable();
    console.log('All property tables created successfully');
  } catch (error) {
    console.error('Error creating property tables:', error);
    throw error;
  }
};