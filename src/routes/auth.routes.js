// src/routes/auth.routes.js
import express from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateRegistrationData, validateLoginData, validatePasswordChange, validateEmailExists } from '../middleware/auth.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public routes
router.post('/register', validateRegistrationData, AuthController.register);
router.post('/login', validateLoginData, AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/request-reset', validateEmailExists, AuthController.requestPasswordReset);
router.post('/reset-password', AuthController.changePassword);

// Protected routes
router.get('/me', authenticate, AuthController.getCurrentUser);
router.post('/change-password', authenticate, validatePasswordChange, AuthController.changePassword);

export default router;