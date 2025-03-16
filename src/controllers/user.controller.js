// src/controllers/user.controller.js
import { UserService } from '../services/user.service.js';
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
      role: req.query.role,
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

  static getUser = asyncErrorHandler(async (req, res) => {
    const user = await UserService.getUserById(req.params.id);
    
    res.json({
      success: true,
      data: user
    });
  });

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

  static getUsersByRole = asyncErrorHandler(async (req, res) => {
    const { role } = req.params;
    const users = await UserService.getUsersByRole(role);
    
    res.json({
      success: true,
      data: {
        users,
        count: users.length
      }
    });
  });
  
  // New methods for profile and favorites
  static getProfile = asyncErrorHandler(async (req, res) => {
    const user = await UserService.getUserById(req.userId);
    
    res.json({
      success: true,
      data: user
    });
  });
  
  static updateProfile = asyncErrorHandler(async (req, res) => {
    await UserService.updateUser(req.userId, req.body, req.userId);
    
    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente'
    });
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