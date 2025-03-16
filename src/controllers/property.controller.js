// src/controllers/property.controller.js
import { PropertyService } from '../services/property.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class PropertyController {
  static createProperty = asyncErrorHandler(async (req, res) => {
    // Obtener el archivo de imagen desde multer
    const imageFile = req.file;
    
    const result = await PropertyService.createProperty(
      {
        ...req.body,
        host_id: req.userId
      },
      imageFile
    );

    res.status(201).json({
      success: true,
      data: {
        propertyId: result.propertyId,
        imageUrl: result.imageUrl,
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

    const { properties, total } = await PropertyService.getProperties(filters);
    
    res.json({
      success: true,
      data: {
        properties,
        total,
        page: parseInt(filters.page),
        limit: parseInt(filters.limit),
        totalPages: Math.ceil(total / parseInt(filters.limit))
      }
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
}