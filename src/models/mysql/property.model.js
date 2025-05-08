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
        bedrooms INT,
        bathrooms DECIMAL(3,1),
        square_feet DECIMAL(10,2),
        property_type ENUM('Gym', 'Balneario', 'Belleza', 'Futbol', 'Motocross', 'Cafetería', 
                           'Restaurante', 'Bar y restaurante', 'Comida rápida', 'Otro', 
                           'Repostería', 'Heladería', 'Bebidas', 'Bar', 'Hotel', 'Motel', 
                           'Casino', 'Cine', 'Videojuegos'),
        status ENUM('for-rent', 'for-sale', 'unavailable') DEFAULT 'for-rent',
        image VARCHAR(255),
        isNew BOOLEAN DEFAULT FALSE,
        isFeatured BOOLEAN DEFAULT FALSE,
        isVerified BOOLEAN DEFAULT FALSE,
        parkingSpaces INT DEFAULT 0,
        host_id INT,
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

  // También debes actualizar el método create para incluir views en la creación de nuevas propiedades
  static async create(propertyData) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Preparar campos y valores para la consulta dinámica
      const fields = [];
      const placeholders = [];
      const values = [];

      // Lista de todos los campos posibles adaptados a tu estructura actual
      const possibleFields = [
        'title', 'description', 'address', 'phone', 'email', 'category', 
        'schedule', 'bedrooms', 'bathrooms', 'square_feet', 'property_type', 
        'status', 'image', 'isNew', 'isFeatured', 'isVerified', 'parkingSpaces', 
        'host_id', 'views', 'lat', 'lng'
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
      
      Object.entries(propertyData).forEach(([key, value]) => {
        if (value !== undefined && 
            key !== 'id' && 
            key !== 'created_at' && 
            key !== 'updated_at') {
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

  // Obtener todas las propiedades con filtros opcionales
  static async findAll(filters = {}, pagination = {}) {
    try {
      const connection = await mysqlPool.getConnection();
      
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
      
      // Añadir filtro para excluir propiedades archivadas por defecto
      if (filters.includeArchived !== true) {
        query += ' AND (p.archived IS NULL OR p.archived = FALSE)';
      }
      
      // Aplicar filtros
      if (filters.status) {
        query += ' AND p.status = ?';
        queryParams.push(filters.status);
      }
      
      if (filters.property_type) {
        if (Array.isArray(filters.property_type)) {
          query += ` AND p.property_type IN (${filters.property_type.map(() => '?').join(',')})`;
          queryParams.push(...filters.property_type);
        } else {
          query += ' AND p.property_type = ?';
          queryParams.push(filters.property_type);
        }
      }
      
      // Usar category para filtros adicionales
      if (filters.category) {
        query += ' AND p.category LIKE ?';
        queryParams.push(`%${filters.category}%`);
      }
      
      // Para city, buscar en address ya que no hay columna city
      if (filters.city) {
        query += ' AND p.address LIKE ?';
        queryParams.push(`%${filters.city}%`);
      }
      
      if (filters.minBedrooms) {
        query += ' AND p.bedrooms >= ?';
        queryParams.push(parseInt(filters.minBedrooms));
      }
      
      if (filters.minBathrooms) {
        query += ' AND p.bathrooms >= ?';
        queryParams.push(parseFloat(filters.minBathrooms));
      }
      
      if (filters.minArea) {
        query += ' AND p.square_feet >= ?';
        queryParams.push(parseFloat(filters.minArea));
      }
      
      if (filters.maxArea) {
        query += ' AND p.square_feet <= ?';
        queryParams.push(parseFloat(filters.maxArea));
      }
      
      if (filters.verified) {
        query += ' AND p.isVerified = TRUE';
      }
      
      if (filters.featured) {
        query += ' AND p.isFeatured = TRUE';
      }
      
      if (filters.host_id) {
        query += ' AND p.host_id = ?';
        queryParams.push(filters.host_id);
      }
      
      // Filtros de amenidades
      if (filters.amenities && Array.isArray(filters.amenities) && filters.amenities.length > 0) {
        query += ` AND EXISTS (
          SELECT 1 FROM property_amenities pa2 
          WHERE pa2.property_id = p.id 
          AND pa2.amenity IN (${filters.amenities.map(() => '?').join(',')})
          GROUP BY pa2.property_id
          HAVING COUNT(DISTINCT pa2.amenity) = ?
        )`;
        queryParams.push(...filters.amenities, filters.amenities.length);
      }
      
      // Filtros de mascotas permitidas
      if (filters.pets && Array.isArray(filters.pets) && filters.pets.length > 0) {
        query += ` AND EXISTS (
          SELECT 1 FROM property_pets_allowed ppa2 
          WHERE ppa2.property_id = p.id 
          AND ppa2.pet_type IN (${filters.pets.map(() => '?').join(',')})
          GROUP BY ppa2.property_id
          HAVING COUNT(DISTINCT ppa2.pet_type) = ?
        )`;
        queryParams.push(...filters.pets, filters.pets.length);
      }
      
      // Agrupar por ID de propiedad para evitar duplicados por los JOIN
      query += ' GROUP BY p.id';
      
      // Ordenación
      query += ' ORDER BY p.created_at DESC';
      
      // Paginación
      if (pagination.limit) {
        query += ' LIMIT ?';
        queryParams.push(parseInt(pagination.limit));
        
        if (pagination.offset) {
          query += ' OFFSET ?';
          queryParams.push(parseInt(pagination.offset));
        }
      }
      
      // Ejecutar consulta
      const [properties] = await connection.query(query, queryParams);
      
      // Consulta para obtener el total sin paginación
      let countQuery = `
        SELECT COUNT(DISTINCT p.id) as total 
        FROM properties p
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
        WHERE 1=1
      `;
      
      // Añadir filtro para excluir propiedades archivadas también en la consulta de conteo
      if (filters.includeArchived !== true) {
        countQuery += ' AND (p.archived IS NULL OR p.archived = FALSE)';
      }
      
      // Aplicar los mismos filtros a la consulta de conteo
      const countQueryParams = [];
      
      // Copiar los filtros sin incluir los de paginación
      if (filters.status) {
        countQuery += ' AND p.status = ?';
        countQueryParams.push(filters.status);
      }
      
      if (filters.property_type) {
        if (Array.isArray(filters.property_type)) {
          countQuery += ` AND p.property_type IN (${filters.property_type.map(() => '?').join(',')})`;
          countQueryParams.push(...filters.property_type);
        } else {
          countQuery += ' AND p.property_type = ?';
          countQueryParams.push(filters.property_type);
        }
      }
      
      if (filters.category) {
        countQuery += ' AND p.category LIKE ?';
        countQueryParams.push(`%${filters.category}%`);
      }
      
      if (filters.city) {
        countQuery += ' AND p.address LIKE ?';
        countQueryParams.push(`%${filters.city}%`);
      }
      
      if (filters.minBedrooms) {
        countQuery += ' AND p.bedrooms >= ?';
        countQueryParams.push(parseInt(filters.minBedrooms));
      }
      
      if (filters.minBathrooms) {
        countQuery += ' AND p.bathrooms >= ?';
        countQueryParams.push(parseFloat(filters.minBathrooms));
      }
      
      if (filters.minArea) {
        countQuery += ' AND p.square_feet >= ?';
        countQueryParams.push(parseFloat(filters.minArea));
      }
      
      if (filters.maxArea) {
        countQuery += ' AND p.square_feet <= ?';
        countQueryParams.push(parseFloat(filters.maxArea));
      }
      
      if (filters.verified) {
        countQuery += ' AND p.isVerified = TRUE';
      }
      
      if (filters.featured) {
        countQuery += ' AND p.isFeatured = TRUE';
      }
      
      if (filters.host_id) {
        countQuery += ' AND p.host_id = ?';
        countQueryParams.push(filters.host_id);
      }
      
      // Filtrós de amenidades para conteo
      if (filters.amenities && Array.isArray(filters.amenities) && filters.amenities.length > 0) {
        countQuery += ` AND EXISTS (
          SELECT 1 FROM property_amenities pa2 
          WHERE pa2.property_id = p.id 
          AND pa2.amenity IN (${filters.amenities.map(() => '?').join(',')})
          GROUP BY pa2.property_id
          HAVING COUNT(DISTINCT pa2.amenity) = ?
        )`;
        countQueryParams.push(...filters.amenities, filters.amenities.length);
      }
      
      // Filtros de mascotas para conteo
      if (filters.pets && Array.isArray(filters.pets) && filters.pets.length > 0) {
        countQuery += ` AND EXISTS (
          SELECT 1 FROM property_pets_allowed ppa2 
          WHERE ppa2.property_id = p.id 
          AND ppa2.pet_type IN (${filters.pets.map(() => '?').join(',')})
          GROUP BY ppa2.property_id
          HAVING COUNT(DISTINCT ppa2.pet_type) = ?
        )`;
        countQueryParams.push(...filters.pets, filters.pets.length);
      }
      
      // Ejecutar consulta de conteo
      const [countResult] = await connection.query(countQuery, countQueryParams);
      const totalCount = countResult[0]?.total || 0;
      
      connection.release();
      
      // Procesar y devolver resultados
      const processedProperties = properties.map(property => ({
        ...property,
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
  static async archive(id, reason = null) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        `UPDATE properties SET 
          archived = TRUE, 
          archived_at = CURRENT_TIMESTAMP, 
          archived_reason = ?, 
          status = 'unavailable'
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
  static async restore(id, newStatus = 'for-rent') {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        `UPDATE properties SET 
          archived = FALSE, 
          archived_at = NULL, 
          archived_reason = NULL, 
          status = ?
         WHERE id = ?`,
        [newStatus, id]
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