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
    // Validaciones mínimas
    if (!propertyData.title) {
      throw new ValidationError('Se requiere al menos un título para la propiedad');
    }
  
    // Convertir valores booleanos de string a valores booleanos reales
    // Esto soluciona el problema con MySQL
    if (propertyData.isNew !== undefined) {
      propertyData.isNew = propertyData.isNew === 'true' || propertyData.isNew === true || propertyData.isNew === 1 ? 1 : 0;
    }
    
    if (propertyData.isFeatured !== undefined) {
      propertyData.isFeatured = propertyData.isFeatured === 'true' || propertyData.isFeatured === true || propertyData.isFeatured === 1 ? 1 : 0;
    }
    
    if (propertyData.isVerified !== undefined) {
      propertyData.isVerified = propertyData.isVerified === 'true' || propertyData.isVerified === true || propertyData.isVerified === 1 ? 1 : 0;
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
        propertyData.image = imageUrl;
      }
      
      // Inicializar vistas en 0
      propertyData.views = 0;
      
      // Insertar la propiedad usando el método del modelo
      const propertyId = await Property.create(propertyData);
      
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
    try {
      // Configuración de paginación
      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 10;
      const offset = (page - 1) * limit;
      
      // Eliminar filtros de price si existen
      const adjustedFilters = {...filters};
      if (adjustedFilters.minPrice) delete adjustedFilters.minPrice;
      if (adjustedFilters.maxPrice) delete adjustedFilters.maxPrice;
      
      // Usar el método del modelo para obtener propiedades filtradas
      const { properties, total } = await Property.findAll(adjustedFilters, { limit, offset });
      
      // Añadir información de host y otras mejoras a cada propiedad
      const connection = await mysqlPool.getConnection();
      const enhancedProperties = await Promise.all(properties.map(async property => {
        // Añadir información básica del host si existe
        if (property.host_id) {
          try {
            const [hostData] = await connection.query(
              `SELECT first_name, last_name, profile_image, short_bio 
               FROM users 
               WHERE id = ?`,
              [property.host_id]
            );
            
            if (hostData && hostData.length > 0) {
              property.host_first_name = hostData[0].first_name;
              property.host_last_name = hostData[0].last_name;
              property.host_profile_image = hostData[0].profile_image;
              property.host_bio = hostData[0].short_bio;
              property.host_name = `${hostData[0].first_name || ''} ${hostData[0].last_name || ''}`.trim() || 'Anfitrión';
            }
          } catch (error) {
            console.error(`Error al obtener datos del host para propiedad ${property.id}:`, error);
          }
        }
        
        // Obtener calificación promedio del anfitrión
        try {
          const [hostRating] = await connection.query(
            `SELECT AVG(r.rating) as host_average_rating
             FROM reviews r
             JOIN properties p ON r.property_id = p.id
             WHERE p.host_id = ?`,
            [property.host_id]
          );
          
          if (hostRating && hostRating.length > 0) {
            property.host_average_rating = hostRating[0].host_average_rating || 0;
          }
        } catch (error) {
          console.error(`Error al obtener calificación del anfitrión ${property.host_id}:`, error);
          property.host_average_rating = 0;
        }
        
        // Obtener conteo de reseñas del anfitrión
        try {
          const [hostReviews] = await connection.query(
            `SELECT COUNT(*) as host_review_count
             FROM reviews r
             JOIN properties p ON r.property_id = p.id
             WHERE p.host_id = ?`,
            [property.host_id]
          );
          
          if (hostReviews && hostReviews.length > 0) {
            property.host_review_count = hostReviews[0].host_review_count || 0;
          }
        } catch (error) {
          console.error(`Error al obtener conteo de reseñas del anfitrión ${property.host_id}:`, error);
          property.host_review_count = 0;
        }
        
        return property;
      }));
      
      connection.release();
      
      return {
        properties: enhancedProperties,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error en getProperties:', error);
      throw error;
    }
  }

  static async getPropertyById(id) {
    if (!id) {
      throw new ValidationError('ID de propiedad es requerido');
    }

    try {
      // Utilizar el método del modelo para obtener la propiedad
      const property = await Property.findById(id);
      
      if (!property) {
        throw new NotFoundError('Propiedad no encontrada');
      }
      
      const connection = await mysqlPool.getConnection();
      
      // Añadir información del host
      if (property.host_id) {
        try {
          const [hostData] = await connection.query(
            `SELECT first_name, last_name, profile_image, short_bio 
             FROM users 
             WHERE id = ?`,
            [property.host_id]
          );
          
          if (hostData && hostData.length > 0) {
            property.host_first_name = hostData[0].first_name;
            property.host_last_name = hostData[0].last_name;
            property.host_profile_image = hostData[0].profile_image;
            property.host_bio = hostData[0].short_bio;
            property.host_name = `${hostData[0].first_name || ''} ${hostData[0].last_name || ''}`.trim() || 'Anfitrión';
          }
        } catch (error) {
          console.error(`Error al obtener datos del host para propiedad ${id}:`, error);
        }
      }
      
      // Obtener calificación promedio del anfitrión
      try {
        const [hostRating] = await connection.query(
          `SELECT AVG(r.rating) as host_average_rating
           FROM reviews r
           JOIN properties p ON r.property_id = p.id
           WHERE p.host_id = ?`,
          [property.host_id]
        );
        
        if (hostRating && hostRating.length > 0) {
          property.host_average_rating = hostRating[0].host_average_rating || 0;
        }
      } catch (error) {
        console.error(`Error al obtener calificación del anfitrión ${property.host_id}:`, error);
        property.host_average_rating = 0;
      }
      
      // Obtener conteo de reseñas del anfitrión
      try {
        const [hostReviews] = await connection.query(
          `SELECT COUNT(*) as host_review_count
           FROM reviews r
           JOIN properties p ON r.property_id = p.id
           WHERE p.host_id = ?`,
          [property.host_id]
        );
        
        if (hostReviews && hostReviews.length > 0) {
          property.host_review_count = hostReviews[0].host_review_count || 0;
        }
      } catch (error) {
        console.error(`Error al obtener conteo de reseñas del anfitrión ${property.host_id}:`, error);
        property.host_review_count = 0;
      }
      
      connection.release();
      return property;
    } catch (error) {
      console.error(`Error al obtener propiedad ${id}:`, error);
      throw error;
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
      
      // Convertir valores booleanos
      if (propertyData.isNew !== undefined) {
        propertyData.isNew = propertyData.isNew === 'true' || propertyData.isNew === true || propertyData.isNew === 1 ? 1 : 0;
      }
      
      if (propertyData.isFeatured !== undefined) {
        propertyData.isFeatured = propertyData.isFeatured === 'true' || propertyData.isFeatured === true || propertyData.isFeatured === 1 ? 1 : 0;
      }
      
      if (propertyData.isVerified !== undefined) {
        propertyData.isVerified = propertyData.isVerified === 'true' || propertyData.isVerified === true || propertyData.isVerified === 1 ? 1 : 0;
      }
      
      // Si hay un archivo de imagen, subirlo a Azure
      if (imageFile) {
        const imageUrl = await azureStorageService.uploadImage(imageFile, id);
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
      await Property.update(id, propertyData);
      
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
      const deleted = await Property.delete(id);
      
      if (!deleted) {
        throw new DatabaseError('Error al eliminar la propiedad');
      }
      
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
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
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

      // Verificar si hay reservas activas
      const [activeBookings] = await connection.query(
        'SELECT id FROM bookings WHERE property_id = ? AND status IN ("confirmed", "pending")',
        [id]
      );

      if (activeBookings.length > 0) {
        throw new ValidationError('No se puede eliminar una propiedad con reservas activas');
      }
      
      // Marcar como borrada (actualizar status a unavailable y archivar)
      await Property.archive(id, 'Eliminación lógica por usuario');
      
      connection.release();
      return true;
    } catch (error) {
      throw error;
    } finally {
      if (connection) connection.release();
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
      await Property.archive(id, archiveData.reason);
      
      connection.release();
      return true;
    } catch (error) {
      console.error('Error archivando propiedad:', error);
      throw error;
    } finally {
      if (connection) connection.release();
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
      await Property.restore(id, status);
      
      connection.release();
      return true;
    } catch (error) {
      console.error('Error restaurando propiedad:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  static async getArchivedProperties(userId, pagination = { page: 1, limit: 10 }) {
    if (!userId) {
      throw new ValidationError('ID de usuario es requerido');
    }

    try {
      const filters = {
        host_id: userId,
        includeArchived: true,
        archived: true
      };
      
      const { properties, total } = await Property.findAll(
        filters, 
        { 
          limit: pagination.limit, 
          offset: (pagination.page - 1) * pagination.limit 
        }
      );
      
      return {
        properties,
        total,
        page: parseInt(pagination.page),
        limit: parseInt(pagination.limit),
        totalPages: Math.ceil(total / parseInt(pagination.limit))
      };
    } catch (error) {
      console.error('Error al obtener propiedades archivadas:', error);
      throw new DatabaseError('Error al obtener propiedades archivadas');
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
      
      connection.release();
      return { imageUrl };
    } catch (error) {
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

 // Actualización para property.service.js
// Reemplaza el método searchProperties por esta versión mejorada:

// Actualización para property.service.js
// Mejora en el método searchProperties para manejar filtros de categoría y tipo

static async searchProperties(searchTerm, searchFields = null, params = {}) {
  if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim() === '') {
    throw new ValidationError('Término de búsqueda es requerido');
  }

  const connection = await mysqlPool.getConnection();
  try {
    const searchPattern = `%${searchTerm.trim()}%`;
    
    // Construir la condición WHERE básica
    let whereCondition = '(p.archived IS NULL OR p.archived = FALSE)';
    const whereParams = [];
    
    // Condición de búsqueda de texto
    const defaultSearchFields = ['p.title', 'p.description', 'p.address', 'p.category', 'p.property_type'];
    
    // Si se especifican campos de búsqueda, usarlos; de lo contrario, usar los predeterminados
    const fieldsToSearch = searchFields && searchFields.length > 0 
      ? searchFields.map(field => `p.${field}`) 
      : defaultSearchFields;
    
    // Agregar condición de búsqueda por texto
    whereCondition += ' AND (';
    whereCondition += fieldsToSearch.map(field => `${field} LIKE ?`).join(' OR ');
    whereCondition += ')';
    
    // Agregar parámetros para la búsqueda de texto
    whereParams.push(...Array(fieldsToSearch.length).fill(searchPattern));
    
    // Filtros adicionales
    
    // Filtro de categoría
    if (params.category) {
      whereCondition += ' AND p.category = ?';
      whereParams.push(params.category);
    }
    
    // Filtro de tipo de propiedad
    if (params.property_type) {
      if (Array.isArray(params.property_type)) {
        // Si es un array de tipos, usar IN
        whereCondition += ` AND p.property_type IN (${params.property_type.map(() => '?').join(',')})`;
        whereParams.push(...params.property_type);
      } else {
        // Si es un solo tipo, usar igualdad
        whereCondition += ' AND p.property_type = ?';
        whereParams.push(params.property_type);
      }
    }
    
    // Filtro de ciudad (si existe)
    if (params.city) {
      whereCondition += ' AND p.address LIKE ?';
      whereParams.push(`%${params.city}%`);
    }
    
    // Filtros de amenidades
    if (params.amenities && Array.isArray(params.amenities) && params.amenities.length > 0) {
      whereCondition += ` AND EXISTS (
        SELECT 1 FROM property_amenities pa2 
        WHERE pa2.property_id = p.id 
        AND pa2.amenity IN (${params.amenities.map(() => '?').join(',')})
        GROUP BY pa2.property_id
        HAVING COUNT(DISTINCT pa2.amenity) = ?
      )`;
      whereParams.push(...params.amenities, params.amenities.length);
    }
    
    // Construir la ordenación CASE para priorizar coincidencias
    let orderByCase = 'CASE ';
    fieldsToSearch.forEach((field, index) => {
      orderByCase += `WHEN ${field} LIKE ? THEN ${index + 1} `;
    });
    orderByCase += 'ELSE 99 END';
    
    // Parámetros para la ordenación CASE (uno por cada campo de búsqueda)
    const orderParams = Array(fieldsToSearch.length).fill(searchPattern);
    
    // Determinar la ordenación secundaria según el parámetro sort
    let secondaryOrderBy = '';
    switch (params.sort) {
      case 'views-high':
        secondaryOrderBy = 'p.views DESC';
        break;
      case 'views-low':
        secondaryOrderBy = 'p.views ASC';
        break;
      case 'title-asc':
        secondaryOrderBy = 'p.title ASC';
        break;
      case 'title-desc':
        secondaryOrderBy = 'p.title DESC';
        break;
      case 'rating-high':
        secondaryOrderBy = 'COALESCE(p.average_rating, 0) DESC';
        break;
      case 'rating-low':
        secondaryOrderBy = 'COALESCE(p.average_rating, 0) ASC';
        break;
      case 'newest':
      default:
        secondaryOrderBy = 'p.created_at DESC';
    }
    
    // Construir la consulta completa
    let query = `
      SELECT p.*, 
             GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
             GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
      FROM properties p
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
      WHERE ${whereCondition}
      GROUP BY p.id
      ORDER BY ${orderByCase}, ${secondaryOrderBy}
    `;
    
    // Paginación
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Agregar paginación a la consulta
    query += ' LIMIT ? OFFSET ?';
    
    console.log('SQL Query (search):', query);
    console.log('Query params:', [...whereParams, ...orderParams, limit, offset]);
    
    // Ejecutar la consulta con todos los parámetros
    const [properties] = await connection.query(
      query,
      [...whereParams, ...orderParams, limit, offset]
    );

    // Consulta para contar el total de resultados sin paginación
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total 
      FROM properties p
      WHERE ${whereCondition}
    `;
    
    const [countResult] = await connection.query(countQuery, whereParams);
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
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit)
    };
  } catch (error) {
    console.error('Error en searchProperties:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}
  
  static async getFeaturedProperties(limit = 6, status = null) {
    try {
      const properties = await Property.getFeatured(parseInt(limit), status);
      return properties;
    } catch (error) {
      console.error('Error al obtener propiedades destacadas:', error);
      throw new DatabaseError('Error al obtener propiedades destacadas');
    }
  }
  
  static async getRecentProperties(limit = 6, status = null) {
    try {
      const properties = await Property.getRecent(parseInt(limit), status);
      return properties;
    } catch (error) {
      console.error('Error al obtener propiedades recientes:', error);
      throw new DatabaseError('Error al obtener propiedades recientes');
    }
  }
  
  static async getMostViewedProperties(limit = 6, status = null) {
    try {
      const properties = await Property.getMostViewed(parseInt(limit), status);
      return properties;
    } catch (error) {
      console.error('Error al obtener propiedades más vistas:', error);
      throw new DatabaseError('Error al obtener propiedades más vistas');
    }
  }
  
  static async getPropertyCountByCity() {
    const connection = await mysqlPool.getConnection();
    try {
      // Usar address en lugar de city ya que no existe columna city
      const [results] = await connection.query(`
        SELECT address, COUNT(*) as count
        FROM properties
        WHERE (archived IS NULL OR archived = FALSE)
        GROUP BY address
        ORDER BY count DESC
      `);
      
      connection.release();
      return results;
    } catch (error) {
      console.error('Error al obtener conteo de propiedades por ciudad:', error);
      throw new DatabaseError('Error al obtener estadísticas de propiedades');
    } finally {
      if (connection) connection.release();
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

    try {
      // Usar el método del modelo para incrementar vistas
      const success = await Property.incrementViews(id);
      
      if (!success) {
        throw new NotFoundError('Propiedad no encontrada');
      }
      
      return success;
    } catch (error) {
      console.error('Error al incrementar vistas:', error);
      throw new DatabaseError('Error al incrementar vistas de la propiedad');
    }
  }

  /**
   * Obtiene las estadísticas de propiedades para un anfitrión
   * @param {number} hostId - ID del anfitrión
   * @returns {Promise<Object>} - Estadísticas del anfitrión
   */
  static async getHostStats(hostId) {
    if (!hostId) {
      throw new ValidationError('ID de anfitrión es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Total de propiedades
      const [totalProps] = await connection.query(
        `SELECT COUNT(*) as total_properties
         FROM properties
         WHERE host_id = ? AND (archived IS NULL OR archived = FALSE)`,
        [hostId]
      );

      // Propiedades por tipo
      const [propByType] = await connection.query(
        `SELECT property_type, COUNT(*) as count
         FROM properties
         WHERE host_id = ? AND (archived IS NULL OR archived = FALSE)
         GROUP BY property_type
         ORDER BY count DESC`,
        [hostId]
      );

      // Total de vistas
      const [totalViews] = await connection.query(
        `SELECT SUM(views) as total_views
         FROM properties
         WHERE host_id = ?`,
        [hostId]
      );

      // Propiedad más vista
      const [mostViewed] = await connection.query(
        `SELECT id, title, views
         FROM properties
         WHERE host_id = ?
         ORDER BY views DESC
         LIMIT 1`,
        [hostId]
      );

      // Rating promedio
      const [avgRating] = await connection.query(
        `SELECT AVG(r.rating) as average_rating, COUNT(r.id) as total_reviews
         FROM reviews r
         JOIN properties p ON r.property_id = p.id
         WHERE p.host_id = ?`,
        [hostId]
      );

      connection.release();
      return {
        total_properties: totalProps[0]?.total_properties || 0,
        properties_by_type: propByType || [],
        total_views: totalViews[0]?.total_views || 0,
        most_viewed_property: mostViewed[0] || null,
        average_rating: avgRating[0]?.average_rating || 0,
        total_reviews: avgRating[0]?.total_reviews || 0
      };
    } catch (error) {
      console.error('Error al obtener estadísticas del anfitrión:', error);
      throw new DatabaseError('Error al obtener estadísticas');
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Obtiene propiedades similares a una propiedad dada
   * @param {number} propertyId - ID de la propiedad de referencia
   * @param {number} limit - Límite de resultados
   * @returns {Promise<Array>} - Propiedades similares
   */
  static async getSimilarProperties(propertyId, limit = 4) {
    if (!propertyId) {
      throw new ValidationError('ID de propiedad es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Primero obtenemos la propiedad de referencia
      const [property] = await connection.query(
        `SELECT address, property_type
         FROM properties
         WHERE id = ?`,
        [propertyId]
      );

      if (!property || property.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      const reference = property[0];

      // Buscar propiedades similares (misma dirección y tipo, diferente ID)
      const [similarProperties] = await connection.query(
        `SELECT p.*, 
                GROUP_CONCAT(DISTINCT pa.amenity) as amenities,
                GROUP_CONCAT(DISTINCT ppa.pet_type) as pets_allowed
         FROM properties p
         LEFT JOIN property_amenities pa ON p.id = pa.property_id
         LEFT JOIN property_pets_allowed ppa ON p.id = ppa.property_id
         WHERE p.id != ?
           AND (p.archived IS NULL OR p.archived = FALSE)
           AND (p.address LIKE ? OR p.property_type = ?)
         GROUP BY p.id
         ORDER BY 
           CASE 
             WHEN p.address LIKE ? AND p.property_type = ? THEN 1
             WHEN p.address LIKE ? THEN 2
             WHEN p.property_type = ? THEN 3
             ELSE 4
           END,
           p.views DESC
         LIMIT ?`,
        [
          propertyId,
          `%${reference.address.split(',')[0]}%`, // Usar primera parte de la dirección
          reference.property_type,
          `%${reference.address.split(',')[0]}%`,
          reference.property_type,
          `%${reference.address.split(',')[0]}%`,
          reference.property_type,
          limit
        ]
      );

      // Procesar resultados
      const processedProperties = similarProperties.map(property => ({
        ...property,
        amenities: property.amenities ? property.amenities.split(',') : [],
        pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
      }));

      connection.release();
      return processedProperties;
    } catch (error) {
      console.error('Error al obtener propiedades similares:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Actualiza el estado de múltiples propiedades a la vez
   * @param {Array} propertyIds - Array de IDs de propiedades
   * @param {string} status - Nuevo estado
   * @param {number} userId - ID del usuario
   * @returns {Promise<Object>} - Resultado de la operación
   */
  static async bulkUpdateStatus(propertyIds, status, userId) {
    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      throw new ValidationError('Se requiere al menos una propiedad');
    }

    if (!['for-rent', 'for-sale', 'unavailable'].includes(status)) {
      throw new ValidationError('Estado no válido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar que todas las propiedades pertenezcan al usuario
      const placeholders = propertyIds.map(() => '?').join(',');
      const [properties] = await connection.query(
        `SELECT id, host_id FROM properties WHERE id IN (${placeholders})`,
        propertyIds
      );

      // Verificar que todas existan
      if (properties.length !== propertyIds.length) {
        throw new NotFoundError('Una o más propiedades no fueron encontradas');
      }

      // Verificar que todas pertenezcan al usuario
      const unauthorized = properties.filter(prop => prop.host_id !== userId);
      if (unauthorized.length > 0) {
        throw new AuthorizationError('No tiene autorización para actualizar una o más propiedades');
      }

      // Actualizar el estado
      const [result] = await connection.query(
        `UPDATE properties SET status = ? WHERE id IN (${placeholders})`,
        [status, ...propertyIds]
      );

      connection.release();
      return {
        success: true,
        updated: result.affectedRows,
        properties: propertyIds
      };
    } catch (error) {
      console.error('Error al actualizar estado de propiedades:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Destaca o quita destacado de una propiedad
   * @param {number} id - ID de la propiedad
   * @param {boolean} featured - Estado de destacado
   * @param {number} userId - ID del usuario
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async toggleFeatured(id, featured, userId) {
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

      // Verificar autorización (solo administradores pueden destacar propiedades)
      const [user] = await connection.query(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );

      if (user.length === 0 || user[0].role !== 'admin') {
        throw new AuthorizationError('Solo administradores pueden destacar propiedades');
      }

      // Actualizar el estado de destacado
      const featuredValue = featured ? 1 : 0;
      const [result] = await connection.query(
        'UPDATE properties SET isFeatured = ? WHERE id = ?',
        [featuredValue, id]
      );

      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error al actualizar estado de destacado:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Verifica o quita verificación de una propiedad
   * @param {number} id - ID de la propiedad
   * @param {boolean} verified - Estado de verificación
   * @param {number} userId - ID del usuario
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  static async toggleVerified(id, verified, userId) {
    if (!id) {
      throw new ValidationError('ID de propiedad es requerido');
    }

    const connection = await mysqlPool.getConnection();
    try {
      // Verificar si la propiedad existe
      const [property] = await connection.query(
        'SELECT id FROM properties WHERE id = ?',
        [id]
      );

      if (property.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }

      // Verificar autorización (solo administradores pueden verificar propiedades)
      const [user] = await connection.query(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );

      if (user.length === 0 || user[0].role !== 'admin') {
        throw new AuthorizationError('Solo administradores pueden verificar propiedades');
      }

      // Actualizar el estado de verificación
      const verifiedValue = verified ? 1 : 0;
      const [result] = await connection.query(
        'UPDATE properties SET isVerified = ? WHERE id = ?',
        [verifiedValue, id]
      );

      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error al actualizar estado de verificación:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Obtiene las propiedades más populares (más vistas)
   * @param {number} limit - Límite de resultados
   * @returns {Promise<Array>} - Propiedades populares
   */
  static async getPopularProperties(limit = 10) {
    try {
      const properties = await Property.getMostViewed(limit);
      return properties;
    } catch (error) {
      console.error('Error al obtener propiedades populares:', error);
      throw new DatabaseError('Error al obtener propiedades populares');
    }
  }

  static async getAllProperties(filters = {}) {
    try {
      // Eliminar filtros de price si existen
      const adjustedFilters = {...filters};
      if (adjustedFilters.minPrice) delete adjustedFilters.minPrice;
      if (adjustedFilters.maxPrice) delete adjustedFilters.maxPrice;
      
      // Usar el método del modelo para obtener todas las propiedades sin límite
      const { properties, total } = await Property.findAll(adjustedFilters, { limit: null, offset: 0 });
      
      // Añadir información de host y otras mejoras a cada propiedad
      const connection = await mysqlPool.getConnection();
      const enhancedProperties = await Promise.all(properties.map(async property => {
        // Añadir información básica del host si existe
        if (property.host_id) {
          try {
            const [hostData] = await connection.query(
              `SELECT first_name, last_name, profile_image, short_bio 
               FROM users 
               WHERE id = ?`,
              [property.host_id]
            );
            
            if (hostData && hostData.length > 0) {
              property.host_first_name = hostData[0].first_name;
              property.host_last_name = hostData[0].last_name;
              property.host_profile_image = hostData[0].profile_image;
              property.host_bio = hostData[0].short_bio;
              property.host_name = `${hostData[0].first_name || ''} ${hostData[0].last_name || ''}`.trim() || 'Anfitrión';
            }
          } catch (error) {
            console.error(`Error al obtener datos del host para propiedad ${property.id}:`, error);
          }
        }
        
        // Obtener calificación promedio del anfitrión
        try {
          const [hostRating] = await connection.query(
            `SELECT AVG(r.rating) as host_average_rating
             FROM reviews r
             JOIN properties p ON r.property_id = p.id
             WHERE p.host_id = ?`,
            [property.host_id]
          );
          
          if (hostRating && hostRating.length > 0) {
            property.host_average_rating = hostRating[0].host_average_rating || 0;
          }
        } catch (error) {
          console.error(`Error al obtener calificación del anfitrión ${property.host_id}:`, error);
          property.host_average_rating = 0;
        }
        
        // Obtener conteo de reseñas del anfitrión
        try {
          const [hostReviews] = await connection.query(
            `SELECT COUNT(*) as host_review_count
             FROM reviews r
             JOIN properties p ON r.property_id = p.id
             WHERE p.host_id = ?`,
            [property.host_id]
          );
          
          if (hostReviews && hostReviews.length > 0) {
            property.host_review_count = hostReviews[0].host_review_count || 0;
          }
        } catch (error) {
          console.error(`Error al obtener conteo de reseñas del anfitrión ${property.host_id}:`, error);
          property.host_review_count = 0;
        }
        
        return property;
      }));
      
      connection.release();
      
      return {
        properties: enhancedProperties,
        total
      };
    } catch (error) {
      console.error('Error en getAllProperties:', error);
      throw error;
    }
  }

  // Actualización para property.service.js
// Mejora en el método getPropertiesByMainCategories para filtrar correctamente por tipo

static async getPropertiesByMainCategories(category = null, filters = {}) {
  try {
    const apiFilters = {
      ...filters
    };
    
    // Si se proporciona una categoría específica, filtrar por ella
    if (category) {
      apiFilters.category = category;
    } else {
      // Si no se proporciona categoría, filtramos por las tres principales
      apiFilters.categoryList = ['Restaurante y bar', 'Alojamiento', 'Entretenimiento'];
    }
    
    // Calcular offset para paginación
    const limit = parseInt(filters.limit || 10);
    const page = parseInt(filters.page || 1);
    const offset = (page - 1) * limit;
    
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
    
    const queryParams = [];
    
    // Aplicar filtro de categoría
    if (category) {
      query += ' AND p.category = ?';
      queryParams.push(category);
    } else if (apiFilters.categoryList) {
      query += ` AND p.category IN (${apiFilters.categoryList.map(() => '?').join(',')})`;
      queryParams.push(...apiFilters.categoryList);
    }
    
    // IMPORTANTE: Añadir filtro de property_type si existe
    if (apiFilters.property_type) {
      if (Array.isArray(apiFilters.property_type)) {
        // Si es un array de tipos, usar IN
        if (apiFilters.property_type.length > 0) {
          query += ` AND p.property_type IN (${apiFilters.property_type.map(() => '?').join(',')})`;
          queryParams.push(...apiFilters.property_type);
        }
      } else {
        // Si es un solo tipo, usar igualdad
        query += ' AND p.property_type = ?';
        queryParams.push(apiFilters.property_type);
      }
      
      console.log(`SQL: Filtro de tipo aplicado: ${JSON.stringify(apiFilters.property_type)}`);
    }
    
    // Agrupar y ordenar
    query += ' GROUP BY p.id';
    
    // Aplicar ordenación según el parámetro sort
    if (apiFilters.sort) {
      switch (apiFilters.sort) {
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
        case 'newest':
        default:
          query += ' ORDER BY CASE WHEN p.isFeatured = 1 THEN 1 ELSE 0 END DESC, p.created_at DESC';
      }
    } else {
      query += ' ORDER BY CASE WHEN p.isFeatured = 1 THEN 1 ELSE 0 END DESC, p.created_at DESC';
    }
    
    // Aplicar paginación
    query += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);
    
    // Ejecutar consulta
    console.log('SQL Query:', query);
    console.log('SQL Params:', queryParams);
    
    const [properties] = await connection.query(query, queryParams);
    
    // Consulta para obtener el total sin paginación
    let countQuery = `
      SELECT COUNT(DISTINCT p.id) as total 
      FROM properties p
      WHERE (p.archived IS NULL OR p.archived = FALSE)
    `;
    
    const countParams = [];
    
    if (category) {
      countQuery += ' AND p.category = ?';
      countParams.push(category);
    } else if (apiFilters.categoryList) {
      countQuery += ` AND p.category IN (${apiFilters.categoryList.map(() => '?').join(',')})`;
      countParams.push(...apiFilters.categoryList);
    }
    
    // Añadir mismo filtro de property_type a la consulta de conteo
    if (apiFilters.property_type) {
      if (Array.isArray(apiFilters.property_type)) {
        if (apiFilters.property_type.length > 0) {
          countQuery += ` AND p.property_type IN (${apiFilters.property_type.map(() => '?').join(',')})`;
          countParams.push(...apiFilters.property_type);
        }
      } else {
        countQuery += ' AND p.property_type = ?';
        countParams.push(apiFilters.property_type);
      }
    }
    
    const [countResult] = await connection.query(countQuery, countParams);
    const total = countResult[0]?.total || 0;
    
    connection.release();
    
    // Procesar propiedades
    const processedProperties = properties.map(property => ({
      ...property,
      amenities: property.amenities ? property.amenities.split(',') : [],
      pets_allowed: property.pets_allowed ? property.pets_allowed.split(',') : []
    }));
    
    // Debug: Verificar filtrado
    if (apiFilters.property_type && processedProperties.length > 0) {
      console.log('Tipos de propiedades en el resultado:');
      const tiposPropiedades = {};
      processedProperties.forEach(p => {
        if (!tiposPropiedades[p.property_type]) {
          tiposPropiedades[p.property_type] = 0;
        }
        tiposPropiedades[p.property_type]++;
      });
      console.log(tiposPropiedades);
    }
    
    return {
      properties: processedProperties,
      total,
      page: parseInt(filters.page || 1),
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error al obtener propiedades por categorías principales:', error);
    throw error;
  }
}
  
}