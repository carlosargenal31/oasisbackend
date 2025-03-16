import express from 'express';
import { UserController } from '../controllers/user.controller.js';
import { validateUserData } from '../middleware/user.middleware.js';
import { authenticate, authorize, validatePasswordChange } from '../middleware/auth.middleware.js'; // Add validatePasswordChange here

const router = express.Router();

// Admin routes
router.post('/', authenticate, authorize(['admin']), validateUserData, UserController.createUser);
router.get('/', authenticate, authorize(['admin']), UserController.getUsers);
router.get('/role/:role', authenticate, authorize(['admin']), UserController.getUsersByRole);

// Profile routes
router.get('/profile', authenticate, UserController.getProfile);
router.put('/profile', authenticate, validateUserData, UserController.updateProfile);
router.put('/password', authenticate, validatePasswordChange, UserController.updatePassword);

// Favorites routes
router.get('/favorites', authenticate, UserController.getFavorites);
router.post('/favorites/:propertyId', authenticate, UserController.addFavorite);
router.delete('/favorites/:propertyId', authenticate, UserController.removeFavorite);

// General user routes
router.get('/:id', authenticate, UserController.getUser);
router.put('/:id', authenticate, validateUserData, UserController.updateUser);
router.delete('/:id', authenticate, UserController.deleteUser);

export default router;