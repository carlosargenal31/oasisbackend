// src/controllers/auth.controller.js
import authService from '../services/auth.service.js';
import { asyncErrorHandler } from '../utils/errors/error-handler.js';

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
    const { email } = req.body;
    const resetToken = await authService.requestPasswordReset(email);
    
    res.json({
      success: true,
      message: 'Instrucciones de reseteo enviadas al email (simulación)',
      resetToken // Solo para pruebas, en producción no se devolvería
    });
  });

  static resetPassword = asyncErrorHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    res.json({
      success: true,
      message: 'Contraseña reseteada exitosamente'
    });
  });
}