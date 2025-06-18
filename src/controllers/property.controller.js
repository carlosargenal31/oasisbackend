// src/controllers/property.controller.js
import { PropertyService } from '../services/property.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class PropertyController {
  static createProperty = asyncErrorHandler(async (req, res) => {
    // Log para debugging
    console.log('Datos recibidos:', req.body);
    console.log('Archivos recibidos:', req.files);
    
    // Obtener los archivos de imagen desde multer
    const files = req.files;
    
    // Imagen principal (si existe)
    const mainImageFile = files?.image?.[0];
    
    // Imágenes adicionales (si existen)
    const additionalImageFiles = files?.additional_images || [];

    // Procesar datos del formulario
    const processedBody = { ...req.body };
    
    // Procesar amenidades si vienen como JSON string
    if (typeof processedBody.amenities === 'string') {
      try {
        processedBody.amenities = JSON.parse(processedBody.amenities);
      } catch (error) {
        console.warn('Error parsing amenities:', error);
        processedBody.amenities = [];
      }
    }
    
    // Procesar mascotas permitidas si vienen como JSON string
    if (typeof processedBody.pets_allowed === 'string') {
      try {
        processedBody.pets_allowed = JSON.parse(processedBody.pets_allowed);
      } catch (error) {
        console.warn('Error parsing pets_allowed:', error);
        processedBody.pets_allowed = [];
      }
    }

    // Procesar información de contacto si viene como JSON string
    if (typeof processedBody.contact === 'string') {
      try {
        const contactInfo = JSON.parse(processedBody.contact);
        // Aquí podrías guardar la información de contacto en una tabla separada
        // o procesarla como necesites
        console.log('Contact info:', contactInfo);
      } catch (error) {
        console.warn('Error parsing contact info:', error);
      }
    }

    // Asegurar que amenities y pets_allowed sean arrays
    if (!Array.isArray(processedBody.amenities)) {
      processedBody.amenities = processedBody.amenities ? [processedBody.amenities] : [];
    }
    
    if (!Array.isArray(processedBody.pets_allowed)) {
      processedBody.pets_allowed = processedBody.pets_allowed ? [processedBody.pets_allowed] : [];
    }

    const result = await PropertyService.createProperty(
      {
        ...processedBody,
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

  /**
 * Confirmar venta de una propiedad
 */
static confirmSale = asyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      sale_price, 
      buyer_name, 
      buyer_email, 
      buyer_phone, 
      sale_date,
      notes 
    } = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de propiedad es requerido'
      });
    }
    
    // Obtener ID de usuario del middleware de autenticación
    const userId = req.userId;
    
    // Confirmar la venta
    await PropertyService.confirmSale(id, {
      sale_price,
      buyer_name,
      buyer_email,
      buyer_phone,
      sale_date,
      notes
    }, userId);
    
    res.json({
      success: true,
      message: 'Venta confirmada exitosamente'
    });
  } catch (error) {
    console.error('Error al confirmar venta:', error);
    
    let statusCode = 500;
    let message = 'Error al confirmar la venta';
    
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = error.message;
    } else if (error.name === 'NotFoundError') {
      statusCode = 404;
      message = 'Propiedad no encontrada';
    } else if (error.name === 'AuthorizationError') {
      statusCode = 403;
      message = 'No tienes permiso para confirmar la venta de esta propiedad';
    }
    
    res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

/**
 * Confirmar renta de una propiedad
 */
static confirmRental = asyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      rental_price, 
      tenant_name, 
      tenant_email, 
      tenant_phone, 
      rental_start_date,
      rental_end_date,
      deposit_amount,
      notes 
    } = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de propiedad es requerido'
      });
    }
    
    // Obtener ID de usuario del middleware de autenticación
    const userId = req.userId;
    
    // Confirmar la renta
    await PropertyService.confirmRental(id, {
      rental_price,
      tenant_name,
      tenant_email,
      tenant_phone,
      rental_start_date,
      rental_end_date,
      deposit_amount,
      notes
    }, userId);
    
    res.json({
      success: true,
      message: 'Renta confirmada exitosamente'
    });
  } catch (error) {
    console.error('Error al confirmar renta:', error);
    
    let statusCode = 500;
    let message = 'Error al confirmar la renta';
    
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = error.message;
    } else if (error.name === 'NotFoundError') {
      statusCode = 404;
      message = 'Propiedad no encontrada';
    } else if (error.name === 'AuthorizationError') {
      statusCode = 403;
      message = 'No tienes permiso para confirmar la renta de esta propiedad';
    }
    
    res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

/**
 * Reactivar una propiedad (cambiar de sold/rented a for-sale/for-rent)
 */
static reactivateProperty = asyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { new_status, reason } = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de propiedad es requerido'
      });
    }
    
    // Validar nuevo estado
    const validStatuses = ['for-rent', 'for-sale'];
    if (!new_status || !validStatuses.includes(new_status)) {
      return res.status(400).json({
        success: false,
        message: 'Estado nuevo debe ser for-rent o for-sale'
      });
    }
    
    // Obtener ID de usuario del middleware de autenticación
    const userId = req.userId;
    
    // Reactivar la propiedad
    await PropertyService.reactivateProperty(id, new_status, reason, userId);
    
    res.json({
      success: true,
      message: 'Propiedad reactivada exitosamente'
    });
  } catch (error) {
    console.error('Error al reactivar propiedad:', error);
    
    let statusCode = 500;
    let message = 'Error al reactivar la propiedad';
    
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = error.message;
    } else if (error.name === 'NotFoundError') {
      statusCode = 404;
      message = 'Propiedad no encontrada';
    } else if (error.name === 'AuthorizationError') {
      statusCode = 403;
      message = 'No tienes permiso para reactivar esta propiedad';
    }
    
    res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
});

/**
 * Actualizar solo el estado de una propiedad
 */
static updatePropertyStatus = asyncErrorHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de propiedad es requerido'
      });
    }
    
    // Validar status
    const validStatuses = ['for-rent', 'for-sale', 'sold', 'rented', 'unavailable'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Estado inválido. Debe ser uno de: ${validStatuses.join(', ')}`
      });
    }
    
    // Obtener ID de usuario del middleware de autenticación
    const userId = req.userId;
    
    // Actualizar solo el estado
    await PropertyService.updatePropertyStatus(id, status, userId);
    
    res.json({
      success: true,
      message: 'Estado de la propiedad actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error al actualizar estado de propiedad:', error);
    
    let statusCode = 500;
    let message = 'Error al actualizar el estado de la propiedad';
    
    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = error.message;
    } else if (error.name === 'NotFoundError') {
      statusCode = 404;
      message = 'Propiedad no encontrada';
    } else if (error.name === 'AuthorizationError') {
      statusCode = 403;
      message = 'No tienes permiso para actualizar esta propiedad';
    }
    
    res.status(statusCode).json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'production' ? null : error.message
    });
  }
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
}