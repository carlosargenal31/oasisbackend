// src/controllers/auth.controller.js
import AuthService from '../services/auth.service.js';
import { asyncErrorHandler } from '../utils/errors/error-handler.js';
import globalVariable from '../config/index.js'
import { sendResetEmail } from '../services/email.service.js'

export class AuthController {
  static register = asyncErrorHandler(async (req, res) => {
    const user = await AuthService.register(req.body);
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
    const result = await AuthService.login(email, password);
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
    const user = await AuthService.getUserById(userId);
    res.json({
      success: true,
      data: user
    });
  });

  static changePassword = asyncErrorHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    await AuthService.resetPassword(token, newPassword);
    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  });

  static requestPasswordReset = asyncErrorHandler(async (req, res) => {
    const { email } = req.body;
    const resetToken = await AuthService.requestPasswordReset(email);
    const resetLink = `${globalVariable.clientUrl}auth/forgot-password?token=${resetToken}`
    await sendResetEmail(email, resetLink);
    
    res.json({
      success: true,
      message: 'Instrucciones de reseteo enviadas al email (simulación)'
    });
  });

  static resetPassword = asyncErrorHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    await AuthService.resetPassword(token, newPassword);
    res.json({
      success: true,
      message: 'Contraseña reseteada exitosamente'
    });
  });
}