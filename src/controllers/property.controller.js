// src/controllers/property.controller.js
import { PropertyService } from '../services/property.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class PropertyController {
  static createProperty = asyncErrorHandler(async (req, res) => {
    // Obtener los archivos de imagen desde multer
    const files = req.files;
    
    // Imagen principal (si existe)
    const mainImageFile = files?.image?.[0];
    
    // Imágenes adicionales (si existen)
    const additionalImageFiles = files?.additional_images || [];
    
    const result = await PropertyService.createProperty(
      {
        ...req.body,
        host_id: req.userId
      },
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
      limit: req.query.limit || 10
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

  static updateProperty = asyncErrorHandler(async (req, res) => {
    // Obtener el archivo de imagen desde multer
    const imageFile = req.file;
    
    await PropertyService.updateProperty(
      req.params.id,
      req.body,
      imageFile,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Propiedad actualizada exitosamente'
    });
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

  static searchProperties = asyncErrorHandler(async (req, res) => {
    const { q } = req.query;
    const properties = await PropertyService.searchProperties(q);
    
    res.json({
      success: true,
      data: {
        properties,
        total: properties.length
      }
    });
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

  /**
   * Obtiene estadísticas del anfitrión
   */
  static getHostStats = asyncErrorHandler(async (req, res) => {
    const { hostId } = req.params;
    const stats = await PropertyService.getHostStats(hostId || req.userId);
    
    res.json({
      success: true,
      data: stats
    });
  });

  /**
   * Archivar una propiedad (ocultarla sin eliminarla)
   */
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

  /**
   * Restaurar una propiedad archivada
   */
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

  /**
   * Obtener propiedades archivadas del usuario
   */
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

  /**
   * Eliminación lógica de una propiedad
   */
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

  /**
   * Incrementa el contador de vistas de una propiedad
   */
  static incrementPropertyViews = asyncErrorHandler(async (req, res) => {
    const { id } = req.params;
    const success = await PropertyService.incrementPropertyViews(id);
    
    res.json({
      success: true,
      message: success ? 'Vista registrada exitosamente' : 'No se pudo registrar la vista'
    });
  });

  /**
   * Obtiene propiedades similares a una dada
   */
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

  /**
   * Actualiza el estado de múltiples propiedades a la vez
   */
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

  /**
   * Destaca o quita destacado de una propiedad (solo admin)
   */
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

  /**
   * Verifica o quita verificación de una propiedad (solo admin)
   */
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
        : null
    };
  
    const result = await PropertyService.getAllProperties(filters);
    
    res.json({
      success: true,
      data: result
    });
  });
}