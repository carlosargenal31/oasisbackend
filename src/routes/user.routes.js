// src/routes/user.routes.js
import express from 'express';
import multer from 'multer';

import { validateUserData } from '../middleware/user.middleware.js';
import { authenticate, validatePasswordChange } from '../middleware/auth.middleware.js';
import { UserController, updateProfileImage } from '../controllers/user.controller.js';

const router = express.Router();

// Configuración de multer para manejar imágenes
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
  fileFilter: (req, file, cb) => {
    // Aceptar solo imágenes
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'), false);
    }
  }
});

// Rutas de perfil - deben estar antes de las rutas con :id para evitar conflictos
router.get('/profile', authenticate, UserController.getProfile);
router.put('/profile', authenticate, UserController.updateProfile);
router.put('/password', authenticate, validatePasswordChange, UserController.updatePassword);
router.post('/profile/image', authenticate, upload.single('image'), updateProfileImage);

// Rutas de favoritos
router.get('/favorites', authenticate, UserController.getFavorites);
router.post('/favorites/:propertyId', authenticate, UserController.addFavorite);
router.delete('/favorites/:propertyId', authenticate, UserController.removeFavorite);

// Rutas generales de usuario - deben estar después para que no capturen /profile como :id
router.get('/:id', authenticate, UserController.getUser);
router.put('/:id', authenticate, validateUserData, UserController.updateUser);
router.delete('/:id', authenticate, UserController.deleteUser);

export default router;