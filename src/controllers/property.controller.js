// src/controllers/property.controller.js
import { PropertyService } from '../services/property.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class PropertyController {
  
  // ================================
  // MÉTODOS ORIGINALES (para admin)
  // ================================
  
  // Modificación en el método createProperty
  static createProperty = asyncErrorHandler(async (req, res) => {
    // Obtener los archivos de imagen desde multer
    const files = req.files;
    
    // Imagen principal (si existe)
    const mainImageFile = files?.image?.[0];
    
    // Imágenes adicionales (si existen)
    const additionalImageFiles = files?.additional_images || [];
    
    // Eliminar host_id si existe (para asegurarnos)
    if (req.body.host_id) {
      delete req.body.host_id;
    }
    
    console.log('Files received:', files); // Para depuración
    console.log('Body received:', req.body); // Para depuración
    
    try {
      const result = await PropertyService.createProperty(
        req.body,
        mainImageFile,
        additionalImageFiles
      );
    
      res.status(201).json({
        success: true,
        data: {
          propertyId: result.propertyId,
          imageUrl: result.imageUrl,
          additionalImageUrls: result.additionalImageUrls || [],
          message: 'Propiedad creada exitosamente'
        }
      });
    } catch (error) {
      console.error('Error completo en createProperty:', error);
      throw error; // Re-lanzar para que sea manejado por asyncErrorHandler
    }
  });

  static getProperties = asyncErrorHandler(async (req, res) => {
    const filters = {
      status: req.query.status, // 'for-rent' o 'for-sale'
      property_type: req.query.property_type,
      city: req.query.city,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      minBedrooms: req.query.minBedrooms,
      minBathrooms: req.query.minBathrooms,
      host_id: req.query.host_id,
      minArea: req.query.minArea,
      maxArea: req.query.maxArea,
      verified: req.query.verified === 'true',
      featured: req.query.featured === 'true',
      amenities: req.query.amenities ? 
        (Array.isArray(req.query.amenities) ? req.query.amenities : [req.query.amenities]) 
        : null,
      pets: req.query.pets ? 
        (Array.isArray(req.query.pets) ? req.query.pets : [req.query.pets]) 
        : null,
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      sort: req.query.sort || 'newest' // Añadir parámetro de ordenación
    };

    const result = await PropertyService.getProperties(filters);
    
    res.json({
      success: true,
      data: result
    });
  });

  static getProperty = asyncErrorHandler(async (req, res) => {
    const property = await PropertyService.getPropertyById(req.params.id);
    
    res.json({
      success: true,
      data: property
    });
  });

  // En property.controller.js, método updateProperty modificado
  static updateProperty = asyncErrorHandler(async (req, res) => {
    try {
      // Obtener el archivo de imagen desde multer
      const files = req.files || {};
      const mainImageFile = req.file || files?.image?.[0];
      
      // Imágenes adicionales (si existen)
      const additionalImageFiles = files?.additional_images || [];
      
      console.log("Archivos recibidos en updateProperty:", {
        mainImageFile: mainImageFile ? mainImageFile.originalname : "No hay imagen principal",
        additionalImageFiles: additionalImageFiles.length
      });
      
      const result = await PropertyService.updateProperty(
        req.params.id,
        req.body,
        mainImageFile,
        additionalImageFiles,
        req.userId
      );
      
      res.json({
        success: true,
        message: 'Propiedad actualizada exitosamente'
      });
    } catch (error) {
      console.error("Error completo en updateProperty controller:", error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar la propiedad',
        error: error.message
      });
    }
  });

  static deleteProperty = asyncErrorHandler(async (req, res) => {
    await PropertyService.deleteProperty(
      req.params.id,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Propiedad eliminada exitosamente'
    });
  });

  // Reemplaza el método searchProperties por esta versión mejorada:
  static searchProperties = asyncErrorHandler(async (req, res) => {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un término de búsqueda válido'
      });
    }
    
    // Parámetros de paginación y ordenación
    const searchParams = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      sort: req.query.sort || 'newest'
    };
    
    // Campos específicos de búsqueda (opcional)
    const searchFields = req.query.searchFields ? req.query.searchFields.split(',') : null;
    
    try {
      const properties = await PropertyService.searchProperties(
        q.trim(), 
        searchFields,
        searchParams
      );
      
      res.json({
        success: true,
        data: {
          properties: properties.properties || [],
          total: properties.total || 0,
          page: parseInt(searchParams.page),
          limit: parseInt(searchParams.limit),
          totalPages: Math.ceil((properties.total || 0) / parseInt(searchParams.limit))
        }
      });
    } catch (error) {
      console.error('Error en búsqueda de propiedades:', error);
      res.status(500).json({
        success: false,
        message: 'Error al buscar propiedades',
        error: error.message
      });
    }
  });

  // En property.controller.js, corregir el método getPropertyAmenities
  static getPropertyAmenities = asyncErrorHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      // Importar la conexión a la base de datos
      const { mysqlPool } = await import('../config/database.js');
      const connection = await mysqlPool.getConnection();
      
      // Obtener amenidades de la propiedad desde la tabla property_amenities
      const [amenities] = await connection.query(
        'SELECT property_id, amenity FROM property_amenities WHERE property_id = ?',
        [id]
      );
      
      connection.release();
      
      res.json({
        success: true,
        data: amenities || []
      });
    } catch (error) {
      console.error('Error al obtener amenidades:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener amenidades',
        error: error.message
      });
    }
  });
    
  static addPropertyImage = asyncErrorHandler(async (req, res) => {
    const { id } = req.params;
    const { isPrimary } = req.body;
    const imageFile = req.file;
    
    if (!imageFile) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionó ninguna imagen'
      });
    }
    
    const result = await PropertyService.addPropertyImage(
     id,
     imageFile,
     isPrimary === 'true',
     req.userId
   );
   
   res.json({
     success: true,
     data: {
       imageUrl: result.imageUrl,
       message: 'Imagen añadida exitosamente'
     }
   });
 });
 
 static getFeaturedProperties = asyncErrorHandler(async (req, res) => {
   const { limit, status } = req.query;
   const properties = await PropertyService.getFeaturedProperties(
     parseInt(limit) || 6,
     status
   );
   
   res.json({
     success: true,
     data: properties
   });
 });
 
 static getRecentProperties = asyncErrorHandler(async (req, res) => {
   const { limit, status } = req.query;
   const properties = await PropertyService.getRecentProperties(
     parseInt(limit) || 6,
     status
   );
   
   res.json({
     success: true,
     data: properties
   });
 });
 
 static getPopularProperties = asyncErrorHandler(async (req, res) => {
   const { limit } = req.query;
   const properties = await PropertyService.getPopularProperties(
     parseInt(limit) || 6
   );
   
   res.json({
     success: true,
     data: properties
   });
 });
 
 static getPropertyStats = asyncErrorHandler(async (req, res) => {
   const citiesCount = await PropertyService.getPropertyCountByCity();
   
   res.json({
     success: true,
     data: {
       citiesCount
     }
   });
 });

 static getHostStats = asyncErrorHandler(async (req, res) => {
   const { hostId } = req.params;
   const stats = await PropertyService.getHostStats(hostId || req.userId);
   
   res.json({
     success: true,
     data: stats
   });
 });

 static archiveProperty = asyncErrorHandler(async (req, res) => {
   const { id } = req.params;
   const { reason } = req.body;
   
   await PropertyService.archiveProperty(
     id,
     { reason },
     req.userId
   );
   
   res.json({
     success: true,
     message: 'Propiedad archivada exitosamente'
   });
 });

 static restoreProperty = asyncErrorHandler(async (req, res) => {
   const { id } = req.params;
   const { status } = req.body;
   
   await PropertyService.restoreProperty(
     id,
     status || 'for-rent',
     req.userId
   );
   
   res.json({
     success: true,
     message: 'Propiedad restaurada exitosamente'
   });
 });

 static getArchivedProperties = asyncErrorHandler(async (req, res) => {
   const pagination = {
     page: parseInt(req.query.page) || 1,
     limit: parseInt(req.query.limit) || 10
   };
   
   const result = await PropertyService.getArchivedProperties(
     req.userId,
     pagination
   );
   
   res.json({
     success: true,
     data: result
   });
 });

 static softDeleteProperty = asyncErrorHandler(async (req, res) => {
   const { id } = req.params;
   
   await PropertyService.softDeleteProperty(
     id,
     req.userId
   );
   
   res.json({
     success: true,
     message: 'Propiedad eliminada exitosamente (borrado lógico)'
   });
 });

 static incrementPropertyViews = asyncErrorHandler(async (req, res) => {
   const { id } = req.params;
   const success = await PropertyService.incrementPropertyViews(id);
   
   res.json({
     success: true,
     message: success ? 'Vista registrada exitosamente' : 'No se pudo registrar la vista'
   });
 });

 static getSimilarProperties = asyncErrorHandler(async (req, res) => {
   const { id } = req.params;
   const { limit } = req.query;
   
   const properties = await PropertyService.getSimilarProperties(
     id,
     parseInt(limit) || 4
   );
   
   res.json({
     success: true,
     data: properties
   });
 });

 static bulkUpdateStatus = asyncErrorHandler(async (req, res) => {
   const { propertyIds, status } = req.body;
   
   const result = await PropertyService.bulkUpdateStatus(
     propertyIds,
     status,
     req.userId
   );
   
   res.json({
     success: true,
     data: result
   });
 });

 static toggleFeatured = asyncErrorHandler(async (req, res) => {
   const { id } = req.params;
   const { featured } = req.body;
   
   await PropertyService.toggleFeatured(
     id,
     featured === true || featured === 'true',
     req.userId
   );
   
   res.json({
     success: true,
     message: `Propiedad ${featured ? 'destacada' : 'quitada de destacados'} exitosamente`
   });
 });

 static toggleVerified = asyncErrorHandler(async (req, res) => {
   const { id } = req.params;
   const { verified } = req.body;
   
   await PropertyService.toggleVerified(
     id,
     verified === true || verified === 'true',
     req.userId
   );
   
   res.json({
     success: true,
     message: `Propiedad ${verified ? 'verificada' : 'quitada de verificación'} exitosamente`
   });
 });

 static getAllProperties = asyncErrorHandler(async (req, res) => {
   console.log("PropertyController.getAllProperties - Recibida solicitud con query:", req.query);
   
   const filters = {
     status: req.query.status,
     property_type: req.query.property_type,
     city: req.query.city,
     minPrice: req.query.minPrice,
     maxPrice: req.query.maxPrice,
     minBedrooms: req.query.minBedrooms,
     minBathrooms: req.query.minBathrooms,
     host_id: req.query.host_id,
     minArea: req.query.minArea,
     maxArea: req.query.maxArea,
     verified: req.query.verified === 'true',
     featured: req.query.featured === 'true',
     amenities: req.query.amenities ? 
       (Array.isArray(req.query.amenities) ? req.query.amenities : [req.query.amenities]) 
       : null,
     pets: req.query.pets ? 
       (Array.isArray(req.query.pets) ? req.query.pets : [req.query.pets]) 
       : null,
     sort: req.query.sort || 'newest'
   };

   // CAMBIO RADICAL: NUNCA filtrar por archived por defecto
   // Queremos ver TODAS las propiedades en el panel de administración
   
   console.log("Llamando a PropertyService.getAllProperties con filtros:", filters);
   const result = await PropertyService.getAllProperties(filters);
   
   console.log(`PropertyService.getAllProperties devolvió ${result.properties.length} propiedades`);
   console.log(`Propiedades archivadas: ${result.properties.filter(p => p.archived).length}`);
   
   res.json({
     success: true,
     data: result
   });
 });

 static getMainCategories = asyncErrorHandler(async (req, res) => {
   const pagination = {
     page: parseInt(req.query.page) || 1,
     limit: parseInt(req.query.limit) || 10
   };
   
   const result = await PropertyService.getPropertiesByMainCategories(
     null, // Sin filtro de categoría específica
     pagination
   );
   
   res.json({
     success: true,
     data: result
   });
 });

 static getMainFeaturedCategories = asyncErrorHandler(async (req, res) => {
   const pagination = {
     page: parseInt(req.query.page) || 1,
     limit: parseInt(req.query.limit) || 10
   };
   
   const result = await PropertyService.getPropertiesByMainFeaturedCategories(
     null, // Sin filtro de categoría específica
     pagination
   );
   
   res.json({
     success: true,
     data: result
   });
 });
 
 // Mejora en el método getPropertiesByCategory para manejar filtros de tipos específicos
 static getPropertiesByFeaturedCategory = asyncErrorHandler(async (req, res) => {
   const { category } = req.params;
   const pagination = {
     page: parseInt(req.query.page) || 1,
     limit: parseInt(req.query.limit) || 10,
     sort: req.query.sort || 'newest'
   };
   
   // Validar que la categoría sea una de las principales
   const mainCategories = ['Restaurante y bar', 'Alojamiento', 'Entretenimiento'];
   if (!mainCategories.includes(category)) {
     return res.status(400).json({
       success: false,
       message: 'Categoría no válida. Debe ser una de: ' + mainCategories.join(', ')
     });
   }
   
   // Incluir también el filtro de tipo de propiedad si está presente
   const filters = {
     category: category,
     property_type: req.query.property_type || null,
     page: pagination.page,
     limit: pagination.limit,
     sort: pagination.sort
   };
   
   // Registro para depuración
   console.log(`API: Filtro de categoría: ${category}`);
   console.log(`API: Filtro de tipo: ${JSON.stringify(req.query.property_type)}`);
   
   try {
     const result = await PropertyService.getPropertiesByMainFeaturedCategories(
       category,
       filters
     );
     
     // Verificar si hay resultados
     if (!result.properties || result.properties.length === 0) {
       console.log(`API: No se encontraron propiedades para ${category} con filtros:`, filters);
     } else {
       console.log(`API: Encontradas ${result.properties.length} propiedades para ${category}`);
       // Mostrar tipos de propiedades devueltas para depuración
       const tiposPropiedades = {};
       result.properties.forEach(p => {
         if (!tiposPropiedades[p.property_type]) {
           tiposPropiedades[p.property_type] = 0;
         }
         tiposPropiedades[p.property_type]++;
       });
       console.log('API: Tipos de propiedades devueltas:', tiposPropiedades);
     }
     
     res.json({
       success: true,
       data: result
     });
   } catch (error) {
     console.error('Error al obtener propiedades por categoría:', error);
     res.status(500).json({
       success: false,
       message: 'Error al obtener propiedades por categoría',
       error: error.message
     });
   }
 });

 static getPropertiesByCategory = asyncErrorHandler(async (req, res) => {
   const { category } = req.params;
   const pagination = {
     page: parseInt(req.query.page) || 1,
     limit: parseInt(req.query.limit) || 10,
     sort: req.query.sort || 'newest'
   };
   
   // Validar que la categoría sea una de las principales
   const mainCategories = ['Restaurante y bar', 'Alojamiento', 'Entretenimiento'];
   if (!mainCategories.includes(category)) {
     return res.status(400).json({
       success: false,
       message: 'Categoría no válida. Debe ser una de: ' + mainCategories.join(', ')
     });
   }
   
   // Incluir también el filtro de tipo de propiedad si está presente
   const filters = {
     category: category,
     property_type: req.query.property_type || null,
     page: pagination.page,
     limit: pagination.limit,
     sort: pagination.sort
   };
   
   // Registro para depuración
   console.log(`API: Filtro de categoría: ${category}`);
   console.log(`API: Filtro de tipo: ${JSON.stringify(req.query.property_type)}`);
   
   try {
     const result = await PropertyService.getPropertiesByMainCategories(
       category,
       filters
     );
     
     // Verificar si hay resultados
     if (!result.properties || result.properties.length === 0) {
       console.log(`API: No se encontraron propiedades para ${category} con filtros:`, filters);
     } else {
       console.log(`API: Encontradas ${result.properties.length} propiedades para ${category}`);
       // Mostrar tipos de propiedades devueltas para depuración
       const tiposPropiedades = {};
       result.properties.forEach(p => {
         if (!tiposPropiedades[p.property_type]) {
           tiposPropiedades[p.property_type] = 0;
         }
         tiposPropiedades[p.property_type]++;
       });
       console.log('API: Tipos de propiedades devueltas:', tiposPropiedades);
     }
     
     res.json({
       success: true,
       data: result
     });
   } catch (error) {
     console.error('Error al obtener propiedades por categoría:', error);
     res.status(500).json({
       success: false,
       message: 'Error al obtener propiedades por categoría',
       error: error.message
     });
   }
 });

 // ================================
 // NUEVOS MÉTODOS PARA PROPIEDADES ACTIVAS (para usuarios públicos)
 // ================================

 // Método específico para obtener solo propiedades ACTIVAS (para usuarios públicos)
 static getActiveProperties = asyncErrorHandler(async (req, res) => {
   const filters = {
     status: req.query.status,
     property_type: req.query.property_type,
     city: req.query.city,
     minPrice: req.query.minPrice,
     maxPrice: req.query.maxPrice,
     minBedrooms: req.query.minBedrooms,
     minBathrooms: req.query.minBathrooms,
     host_id: req.query.host_id,
     minArea: req.query.minArea,
     maxArea: req.query.maxArea,
     verified: req.query.verified === 'true',
     featured: req.query.featured === 'true',
     amenities: req.query.amenities ? 
       (Array.isArray(req.query.amenities) ? req.query.amenities : [req.query.amenities]) 
       : null,
     pets: req.query.pets ? 
       (Array.isArray(req.query.pets) ? req.query.pets : [req.query.pets]) 
       : null,
     page: req.query.page || 1,
     limit: req.query.limit || 10,
     sort: req.query.sort || 'newest'
   };

   const result = await PropertyService.getActiveProperties(filters);
   
   res.json({
     success: true,
     data: result
   });
 });

 // Método de búsqueda específico para propiedades ACTIVAS
 static searchActiveProperties = asyncErrorHandler(async (req, res) => {
   const { q } = req.query;
   
   if (!q || typeof q !== 'string' || q.trim() === '') {
     return res.status(400).json({
       success: false,
       message: 'Se requiere un término de búsqueda válido'
     });
   }
   
   // Parámetros de paginación y ordenación
   const searchParams = {
     page: parseInt(req.query.page) || 1,
     limit: parseInt(req.query.limit) || 10,
     sort: req.query.sort || 'newest'
   };
   
   // Incluir filtros adicionales para la búsqueda
   if (req.query.category) {
     searchParams.category = req.query.category;
   }
   
   if (req.query.property_type) {
     searchParams.property_type = req.query.property_type;
   }
   
   if (req.query.city) {
     searchParams.city = req.query.city;
   }
   
   if (req.query.amenities) {
     searchParams.amenities = Array.isArray(req.query.amenities) ? req.query.amenities : [req.query.amenities];
   }
   
   // Campos específicos de búsqueda (opcional)
   const searchFields = req.query.searchFields ? req.query.searchFields.split(',') : null;
   
   try {
     const properties = await PropertyService.searchActiveProperties(
       q.trim(), 
       searchFields,
       searchParams
     );
     
     res.json({
       success: true,
       data: {
         properties: properties.properties || [],
         total: properties.total || 0,
         page: parseInt(searchParams.page),
         limit: parseInt(searchParams.limit),
         totalPages: Math.ceil((properties.total || 0) / parseInt(searchParams.limit))
       }
     });
   } catch (error) {
     console.error('Error en búsqueda de propiedades activas:', error);
     res.status(500).json({
       success: false,
       message: 'Error al buscar propiedades',
       error: error.message
     });
   }
 });

 // Método para obtener categorías principales (solo activas)
 static getActiveMainCategories = asyncErrorHandler(async (req, res) => {
   const pagination = {
     page: parseInt(req.query.page) || 1,
     limit: parseInt(req.query.limit) || 10
   };
   
   const result = await PropertyService.getActivePropertiesByMainCategories(
     null, // Sin filtro de categoría específica
     pagination
   );
   
   res.json({
     success: true,
     data: result
   });
 });

 // Método para obtener propiedades por categoría (solo activas)
 static getActivePropertiesByCategory = asyncErrorHandler(async (req, res) => {
   const { category } = req.params;
   const pagination = {
     page: parseInt(req.query.page) || 1,
     limit: parseInt(req.query.limit) || 10,
     sort: req.query.sort || 'newest'
   };
   
   // Validar que la categoría sea una de las principales
   const mainCategories = ['Restaurante y bar', 'Alojamiento', 'Entretenimiento'];
   if (!mainCategories.includes(category)) {
     return res.status(400).json({
       success: false,
       message: 'Categoría no válida. Debe ser una de: ' + mainCategories.join(', ')
     });
   }
   
   // Incluir también el filtro de tipo de propiedad si está presente
   const filters = {
     category: category,
     property_type: req.query.property_type || null,
     page: pagination.page,
     limit: pagination.limit,
     sort: pagination.sort
   };
   
   // Registro para depuración
   console.log(`API: Filtro de categoría (activos): ${category}`);
   console.log(`API: Filtro de tipo (activos): ${JSON.stringify(req.query.property_type)}`);
   
   try {
     const result = await PropertyService.getActivePropertiesByMainCategories(
       category,
       filters
     );
     
     // Verificar si hay resultados
     if (!result.properties || result.properties.length === 0) {
       console.log(`API: No se encontraron propiedades activas para ${category} con filtros:`, filters);
     } else {
       console.log(`API: Encontradas ${result.properties.length} propiedades activas para ${category}`);
       // Mostrar tipos de propiedades devueltas para depuración
       const tiposPropiedades = {};
       result.properties.forEach(p => {
         if (!tiposPropiedades[p.property_type]) {
           tiposPropiedades[p.property_type] = 0;
         }
         tiposPropiedades[p.property_type]++;
       });
       console.log('API: Tipos de propiedades activas devueltas:', tiposPropiedades);
     }
     
     res.json({
       success: true,
       data: result
     });
   } catch (error) {
     console.error('Error al obtener propiedades activas por categoría:', error);
     res.status(500).json({
       success: false,
       message: 'Error al obtener propiedades por categoría',
       error: error.message
     });
   }
 });

 // Método para obtener propiedades destacadas (solo activas)
 static getActiveFeaturedProperties = asyncErrorHandler(async (req, res) => {
   const { limit, status } = req.query;
   // Este método ya filtra por activas internamente en el modelo
   const properties = await PropertyService.getFeaturedProperties(
     parseInt(limit) || 6,
     status
   );
   
   res.json({
     success: true,
     data: properties
   });
 });

 // Método para obtener propiedades recientes (solo activas)
 static getActiveRecentProperties = asyncErrorHandler(async (req, res) => {
   const { limit, status } = req.query;
   // Este método ya filtra por activas internamente en el modelo
   const properties = await PropertyService.getRecentProperties(
     parseInt(limit) || 6,
     status
   );
   
   res.json({
     success: true,
     data: properties
   });
 });

 // Método para obtener propiedades populares (solo activas)
 static getActivePopularProperties = asyncErrorHandler(async (req, res) => {
   const { limit } = req.query;
   // Este método ya filtra por activas internamente en el modelo
   const properties = await PropertyService.getPopularProperties(
     parseInt(limit) || 6
   );
   
   res.json({
     success: true,
     data: properties
   });
 });

}