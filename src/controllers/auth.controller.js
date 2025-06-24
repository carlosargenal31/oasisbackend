// src/controllers/auth.controller.js
import authService from '../services/auth.service.js';
import { asyncErrorHandler } from '../utils/errors/error-handler.js';
import { NotFoundError } from '../utils/errors/index.js';

export class AuthController {
  static register = asyncErrorHandler(async (req, res) => {
    const user = await authService.register(req.body);
    res.status(201).json({
      success: true,
      data: {
        user,
        message: 'Usuario registrado exitosamente'
      }
    });
  });

  static login = asyncErrorHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({
      success: true,
      data: result
    });
  });
  
  static logout = asyncErrorHandler(async (req, res) => {
    // Implement logout logic if needed
    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });
  });

  static getCurrentUser = asyncErrorHandler(async (req, res) => {
    const userId = req.userId;
    const user = await authService.getUserById(userId);
    res.json({
      success: true,
      data: user
    });
  });

  static changePassword = asyncErrorHandler(async (req, res) => {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(userId, currentPassword, newPassword);
    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  });

  static requestPasswordReset = asyncErrorHandler(async (req, res) => {
    try {
      const { email } = req.body;
      const resetToken = await authService.requestPasswordReset(email);
      
      res.json({
        success: true,
        message: 'Se ha generado el token de reset de contraseña',
        resetToken // Solo para desarrollo, en producción no se devolvería
      });
    } catch (error) {
      // Si es un error de "no encontrado", devolver un 404
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      // Re-lanzar otros errores para que los maneje el error handler
      throw error;
    }
  });

  static resetPassword = asyncErrorHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    res.json({
      success: true,
      message: 'Contraseña reseteada exitosamente'
    });
  });

  static getUserSecurityInfo = asyncErrorHandler(async (req, res) => {
    try {
      const { email } = req.body;
      const securityInfo = await authService.getUserSecurityInfo(email);
      
      res.json({
        success: true,
        data: securityInfo
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }
  });

  static verifySecurityAnswers = asyncErrorHandler(async (req, res) => {
    const { email, answers } = req.body;
    const resetToken = await authService.verifySecurityAnswers(email, answers);
    
    res.json({
      success: true,
      message: 'Verificación exitosa',
      resetToken
    });
  });
}