// src/controllers/user.controller.js
import { UserService } from '../services/user.service.js';
import { azureStorageService } from '../services/azure-storage.service.js';
import { PropertyService } from '../services/property.service.js';
import { ReviewService } from '../services/review.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class UserController {
  static createUser = asyncErrorHandler(async (req, res) => {
    const userId = await UserService.createUser(req.body);
    
    res.status(201).json({
      success: true,
      data: {
        userId,
        message: 'Usuario creado exitosamente'
      }
    });
  });

  static getUsers = asyncErrorHandler(async (req, res) => {
    const filters = {
      status: req.query.status,
      search: req.query.search
    };

    const users = await UserService.getUsers(filters);
    
    res.json({
      success: true,
      data: {
        users,
        count: users.length
      }
    });
  });

  // Actualizar getUser para incluir información más detallada para anfitriones
  static getUser = asyncErrorHandler(async (req, res) => {
    const user = await UserService.getUserById(req.params.id);
    
    // Obtener estadísticas adicionales del anfitrión
    const hostStats = await UserController.getHostStats(req.params.id);
    
    res.json({
      success: true,
      data: {
        ...user,
        ...hostStats
      }
    });
  });

  // Método auxiliar para obtener estadísticas del anfitrión
  static async getHostStats(userId) {
    try {
      // Obtener todas las propiedades del anfitrión
      const { properties } = await PropertyService.getProperties({ host_id: userId });
      
      // Si no hay propiedades, devolver estadísticas vacías
      if (!properties || properties.length === 0) {
        return {
          properties_count: 0,
          average_rating: 0,
          total_reviews: 0
        };
      }
      
      // Obtener IDs de las propiedades
      const propertyIds = properties.map(prop => prop.id);
      
      // Contar reseñas por cada propiedad
      let totalReviews = 0;
      let totalRating = 0;
      let reviewCount = 0;
      
      for (const propertyId of propertyIds) {
        // Obtener reseñas de la propiedad
        const reviews = await ReviewService.getReviews({ property_id: propertyId });
        
        if (reviews && reviews.length > 0) {
          totalReviews += reviews.length;
          
          // Calcular rating promedio
          reviews.forEach(review => {
            totalRating += review.rating;
            reviewCount++;
          });
        }
      }
      
      // Calcular rating promedio
      const averageRating = reviewCount > 0 ? (totalRating / reviewCount).toFixed(1) : 0;
      
      return {
        properties_count: properties.length,
        average_rating: averageRating,
        total_reviews: totalReviews
      };
    } catch (error) {
      console.error('Error getting host stats:', error);
      return {
        properties_count: 0,
        average_rating: 0,
        total_reviews: 0
      };
    }
  }

  static updateUser = asyncErrorHandler(async (req, res) => {
    await UserService.updateUser(
      req.params.id,
      req.body,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente'
    });
  });

  static deleteUser = asyncErrorHandler(async (req, res) => {
    await UserService.deleteUser(
      req.params.id,
      req.userId
    );
    
    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
  });
  
  // Métodos para perfil de usuario
  static getProfile = asyncErrorHandler(async (req, res) => {
    const user = await UserService.getUserById(req.userId);
    const completeness = await UserService.calculateProfileCompleteness(req.userId);
    
    res.json({
      success: true,
      data: {
        user,
        completeness
      }
    });
  });
  
  static updateProfile = asyncErrorHandler(async (req, res) => {
    await UserService.updateUser(req.userId, req.body, req.userId);
    const completeness = await UserService.calculateProfileCompleteness(req.userId);
    
    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      completeness
    });
  });
  
  static updateProfileImage = asyncErrorHandler(async (req, res) => {
    try {
      // Verificar si hay imagen en la solicitud
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No se ha proporcionado ninguna imagen'
        });
      }
      
      // El archivo está disponible en req.file gracias a multer
      const imageFile = req.file;
      
      // Subir la imagen a Azure Blob Storage
      const azureUrl = await azureStorageService.uploadImage(imageFile, `user-${req.userId}`);
      
      // Actualizar el perfil del usuario con la nueva URL
      await UserService.updateUser(
        req.userId, 
        { profile_image: azureUrl },
        req.userId
      );
      
      // Obtener el nivel de completitud actualizado
      const completeness = await UserService.calculateProfileCompleteness(req.userId);
      
      res.json({
        success: true,
        data: {
          imageUrl: azureUrl,
          message: 'Imagen de perfil actualizada exitosamente'
        },
        completeness
      });
    } catch (error) {
      console.error('Error en updateProfileImage:', error);
      res.status(500).json({
        success: false,
        message: 'Error al procesar la imagen: ' + (error.message || 'Error desconocido')
      });
    }
  });
  
  static updatePassword = asyncErrorHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await UserService.updatePassword(req.userId, currentPassword, newPassword);
    
    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  });
  
  static getFavorites = asyncErrorHandler(async (req, res) => {
    const favorites = await UserService.getFavorites(req.userId);
    
    res.json({
      success: true,
      data: favorites
    });
  });
  
  static addFavorite = asyncErrorHandler(async (req, res) => {
    const { propertyId } = req.params;
    await UserService.addFavorite(req.userId, propertyId);
    
    res.json({
      success: true,
      message: 'Propiedad añadida a favoritos'
    });
  });
  
  static removeFavorite = asyncErrorHandler(async (req, res) => {
    const { propertyId } = req.params;
    await UserService.removeFavorite(req.userId, propertyId);
    
    res.json({
      success: true,
      message: 'Propiedad eliminada de favoritos'
    });
  });
}

// Al final de user.controller.js
export const updateProfileImage = UserController.updateProfileImage;