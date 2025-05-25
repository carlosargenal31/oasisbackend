// src/controllers/event.controller.js
import { EventService } from '../services/event.service.js';
import { azureStorageService } from '../services/azure-storage.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

// Función para subir imágenes
// En event.controller.js
export const uploadEventImage = asyncErrorHandler(async (req, res) => {
  console.log('Recibiendo solicitud para subir imagen');
  
  // Verificar si hay imagen en la solicitud
  if (!req.file) {
    console.error('No se ha proporcionado ninguna imagen en la solicitud');
    return res.status(400).json({
      success: false,
      message: 'No se ha proporcionado ninguna imagen'
    });
  }
  
  try {
    // El archivo está disponible en req.file gracias a multer
    const imageFile = req.file;
    
    console.log('Procesando imagen:', {
      originalname: imageFile.originalname,
      mimetype: imageFile.mimetype,
      size: imageFile.size
    });
    
    // Subir la imagen usando el servicio de Azure Storage
    const imageUrl = await azureStorageService.uploadImage(
      imageFile, 
      'event',  // Tipo de entidad
      Date.now() // ID temporal
    );
    
    console.log('Imagen subida exitosamente a:', imageUrl);
    
    res.json({
      success: true,
      data: {
        imageUrl,
        message: 'Imagen subida exitosamente'
      }
    });
  } catch (error) {
    console.error('Error al subir la imagen:', error);
    res.status(500).json({
      success: false,
      message: `Error al subir la imagen: ${error.message}`
    });
  }
});

export class EventController {
  // Método público original - asegurando que solo muestre eventos activos
  static getEvents = asyncErrorHandler(async (req, res) => {
    const filters = {
      event_type: req.query.event_type,
      search: req.query.search,
      created_by: req.query.created_by,
      limit: req.query.limit,
      offset: req.query.offset,
      featured: req.query.featured !== undefined ? req.query.featured === 'true' : undefined,
      status: 'activo',  // Forzar solo eventos activos en vista pública
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      price: req.query.price,
      price_max: req.query.price_max,
      upcoming: req.query.upcoming === 'true',
      past: req.query.past === 'true',
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      // Marcar explícitamente que NO es admin
      isAdminPanel: false
    };

    // Log para debug
    console.log('Filtros recibidos en el controlador público:', filters);

    const result = await EventService.getEvents(filters);
    
    res.json({
      success: true,
      data: {
        events: result.events,
        total: result.total,
        page: result.page,
        limit: result.limit
      }
    });
  });

  // Nuevo método específico para el panel de admin
  static getAdminEvents = asyncErrorHandler(async (req, res) => {
    const filters = {
      event_type: req.query.event_type,
      search: req.query.search,
      created_by: req.query.created_by,
      limit: req.query.limit,
      offset: req.query.offset,
      featured: req.query.featured !== undefined ? req.query.featured === 'true' : undefined,
      status: req.query.status,  // Puede ser una lista separada por comas
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      price: req.query.price,  // Para eventos gratuitos
      price_max: req.query.price_max,  // Para precio máximo
      upcoming: req.query.upcoming === 'true',
      past: req.query.past === 'true',
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      // Marcar que es una solicitud de panel admin
      isAdminPanel: true
    };

    // Log para debug
    console.log('Filtros recibidos en el controlador admin:', filters);

    const result = await EventService.getEvents(filters);
    
    res.json({
      success: true,
      data: {
        events: result.events,
        total: result.total,
        page: result.page,
        limit: result.limit
      }
    });
  });

  static getFeaturedEvents = asyncErrorHandler(async (req, res) => {
    const limit = req.query.limit || 3;
    const events = await EventService.getFeaturedEvents(limit);
    
    res.json({
      success: true,
      data: events
    });
  });
  
  static getHomeEvents = asyncErrorHandler(async (req, res) => {
    const limit = req.query.limit || 6;
    const events = await EventService.getHomeEvents(limit);
    
    res.json({
      success: true,
      data: events
    });
  });

  // Método para obtener un evento individual - ajustado para verificar permisos
  static getEvent = asyncErrorHandler(async (req, res) => {
    // Determinar si la solicitud viene del admin
    const isAdmin = req.headers['x-admin-request'] === 'true';
    
    const event = await EventService.getEventById(req.params.id, isAdmin);
    
    res.json({
      success: true,
      data: event
    });
  });

  static createEvent = asyncErrorHandler(async (req, res) => {
    const eventId = await EventService.createEvent(req.body, req.userId);
    
    res.status(201).json({
      success: true,
      data: {
        eventId,
        message: 'Evento creado exitosamente'
      }
    });
  });

  static updateEvent = asyncErrorHandler(async (req, res) => {
    await EventService.updateEvent(
      req.params.id,
      req.body,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Evento actualizado exitosamente'
    });
  });

  static deleteEvent = asyncErrorHandler(async (req, res) => {
    await EventService.deleteEvent(
      req.params.id,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Evento eliminado exitosamente'
    });
  });
  
  static getEventTypes = asyncErrorHandler(async (req, res) => {
    const types = await EventService.getEventTypes();
    
    res.json({
      success: true,
      data: types
    });
  });
  
  static getEventsByCreator = asyncErrorHandler(async (req, res) => {
    const { creatorId } = req.params;
    const limit = req.query.limit || 10;
    
    const events = await EventService.getEventsByCreator(creatorId, limit);
    
    res.json({
      success: true,
      data: events
    });
  });

  static updateFeaturedStatus = asyncErrorHandler(async (req, res) => {
  const { id } = req.params;
  // Cambiado de 'featured' a 'is_featured' para coincidir con lo que envía el frontend
  const { is_featured } = req.body;
  
  if (is_featured === undefined) {
    return res.status(400).json({
      success: false,
      message: 'El campo is_featured es requerido'
    });
  }
  
  await BlogService.updateFeaturedStatus(id, is_featured, req.userId);
  
  res.json({
    success: true,
    message: `Blog ${is_featured ? 'marcado como destacado' : 'desmarcado como destacado'} exitosamente`
  });
});
  
  static updateHomeStatus = asyncErrorHandler(async (req, res) => {
    const { id } = req.params;
    const { is_home } = req.body;
    
    if (is_home === undefined) {
      return res.status(400).json({
        success: false,
        message: 'El campo is_home es requerido'
      });
    }
    
    await EventService.updateHomeStatus(id, is_home, req.userId);
    
    res.json({
      success: true,
      message: `Evento ${is_home ? 'mostrado en inicio' : 'removido del inicio'} exitosamente`
    });
  });
  
  static updateEventStatus = asyncErrorHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'El campo status es requerido'
      });
    }
    
    await EventService.updateEventStatus(id, status, req.userId);
    
    res.json({
      success: true,
      message: `Estado del evento actualizado a "${status}" exitosamente`
    });
  });
  
  static getUpcomingEvents = asyncErrorHandler(async (req, res) => {
    const limit = req.query.limit || 6;
    const events = await EventService.getUpcomingEvents(limit);
    
    res.json({
      success: true,
      data: events
    });
  });
  
  // Integración del método para subir imágenes
  static uploadEventImage = asyncErrorHandler(async (req, res) => {
    // Reutiliza la función exportada
    return await uploadEventImage(req, res);
  });
}

// Exportar ambos para que las rutas puedan importarlos
export { uploadEventImage as uploadEventImageFunction };