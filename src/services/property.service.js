// src/services/property.service.js
import { mysqlPool } from '../config/database.js';
import { azureStorageService } from './azure-storage.service.js';
import { 
  ValidationError, 
  NotFoundError, 
  DatabaseError,
  AuthorizationError 
} from '../utils/errors/index.js';

// Importar el modelo Property
import { Property } from '../models/mysql/property.model.js';

export class PropertyService {
  static async createProperty(propertyData, imageFile, additionalImageFiles = []) {
    // Validaciones iniciales
    if (!propertyData.title || !propertyData.price || !propertyData.address || !propertyData.city) {
      throw new ValidationError('Datos de propiedad incompletos', [
        'title',
        'price', 
        'address',
        'city'
      ]);
    }
  
    // Validar precio
    const price = parseFloat(propertyData.price);
    if (isNaN(price) || price <= 0) {
      throw new ValidationError('El precio debe ser mayor a 0');
    }
  
    // Validar tipo de propiedad
    const validTypes = ['house', 'apartment', 'room', 'office', 'commercial', 'land', 'daily-rental', 'new-building', 'parking-lot'];
    if (!validTypes.includes(propertyData.property_type)) {
      throw new ValidationError('Tipo de propiedad no válido');
    }

    // Validar status
    const validStatuses = ['for-rent', 'for-sale'];
    if (!validStatuses.includes(propertyData.status)) {
      throw new ValidationError('Status no válido');
    }

    // Procesar datos numéricos de manera segura
    const processedData = {
      title: propertyData.title,
      description: propertyData.description || null,
      address: propertyData.address,
      city: propertyData.city,
      state: propertyData.state || null,
      zip_code: propertyData.zip_code || null,
      price: price,
      bedrooms: propertyData.bedrooms ? parseInt(propertyData.bedrooms) : null,
      bathrooms: propertyData.bathrooms ? parseFloat(propertyData.bathrooms) : null,
      square_feet: propertyData.square_feet ? parseFloat(propertyData.square_feet) : null,
      property_type: propertyData.property_type,
      status: propertyData.status || 'for-rent',
      host_id: propertyData.host_id,
      parkingSpaces: propertyData.parkingSpaces ? parseInt(propertyData.parkingSpaces) : 0,
      lat: propertyData.lat ? parseFloat(propertyData.lat) : null,
      lng: propertyData.lng ? parseFloat(propertyData.lng) : null,
      district: propertyData.district || null
    };

    // Procesar amenidades (convertir de objeto FormData a array)
    let amenities = [];
    if (propertyData.amenities) {
      if (Array.isArray(propertyData.amenities)) {
        amenities = propertyData.amenities;
      } else if (typeof propertyData.amenities === 'string') {
        try {
          amenities = JSON.parse(propertyData.amenities);
        } catch {
          amenities = [propertyData.amenities];
        }
      }
    }

    // Procesar mascotas permitidas
    let pets_allowed = [];
    if (propertyData.pets_allowed) {
      if (Array.isArray(propertyData.pets_allowed)) {
        pets_allowed = propertyData.pets_allowed;
      } else if (typeof propertyData.pets_allowed === 'string') {
        try {
          pets_allowed = JSON.parse(propertyData.pets_allowed);
        } catch {
          pets_allowed = [propertyData.pets_allowed];
        }
      }
    }

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
          image, parkingSpaces, views, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          processedData.title,
          processedData.description,
          processedData.address,
          processedData.city,
          processedData.state,
          processedData.zip_code,
          processedData.price,
          processedData.bedrooms,
          processedData.bathrooms,
          processedData.square_feet,
          processedData.property_type,
          processedData.status,
          processedData.host_id,
          imageUrl,
          processedData.parkingSpaces,
          0, // Inicializar vistas en 0
          processedData.lat,
          processedData.lng
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
      if (amenities && amenities.length > 0) {
        const amenityValues = amenities.map(amenity => [propertyId, amenity]);
        await connection.query(
          `INSERT INTO property_amenities (property_id, amenity) VALUES ?`,
          [amenityValues]
        ).catch(error => {
          console.error('Error al insertar amenidades:', error);
          // No lanzamos error para no interrumpir la creación de la propiedad
        });
      }
      
      // Insertar mascotas permitidas si existen
      if (pets_allowed && pets_allowed.length > 0) {
        const petsValues = pets_allowed.map(pet => [propertyId, pet]);
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
             GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
      FROM properties p
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
      WHERE p.deleted = FALSE
    `;
    
    const params = [];

    // Filtro por status (for-rent, for-sale, sold, rented, etc.)
    if (filters.status) {
      // Manejar múltiples estados separados por coma
      if (typeof filters.status === 'string' && filters.status.includes(',')) {
        const statuses = filters.status.split(',').map(s => s.trim());
        query += ` AND p.status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      } else if (Array.isArray(filters.status)) {
        query += ` AND p.status IN (${filters.status.map(() => '?').join(',')})`;
        params.push(...filters.status);
      } else {
        query += ' AND p.status = ?';
        params.push(filters.status);
      }
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

    // Filtro por archivado
    if (filters.archived !== undefined) {
      if (filters.archived === 'true' || filters.archived === true) {
        query += ' AND p.archived = TRUE';
      } else if (filters.archived === 'false' || filters.archived === false) {
        query += ' AND p.archived = FALSE';
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
    if (filters.page && filters.limit) {
      const offset = (parseInt(filters.page) - 1) * parseInt(filters.limit);
      query += ' LIMIT ? OFFSET ?';
      params.push(parseInt(filters.limit), offset);
    }

    console.log('Executing query:', query);
    console.log('With params:', params);

    // Ejecutar la consulta
    const [properties] = await connection.query(query, params)
      .catch(error => {
        console.error('Error al obtener propiedades:', error);
        throw new DatabaseError('Error al obtener las propiedades');
      });

    // Procesar los resultados
    const processedProperties = properties.map(property => {
      // Convertir las cadenas de amenidades y mascotas permitidas en arrays
      return {
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
      };
    });
    
    // Obtener el total de propiedades (sin LIMIT) para la misma consulta
    let countQuery = query.replace(/SELECT p\.\*,[\s\S]*?FROM/, 'SELECT COUNT(DISTINCT p.id) as total FROM');
    countQuery = countQuery.replace(/GROUP BY p\.id[\s\S]*$/, '');
    
    // Remover los parámetros de LIMIT/OFFSET para el conteo
    let countParams = [...params];
    if (filters.page && filters.limit) {
      countParams = countParams.slice(0, -2);
    }
    
    const [totalResult] = await connection.query(countQuery, countParams);
    const total = totalResult[0]?.total || 0;

    console.log(`Found ${processedProperties.length} properties, total: ${total}`);

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

/**
 * Actualizar solo el estado de una propiedad
 */
static async updatePropertyStatus(id, status, userId) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Verificar si la propiedad existe y pertenece al usuario
    const [property] = await connection.query(
      'SELECT host_id, status as current_status FROM properties WHERE id = ?',
      [id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Verificar autorización
    if (property[0].host_id !== userId) {
      throw new AuthorizationError('No autorizado para actualizar esta propiedad');
    }

    // Actualizar solo el estado
    const [result] = await connection.query(
      `UPDATE properties SET 
         status = ?, 
         updated_at = NOW()
       WHERE id = ?`,
      [status, id]
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error actualizando estado de propiedad:', error);
    throw error;
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
        'status', 'image', 'parkingSpaces', 'lat', 'lng'
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

  // Método actualizado para archivar propiedades
static async archiveProperty(id, archiveData = {}, userId) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Verificar si la propiedad existe y pertenece al usuario
    const [property] = await connection.query(
      'SELECT host_id, status FROM properties WHERE id = ?',
      [id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Verificar autorización
    if (property[0].host_id !== userId) {
      throw new AuthorizationError('No autorizado para archivar esta propiedad');
    }

    // Guardar el estado original y archivar la propiedad
    await connection.query(
      `UPDATE properties SET 
         archived = 1, 
         archived_at = NOW(), 
         archived_reason = ?, 
         original_status = ?,
         status = 'unavailable'
       WHERE id = ?`,
      [archiveData.reason || 'No especificada', property[0].status, id]
    );

    return true;
  } catch (error) {
    console.error('Error archivando propiedad:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Método actualizado para restaurar propiedades
static async restoreProperty(id, statusOverride = null, userId) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    // Verificar si la propiedad existe y pertenece al usuario
    const [property] = await connection.query(
      'SELECT host_id, original_status FROM properties WHERE id = ?',
      [id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Verificar autorización
    if (property[0].host_id !== userId) {
      throw new AuthorizationError('No autorizado para restaurar esta propiedad');
    }

    // Determinar el estado a restaurar
    // Prioridad: statusOverride > original_status > 'for-rent' (fallback)
    const statusToRestore = statusOverride || property[0].original_status || 'for-rent';

    // Restaurar la propiedad
    await connection.query(
      `UPDATE properties SET 
         archived = 0, 
         archived_at = NULL, 
         archived_reason = NULL, 
         status = ?,
         original_status = NULL
       WHERE id = ?`,
      [statusToRestore, id]
    );

    return true;
  } catch (error) {
    console.error('Error restaurando propiedad:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Confirmar venta de una propiedad
 */
static async confirmSale(id, saleData, userId) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Verificar si la propiedad existe y pertenece al usuario
    const [property] = await connection.query(
      'SELECT host_id, status, title FROM properties WHERE id = ?',
      [id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Verificar autorización
    if (property[0].host_id !== userId) {
      throw new AuthorizationError('No autorizado para confirmar la venta de esta propiedad');
    }

    // Verificar que la propiedad esté en venta
    if (property[0].status !== 'for-sale') {
      throw new ValidationError('Solo se pueden confirmar ventas de propiedades marcadas como "en venta"');
    }

    // Actualizar el estado de la propiedad a vendida
    await connection.query(
      `UPDATE properties SET 
         status = 'sold', 
         updated_at = NOW()
       WHERE id = ?`,
      [id]
    );

    // Registrar los detalles de la venta en una tabla separada
    const saleRecord = {
      property_id: id,
      sale_price: saleData.sale_price || null,
      buyer_name: saleData.buyer_name || null,
      buyer_email: saleData.buyer_email || null,
      buyer_phone: saleData.buyer_phone || null,
      sale_date: saleData.sale_date || new Date(),
      notes: saleData.notes || null,
      confirmed_by: userId,
      confirmed_at: new Date()
    };

    // Crear tabla de ventas si no existe
    await connection.query(`
      CREATE TABLE IF NOT EXISTS property_sales (
        id INT PRIMARY KEY AUTO_INCREMENT,
        property_id INT NOT NULL,
        sale_price DECIMAL(15,2),
        buyer_name VARCHAR(255),
        buyer_email VARCHAR(255),
        buyer_phone VARCHAR(50),
        sale_date DATE,
        notes TEXT,
        confirmed_by INT,
        confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (confirmed_by) REFERENCES users(id)
      )
    `);

    // Insertar el registro de venta
    await connection.query(
      `INSERT INTO property_sales 
       (property_id, sale_price, buyer_name, buyer_email, buyer_phone, sale_date, notes, confirmed_by, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleRecord.property_id,
        saleRecord.sale_price,
        saleRecord.buyer_name,
        saleRecord.buyer_email,
        saleRecord.buyer_phone,
        saleRecord.sale_date,
        saleRecord.notes,
        saleRecord.confirmed_by,
        saleRecord.confirmed_at
      ]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('Error confirmando venta:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Confirmar renta de una propiedad
 */
static async confirmRental(id, rentalData, userId) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Verificar si la propiedad existe y pertenece al usuario
    const [property] = await connection.query(
      'SELECT host_id, status, title FROM properties WHERE id = ?',
      [id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Verificar autorización
    if (property[0].host_id !== userId) {
      throw new AuthorizationError('No autorizado para confirmar la renta de esta propiedad');
    }

    // Verificar que la propiedad esté en alquiler
    if (property[0].status !== 'for-rent') {
      throw new ValidationError('Solo se pueden confirmar rentas de propiedades marcadas como "en alquiler"');
    }

    // Actualizar el estado de la propiedad a rentada
    await connection.query(
      `UPDATE properties SET 
         status = 'rented', 
         updated_at = NOW()
       WHERE id = ?`,
      [id]
    );

    // Registrar los detalles de la renta en una tabla separada
    const rentalRecord = {
      property_id: id,
      rental_price: rentalData.rental_price || null,
      tenant_name: rentalData.tenant_name || null,
      tenant_email: rentalData.tenant_email || null,
      tenant_phone: rentalData.tenant_phone || null,
      rental_start_date: rentalData.rental_start_date || new Date(),
      rental_end_date: rentalData.rental_end_date || null,
      deposit_amount: rentalData.deposit_amount || null,
      notes: rentalData.notes || null,
      confirmed_by: userId,
      confirmed_at: new Date()
    };

    // Crear tabla de rentas si no existe
    await connection.query(`
      CREATE TABLE IF NOT EXISTS property_rentals (
        id INT PRIMARY KEY AUTO_INCREMENT,
        property_id INT NOT NULL,
        rental_price DECIMAL(15,2),
        tenant_name VARCHAR(255),
        tenant_email VARCHAR(255),
        tenant_phone VARCHAR(50),
        rental_start_date DATE,
        rental_end_date DATE,
        deposit_amount DECIMAL(15,2),
        notes TEXT,
        confirmed_by INT,
        confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (confirmed_by) REFERENCES users(id)
      )
    `);

    // Insertar el registro de renta
    await connection.query(
      `INSERT INTO property_rentals 
       (property_id, rental_price, tenant_name, tenant_email, tenant_phone, rental_start_date, rental_end_date, deposit_amount, notes, confirmed_by, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rentalRecord.property_id,
        rentalRecord.rental_price,
        rentalRecord.tenant_name,
        rentalRecord.tenant_email,
        rentalRecord.tenant_phone,
        rentalRecord.rental_start_date,
        rentalRecord.rental_end_date,
        rentalRecord.deposit_amount,
        rentalRecord.notes,
        rentalRecord.confirmed_by,
        rentalRecord.confirmed_at
      ]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('Error confirmando renta:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Reactivar una propiedad (cambiar de sold/rented a for-sale/for-rent)
 */
static async reactivateProperty(id, newStatus, reason, userId) {
  if (!id) {
    throw new ValidationError('ID de propiedad es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Verificar si la propiedad existe y pertenece al usuario
    const [property] = await connection.query(
      'SELECT host_id, status, title FROM properties WHERE id = ?',
      [id]
    );

    if (property.length === 0) {
      throw new NotFoundError('Propiedad no encontrada');
    }

    // Verificar autorización
    if (property[0].host_id !== userId) {
      throw new AuthorizationError('No autorizado para reactivar esta propiedad');
    }

    // Verificar que la propiedad esté vendida o rentada
    if (!['sold', 'rented'].includes(property[0].status)) {
      throw new ValidationError('Solo se pueden reactivar propiedades vendidas o rentadas');
    }

    // Actualizar el estado de la propiedad
    await connection.query(
      `UPDATE properties SET 
         status = ?, 
         updated_at = NOW()
       WHERE id = ?`,
      [newStatus, id]
    );

    // Si era una renta, marcar como inactiva
    if (property[0].status === 'rented') {
      await connection.query(
        `UPDATE property_rentals SET 
           is_active = FALSE,
           end_reason = ?
         WHERE property_id = ? AND is_active = TRUE`,
        [reason || 'Propiedad reactivada por el propietario', id]
      );
    }

    // Registrar la reactivación
    await connection.query(`
      CREATE TABLE IF NOT EXISTS property_reactivations (
        id INT PRIMARY KEY AUTO_INCREMENT,
        property_id INT NOT NULL,
        previous_status ENUM('sold', 'rented') NOT NULL,
        new_status ENUM('for-rent', 'for-sale') NOT NULL,
        reason TEXT,
        reactivated_by INT,
        reactivated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (reactivated_by) REFERENCES users(id)
      )
    `);

    await connection.query(
      `INSERT INTO property_reactivations 
       (property_id, previous_status, new_status, reason, reactivated_by)
       VALUES (?, ?, ?, ?, ?)`,
      [id, property[0].status, newStatus, reason, userId]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('Error reactivando propiedad:', error);
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

  static async softDeleteProperty(id, userId) {
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
        throw new AuthorizationError('No autorizado para eliminar esta propiedad');
      }

      // Realizar eliminación lógica
      await connection.query(
        `UPDATE properties SET 
           deleted = 1, 
           deleted_at = NOW(), 
           status = 'unavailable'
         WHERE id = ?`,
        [id]
      );

      return true;
    } catch (error) {
      console.error('Error en eliminación lógica:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}