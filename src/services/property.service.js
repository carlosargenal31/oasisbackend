// src/services/property.service.js
import { mysqlPool } from '../config/database.js';
import { azureStorageService } from './azure-storage.service.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  AuthorizationError 
} from '../utils/errors/index.js';

// Importar el modelo Property (esto es lo que faltaba)
import { Property } from '../models/mysql/property.model.js';

export class PropertyService {
  static async createProperty(propertyData, imageFile, additionalImageFiles = []) {
    // Validaciones iniciales
    if (!propertyData.title || !propertyData.description || !propertyData.price) {
      throw new ValidationError('Datos de propiedad incompletos', [
        'title',
        'description',
        'price'
      ]);
    }
  
    // Validar precio
    if (propertyData.price <= 0) {
      throw new ValidationError('El precio debe ser mayor a 0');
    }
  
    // Validar tipo de propiedad
    const validTypes = ['house', 'apartment', 'room', 'office', 'commercial', 'land', 'daily-rental', 'new-building', 'parking-lot'];
    if (!validTypes.includes(propertyData.property_type)) {
      throw new ValidationError('Tipo de propiedad no válido');
    }
  
    // Convertir valores booleanos de string a valores booleanos reales
    // Esto soluciona el problema con MySQL
    propertyData.isNew = propertyData.isNew === 'true' || propertyData.isNew === true || propertyData.isNew === 1 ? 1 : 0;
    propertyData.isFeatured = propertyData.isFeatured === 'true' || propertyData.isFeatured === true || propertyData.isFeatured === 1 ? 1 : 0;
    propertyData.isVerified = propertyData.isVerified === 'true' || propertyData.isVerified === true || propertyData.isVerified === 1 ? 1 : 0;
  
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Si hay un archivo de imagen, subirlo a Azure
      let imageUrl = null;
      if (imageFile) {
        // Usar un ID temporal para la creación inicial
        const tempId = Date.now();
        imageUrl = await azureStorageService.uploadImage(imageFile, tempId);
      }
      
      // Insertar la propiedad
      const [result] = await connection.query(
        `INSERT INTO properties 
         (title, description, address, city, state, zip_code, price, 
          bedrooms, bathrooms, square_feet, property_type, status, host_id,
          image, isNew, isFeatured, isVerified, parkingSpaces, views, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          propertyData.title,
          propertyData.description,
          propertyData.address,
          propertyData.city || null,
          propertyData.state || null,
          propertyData.zip_code || null,
          propertyData.price,
          propertyData.bedrooms || null,
          propertyData.bathrooms || null,
          propertyData.square_feet || null,
          propertyData.property_type,
          propertyData.status || 'for-rent',
          propertyData.host_id,
          imageUrl,
          propertyData.isNew,
          propertyData.isFeatured,
          propertyData.isVerified,
          propertyData.parkingSpaces || 0,
          0, // Inicializar vistas en 0
          propertyData.lat || null,
          propertyData.lng || null
        ]
      ).catch(error => {
        console.error('Error al insertar propiedad:', error);
        throw new DatabaseError('Error al crear la propiedad');
      });
      
      const propertyId = result.insertId;
      
      // Si se subió una imagen con un ID temporal, actualizar la URL
      if (imageUrl && imageFile) {
        // Subir la imagen de nuevo con el ID correcto
        const finalImageUrl = await azureStorageService.uploadImage(imageFile, propertyId);
        
        // Actualizar la URL en la base de datos
        await connection.query(
          `UPDATE properties SET image = ? WHERE id = ?`,
          [finalImageUrl, propertyId]
        );
        
        // Eliminar la imagen temporal
        await azureStorageService.deleteImage(imageUrl);
        
        imageUrl = finalImageUrl;
      }
  
      // Procesar imágenes adicionales
      const additionalImageUrls = [];
      if (additionalImageFiles && additionalImageFiles.length > 0) {
        for (const file of additionalImageFiles) {
          try {
            // Subir imagen adicional
            const additionalImageUrl = await azureStorageService.uploadImage(file, `${propertyId}-additional-${Date.now()}`);
            
            // Insertar en la tabla property_images
            await connection.query(
              `INSERT INTO property_images (property_id, image_url, is_primary) VALUES (?, ?, ?)`,
              [propertyId, additionalImageUrl, false]
            );
            
            additionalImageUrls.push(additionalImageUrl);
          } catch (error) {
            console.error('Error al procesar imagen adicional:', error);
            // Continuamos con las siguientes imágenes si hay error
          }
        }
      }
      
      // Insertar amenidades si existen
      if (propertyData.amenities && Array.isArray(propertyData.amenities) && propertyData.amenities.length > 0) {
        const amenityValues = propertyData.amenities.map(amenity => [propertyId, amenity]);
        await connection.query(
          `INSERT INTO property_amenities (property_id, amenity) VALUES ?`,
          [amenityValues]
        ).catch(error => {
          console.error('Error al insertar amenidades:', error);
          // No lanzamos error para no interrumpir la creación de la propiedad
        });
      }
      
      // Insertar mascotas permitidas si existen
      if (propertyData.pets_allowed && Array.isArray(propertyData.pets_allowed) && propertyData.pets_allowed.length > 0) {
        const petsValues = propertyData.pets_allowed.map(pet => [propertyId, pet]);
        await connection.query(
          `INSERT INTO property_pets_allowed (property_id, pet_type) VALUES ?`,
          [petsValues]
        ).catch(error => {
          console.error('Error al insertar mascotas permitidas:', error);
          // No lanzamos error para no interrumpir la creación de la propiedad
        });
      }
      
      await connection.commit();
      
      return {
        propertyId,
        imageUrl,
        additionalImageUrls
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getProperties(filters = {}) {
    const connection = await mysqlPool.getConnection();
    try {
      // Consulta base
      let query = `
        SELECT p.*, 
               GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
               GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed,
               u.first_name as host_first_name,
               u.last_name as host_last_name,
               u.profile_image as host_profile_image,
               u.short_bio as host_bio
        FROM properties p
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
        LEFT JOIN users u ON p.host_id = u.id
        WHERE 1=1
      `;
      
      const params = [];
  
      // Aplicar todos los filtros existentes (el código de filtros se mantiene igual)
      if (filters.status) {
        query += ' AND p.status = ?';
        params.push(filters.status);
      }
      
      // Filtro por tipo de propiedad
      if (filters.property_type) {
        if (Array.isArray(filters.property_type)) {
          query += ` AND p.property_type IN (${filters.property_type.map(() => '?').join(',')})`;
          params.push(...filters.property_type);
        } else {
          query += ' AND p.property_type = ?';
          params.push(filters.property_type);
        }
      }
  
      // Filtros de precio
      if (filters.minPrice) {
        query += ' AND p.price >= ?';
        params.push(parseFloat(filters.minPrice));
      }
  
      if (filters.maxPrice) {
        query += ' AND p.price <= ?';
        params.push(parseFloat(filters.maxPrice));
      }
  
      // Filtros de ubicación
      if (filters.city) {
        query += ' AND p.city LIKE ?';
        params.push(`%${filters.city}%`);
      }
  
      // Filtros de características
      if (filters.minBedrooms) {
        query += ' AND p.bedrooms >= ?';
        params.push(parseInt(filters.minBedrooms));
      }
  
      if (filters.minBathrooms) {
        query += ' AND p.bathrooms >= ?';
        params.push(parseFloat(filters.minBathrooms));
      }
      
      // Filtros de área
      if (filters.minArea) {
        query += ' AND p.square_feet >= ?';
        params.push(parseFloat(filters.minArea));
      }
      
      if (filters.maxArea) {
        query += ' AND p.square_feet <= ?';
        params.push(parseFloat(filters.maxArea));
      }
      
      // Filtro de verificación
      if (filters.verified) {
        query += ' AND p.isVerified = TRUE';
      }
      
      // Filtro de destacados
      if (filters.featured) {
        query += ' AND p.isFeatured = TRUE';
      }
      
      // Filtro por anfitrión
      if (filters.host_id) {
        query += ' AND p.host_id = ?';
        params.push(filters.host_id);
      }
      
      // Filtro por amenidades
      if (filters.amenities && Array.isArray(filters.amenities) && filters.amenities.length > 0) {
        query += ` AND EXISTS (
          SELECT 1 FROM property_amenities pa2 
          WHERE pa2.property_id = p.id 
          AND pa2.amenity IN (${filters.amenities.map(() => '?').join(',')})
          GROUP BY pa2.property_id
          HAVING COUNT(DISTINCT pa2.amenity) = ?
        )`;
        params.push(...filters.amenities, filters.amenities.length);
      }
      
      // Filtro por mascotas permitidas
      if (filters.pets && Array.isArray(filters.pets) && filters.pets.length > 0) {
        query += ` AND EXISTS (
          SELECT 1 FROM property_pets_allowed ppa2 
          WHERE ppa2.property_id = p.id 
          AND ppa2.pet_type IN (${filters.pets.map(() => '?').join(',')})
          GROUP BY ppa2.property_id
          HAVING COUNT(DISTINCT ppa2.pet_type) = ?
        )`;
        params.push(...filters.pets, filters.pets.length);
      }
  
      // Agrupar por ID de propiedad para evitar duplicados por los JOIN
      query += ' GROUP BY p.id';
      
      // Ordenar por fecha de creación, más recientes primero
      query += ' ORDER BY p.created_at DESC';
      
      // Paginación
      let paginationParams = [];
      if (filters.page && filters.limit) {
        const offset = (parseInt(filters.page) - 1) * parseInt(filters.limit);
        query += ' LIMIT ? OFFSET ?';
        paginationParams = [parseInt(filters.limit), offset];
      }
  
      // Ejecutar la consulta
      const [properties] = await connection.query(
        query, 
        [...params, ...paginationParams]
      ).catch(error => {
        console.error('Error al obtener propiedades:', error);
        throw new DatabaseError('Error al obtener las propiedades');
      });
  
      // Obtener el total de propiedades (sin LIMIT)
      let countQuery = query.replace(/SELECT p\.\*,[\s\S]*?FROM/, 'SELECT COUNT(DISTINCT p.id) as total FROM');
      countQuery = countQuery.replace(/GROUP BY p\.id[\s\S]*$/, '');
      
      const [totalResult] = await connection.query(countQuery, params);
      const total = totalResult[0]?.total || 0;
  
      // Procesar las propiedades con datos adicionales
      const processedProperties = await Promise.all(properties.map(async property => {
        // Procesar datos base
        const processedProperty = {
          ...property,
          amenities: property.amenities ? property.amenities.split(',') : [],
          pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : [],
          host_name: `${property.host_first_name || ''} ${property.host_last_name || ''}`.trim() || 'Anfitrión'
        };
        
        // Obtener imágenes adicionales para cada propiedad
        const [images] = await connection.query(
          `SELECT image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY is_primary DESC`,
          [property.id]
        ).catch(error => {
          console.error(`Error al obtener imágenes para propiedad ${property.id}:`, error);
          return [[]]; // Retornar un array vacío en caso de error
        });
        
        if (images && images.length > 0) {
          processedProperty.additional_images = images.map(img => img.image_url);
        } else {
          processedProperty.additional_images = [];
        }
        
        // Obtener calificación promedio del anfitrión
        const [hostRating] = await connection.query(
          `SELECT AVG(r.rating) as host_average_rating
           FROM reviews r
           JOIN properties p ON r.property_id = p.id
           WHERE p.host_id = ?`,
          [property.host_id]
        ).catch(error => {
          console.error(`Error al obtener calificación del anfitrión ${property.host_id}:`, error);
          return [[{ host_average_rating: 0 }]];
        });
        
        processedProperty.host_average_rating = hostRating[0]?.host_average_rating || 0;
        
        // Obtener conteo de reseñas del anfitrión
        const [hostReviews] = await connection.query(
          `SELECT COUNT(*) as host_review_count
           FROM reviews r
           JOIN properties p ON r.property_id = p.id
           WHERE p.host_id = ?`,
          [property.host_id]
        ).catch(error => {
          console.error(`Error al obtener conteo de reseñas del anfitrión ${property.host_id}:`, error);
          return [[{ host_review_count: 0 }]];
        });
        
        processedProperty.host_review_count = hostReviews[0]?.host_review_count || 0;
        
        return processedProperty;
      }));
  
      return {
        properties: processedProperties,
        total
      };
    } catch (error) {
      console.error('Error en getProperties:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Método getPropertyById actualizado en property.service.js
static async getPropertyById(id) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Obtener la propiedad con amenidades, mascotas permitidas y datos básicos del anfitrión
    const [properties] = await connection.query(
      `SELECT p.*, 
              GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
              GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed,
              u.first_name as host_first_name,
              u.last_name as host_last_name,
              u.profile_image as host_profile_image,
              u.short_bio as host_bio
       FROM properties p
       LEFT JOIN property_amenities pa ON p.id = pa.property_id
       LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
       LEFT JOIN users u ON p.host_id = u.id
       WHERE p.id = ?
       GROUP BY p.id`,
      [id]
    ).catch(error => {
      console.error('Error al obtener la propiedad:', error);
      throw new DatabaseError('Error al obtener la propiedad');
    });

    if (properties.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }
    
    // Procesar la propiedad
    const property = {
      ...properties[0],
      amenities: properties[0].amenities ? properties[0].amenities.split(',') : [],
      pets_allowed: properties[0].pets_allowed ? properties[0].pets_allowed.split(',') : [],
      host_name: `${properties[0].host_first_name || ''} ${properties[0].host_last_name || ''}`.trim() || 'Anfitrión'
    };
    
    // Obtener imágenes adicionales
    const [images] = await connection.query(
      `SELECT image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY is_primary DESC`,
      [id]
    ).catch(error => {
      console.error('Error al obtener imágenes:', error);
      // No lanzamos error para no interrumpir la obtención de la propiedad
    });
    
    if (images && images.length > 0) {
      property.additional_images = images.map(img => img.image_url);
    } else {
      property.additional_images = [];
    }
    
    // Obtener calificación promedio del anfitrión
    const [hostRating] = await connection.query(
      `SELECT AVG(r.rating) as host_average_rating
       FROM reviews r
       JOIN properties p ON r.property_id = p.id
       WHERE p.host_id = ?`,
      [property.host_id]
    ).catch(error => {
      console.error('Error al obtener calificación del anfitrión:', error);
      // No lanzamos error para no interrumpir la obtención de la propiedad
    });
    
    if (hostRating && hostRating.length > 0) {
      property.host_average_rating = hostRating[0].host_average_rating || 0;
    }
    
    // Obtener conteo de reseñas del anfitrión
    const [hostReviews] = await connection.query(
      `SELECT COUNT(*) as host_review_count
       FROM reviews r
       JOIN properties p ON r.property_id = p.id
       WHERE p.host_id = ?`,
      [property.host_id]
    ).catch(error => {
      console.error('Error al obtener conteo de reseñas del anfitrión:', error);
      // No lanzamos error para no interrumpir la obtención de la propiedad
    });
    
    if (hostReviews && hostReviews.length > 0) {
      property.host_review_count = hostReviews[0].host_review_count || 0;
    }

    return property;
  } finally {
    connection.release();
  }
}

static async archiveProperty(id, archiveData = {}, userId) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Verificar si la propiedad existe y pertenece al usuario
    const [property] = await connection.query(
      'SELECT host_id FROM properties WHERE id = ?',
      [id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Verificar autorización
    if (property[0].host_id !== userId) {
      throw new AuthorizationError('No autorizado para archivar esta propiedad');
    }

    // Archivar la propiedad
    await connection.query(
      `UPDATE properties SET 
         archived = 1, 
         archived_at = NOW(), 
         archived_reason = ?, 
         status = 'unavailable'
       WHERE id = ?`,
      [archiveData.reason || 'No especificada', id]
    );

    return true;
  } catch (error) {
    console.error('Error archivando propiedad:', error);
    throw error;
  } finally {
    connection.release();
  }
}
static async restoreProperty(id, status = 'for-rent', userId) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Verificar si la propiedad existe y pertenece al usuario
    const [property] = await connection.query(
      'SELECT host_id FROM properties WHERE id = ?',
      [id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Verificar autorización
    if (property[0].host_id !== userId) {
      throw new AuthorizationError('No autorizado para restaurar esta propiedad');
    }

    // Restaurar la propiedad
    await connection.query(
      `UPDATE properties SET 
         archived = 0, 
         archived_at = NULL, 
         archived_reason = NULL, 
         status = ?
       WHERE id = ?`,
      [status, id]
    );

    return true;
  } catch (error) {
    console.error('Error restaurando propiedad:', error);
    throw error;
  } finally {
    connection.release();
  }
}
static async getArchivedProperties(userId, pagination = { page: 1, limit: 10 }) {
  if (!userId) {
    throw new ValidationError('ID de usuario es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Consulta base para propiedades archivadas
    let query = `
      SELECT p.*, 
             GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
             GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
      FROM properties p
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
      WHERE p.host_id = ? AND p.archived = TRUE
    `;
    
    const params = [userId];
    
    // Agrupar por ID de propiedad
    query += ' GROUP BY p.id';
    
    // Ordenar por fecha de archivado, más recientes primero
    query += ' ORDER BY p.archived_at DESC';
    
    // Paginación
    if (pagination.page && pagination.limit) {
      const offset = (parseInt(pagination.page) - 1) * parseInt(pagination.limit);
      query += ' LIMIT ? OFFSET ?';
      params.push(parseInt(pagination.limit), offset);
    }

    // Ejecutar consulta
    const [properties] = await connection.query(query, params);
    
    // Consulta para obtener el total sin paginación
    const [countResult] = await connection.query(
      'SELECT COUNT(*) as total FROM properties WHERE host_id = ? AND archived = TRUE',
      [userId]
    );
    
    const total = countResult[0].total || 0;
    
    // Procesar los resultados
    const processedProperties = properties.map(property => ({
      ...property,
      amenities: property.amenities ? property.amenities.split(',') : [],
      pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
    }));
    
    return {
      properties: processedProperties,
      total,
      page: parseInt(pagination.page),
      limit: parseInt(pagination.limit),
      totalPages: Math.ceil(total / parseInt(pagination.limit))
    };
  } catch (error) {
    console.error('Error al obtener propiedades archivadas:', error);
    throw new DatabaseError('Error al obtener propiedades archivadas');
  } finally {
    connection.release();
  }
}
  static async updateProperty(id, propertyData, imageFile, userId) {
    if (!id) {
      throw new ValidationError('ID de propiedad es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Verificar si la propiedad existe y pertenece al usuario
      const [property] = await connection.query(
        'SELECT host_id, image FROM properties WHERE id = ?',
        [id]
      );

      if (property.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      // Verificar autorización
      if (property[0].host_id !== userId) {
        throw new AuthorizationError('No autorizado para actualizar esta propiedad');
      }
      
      // Si hay un archivo de imagen, subirlo a Azure
      let imageUrl = null;
      if (imageFile) {
        imageUrl = await azureStorageService.uploadImage(imageFile, id);
        propertyData.image = imageUrl;
        
        // Si había una imagen anterior, eliminarla
        if (property[0].image) {
          try {
            await azureStorageService.deleteImage(property[0].image);
          } catch (error) {
            console.warn('No se pudo eliminar la imagen anterior:', error);
            // No interrumpimos la actualización por este error
          }
        }
      }

      // Actualizar la propiedad
      const updateFields = [];
      const updateParams = [];
      
      // Procesar cada campo para la actualización
      const fields = [
        'title', 'description', 'address', 'city', 'state', 'zip_code', 
        'price', 'bedrooms', 'bathrooms', 'square_feet', 'property_type', 
        'status', 'image', 'isNew', 'isFeatured', 'isVerified', 
        'parkingSpaces', 'lat', 'lng'
      ];
      
      fields.forEach(field => {
        if (propertyData[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          updateParams.push(propertyData[field]);
        }
      });
      
      if (updateFields.length > 0) {
        updateParams.push(id);
        await connection.query(
          `UPDATE properties SET ${updateFields.join(', ')} WHERE id = ?`,
          updateParams
        ).catch(error => {
          console.error('Error al actualizar propiedad:', error);
          throw new DatabaseError('Error al actualizar la propiedad');
        });
      }
      
      // Si hay amenidades nuevas, actualizar
      if (propertyData.amenities && Array.isArray(propertyData.amenities)) {
        // Eliminar amenidades existentes
        await connection.query(
          'DELETE FROM property_amenities WHERE property_id = ?',
          [id]
        );
        
        // Insertar nuevas amenidades
        if (propertyData.amenities.length > 0) {
          const amenityValues = propertyData.amenities.map(amenity => [id, amenity]);
          await connection.query(
            `INSERT INTO property_amenities (property_id, amenity) VALUES ?`,
            [amenityValues]
          ).catch(error => {
            console.error('Error al insertar amenidades:', error);
            // No lanzamos error para no interrumpir la actualización
          });
        }
      }
      
      // Si hay mascotas permitidas nuevas, actualizar
      if (propertyData.pets_allowed && Array.isArray(propertyData.pets_allowed)) {
        // Eliminar registros existentes
        await connection.query(
          'DELETE FROM property_pets_allowed WHERE property_id = ?',
          [id]
        );
        
        // Insertar nuevos registros
        if (propertyData.pets_allowed.length > 0) {
          const petsValues = propertyData.pets_allowed.map(pet => [id, pet]);
          await connection.query(
            `INSERT INTO property_pets_allowed (property_id, pet_type) VALUES ?`,
            [petsValues]
          ).catch(error => {
            console.error('Error al insertar mascotas permitidas:', error);
            // No lanzamos error para no interrumpir la actualización
          });
        }
      }
      
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async deleteProperty(id, userId) {
    if (!id) {
      throw new ValidationError('ID de propiedad es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Verificar si la propiedad existe y pertenece al usuario
      const [property] = await connection.query(
        'SELECT host_id, image FROM properties WHERE id = ?',
        [id]
      );

      if (property.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      // Verificar autorización
      if (property[0].host_id !== userId) {
        throw new AuthorizationError('No autorizado para eliminar esta propiedad');
      }

      // Verificar si hay reservas activas
      const [activeBookings] = await connection.query(
        'SELECT id FROM bookings WHERE property_id = ? AND status IN ("confirmed", "pending")',
        [id]
      );

      if (activeBookings.length > 0) {
        throw new ValidationError('No se puede eliminar una propiedad con reservas activas');
      }
      
      // Obtener todas las imágenes de la propiedad
      const [images] = await connection.query(
        'SELECT image_url FROM property_images WHERE property_id = ?',
        [id]
      );
      
      // Eliminar la propiedad (las tablas relacionadas se eliminarán por CASCADE)
      const [result] = await connection.query(
        'DELETE FROM properties WHERE id = ?',
        [id]
      ).catch(error => {
        console.error('Error al eliminar propiedad:', error);
        throw new DatabaseError('Error al eliminar la propiedad');
      });
      
      // Si la propiedad tenía imagen principal, eliminarla de Azure
      if (property[0].image) {
        try {
          await azureStorageService.deleteImage(property[0].image);
        } catch (error) {
          console.warn('No se pudo eliminar la imagen principal:', error);
          // No interrumpimos la eliminación por este error
        }
      }
      
      // Eliminar imágenes adicionales de Azure
      if (images && images.length > 0) {
        for (const image of images) {
          try {
            await azureStorageService.deleteImage(image.image_url);
          } catch (error) {
            console.warn(`No se pudo eliminar la imagen ${image.image_url}:`, error);
            // No interrumpimos la eliminación por este error
          }
        }
      }
      
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async addPropertyImage(propertyId, imageFile, isPrimary = false, userId) {
    if (!propertyId || !imageFile) {
      throw new ValidationError('ID de propiedad y archivo de imagen son requeridos');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la propiedad existe y pertenece al usuario
      const [property] = await connection.query(
        'SELECT host_id FROM properties WHERE id = ?',
        [propertyId]
      );

      if (property.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      // Verificar autorización
      if (property[0].host_id !== userId) {
        throw new AuthorizationError('No autorizado para añadir imágenes a esta propiedad');
      }
      
      // Subir la imagen a Azure
      const imageUrl = await azureStorageService.uploadImage(imageFile, propertyId);
      
      // Si es imagen principal, actualizar la propiedad
      if (isPrimary) {
        // Obtener la imagen principal actual
        const [currentPrimary] = await connection.query(
          'SELECT image FROM properties WHERE id = ?',
          [propertyId]
        );
        
        // Actualizar la propiedad con la nueva imagen principal
        await connection.query(
          'UPDATE properties SET image = ? WHERE id = ?',
          [imageUrl, propertyId]
        );
        
        // Si había una imagen principal anterior, eliminarla de Azure
        if (currentPrimary[0].image) {
          try {
            await azureStorageService.deleteImage(currentPrimary[0].image);
          } catch (error) {
            console.warn('No se pudo eliminar la imagen principal anterior:', error);
            // No interrumpimos la operación por este error
          }
        }
      } else {
        // Insertar la imagen como adicional
        await connection.query(
          'INSERT INTO property_images (property_id, image_url, is_primary) VALUES (?, ?, ?)',
          [propertyId, imageUrl, false]
        );
      }
      
      return { imageUrl };
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }

  static async searchProperties(searchTerm) {
    if (!searchTerm) {
      throw new ValidationError('Término de búsqueda es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      const searchPattern = `%${searchTerm}%`;
      
      const query = `
        SELECT p.*, 
               GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
               GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
        FROM properties p
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
        WHERE (
          p.title LIKE ? 
          OR p.description LIKE ? 
          OR p.address LIKE ? 
          OR p.city LIKE ?
          OR p.state LIKE ?
          OR p.zip_code LIKE ?
        )
        GROUP BY p.id
        ORDER BY 
          CASE 
            WHEN p.title LIKE ? THEN 1
            WHEN p.description LIKE ? THEN 2
            WHEN p.address LIKE ? THEN 3
            WHEN p.city LIKE ? THEN 4
            ELSE 5
          END,
          p.created_at DESC
      `;
      
      const [properties] = await connection.query(
        query,
        [
          searchPattern,
          searchPattern,
          searchPattern,
          searchPattern,
          searchPattern,
          searchPattern,
          searchPattern,
          searchPattern,
          searchPattern,
          searchPattern
        ]
      ).catch(error => {
        console.error('Error al buscar propiedades:', error);
        throw new DatabaseError('Error al buscar propiedades');
      });

      // Procesar los resultados
      return properties.map(property => ({
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : [],
        matches_found_in: [
          property.title?.toLowerCase().includes(searchTerm.toLowerCase()) && 'title',
          property.description?.toLowerCase().includes(searchTerm.toLowerCase()) && 'description',
          property.address?.toLowerCase().includes(searchTerm.toLowerCase()) && 'address',
          property.city?.toLowerCase().includes(searchTerm.toLowerCase()) && 'city',
          property.state?.toLowerCase().includes(searchTerm.toLowerCase()) && 'state',
          property.zip_code?.includes(searchTerm) && 'zip_code'
        ].filter(Boolean)
      }));
    } finally {
      connection.release();
    }
  }
  
  static async getFeaturedProperties(limit = 6, status = null) {
    const connection = await mysqlPool.getConnection();
    try {
      let query = `
        SELECT p.*, 
               GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
               GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
        FROM properties p
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
        WHERE p.isFeatured = TRUE
      `;
      
      const params = [];
      
      if (status) {
        query += ' AND p.status = ?';
        params.push(status);
      }
      
      query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?';
      params.push(limit);
      
      const [properties] = await connection.query(query, params);
      
      // Procesar los resultados
      return properties.map(property => ({
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
      }));
    } catch (error) {
      console.error('Error al obtener propiedades destacadas:', error);
      throw new DatabaseError('Error al obtener propiedades destacadas');
    } finally {
      connection.release();
    }
  }
  
  static async getRecentProperties(limit = 6, status = null) {
    const connection = await mysqlPool.getConnection();
    try {
      let query = `
        SELECT p.*, 
               GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
               GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
        FROM properties p
        LEFT JOIN property_amenities pa ON p.id = pa.property_id
        LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
      `;
      
      const params = [];
      
      if (status) {
        query += ' WHERE p.status = ?';
        params.push(status);
      }
      
      query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?';
      params.push(limit);
      
      const [properties] = await connection.query(query, params);
      
      // Procesar los resultados
      return properties.map(property => ({
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
      }));
    } catch (error) {
      console.error('Error al obtener propiedades recientes:', error);
      throw new DatabaseError('Error al obtener propiedades recientes');
    } finally {
      connection.release();
    }
  }
  
  static async getPropertyCountByCity() {
    const connection = await mysqlPool.getConnection();
    try {
      const [results] = await connection.query(`
        SELECT city, COUNT(*) as count
        FROM properties
        GROUP BY city
        ORDER BY count DESC
      `);
      
      return results;
    } catch (error) {
      console.error('Error al obtener conteo de propiedades por ciudad:', error);
      throw new DatabaseError('Error al obtener estadísticas de propiedades');
    } finally {
      connection.release();
    }
  }

  /**
   * Incrementa el contador de vistas de una propiedad
   * @param {number} id - ID de la propiedad
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async incrementPropertyViews(id) {
    if (!id) {
      throw new ValidationError('ID de propiedad es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la propiedad existe
      const [property] = await connection.query(
        'SELECT id, views FROM properties WHERE id = ?',
        [id]
      );

      if (property.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      // Incrementar las vistas
      const currentViews = property[0].views || 0;
      const [result] = await connection.query(
        'UPDATE properties SET views = ? WHERE id = ?',
        [currentViews + 1, id]
      );

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error al incrementar vistas:', error);
      throw new DatabaseError('Error al incrementar vistas de la propiedad');
    } finally {
      connection.release();
    }
  }
}