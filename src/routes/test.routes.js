// src/routes/test.routes.js
import express from 'express';
import emailService from '../services/email.service.js';

const router = express.Router();

/**
 * @route   GET /api/test/email
 * @desc    Probar el envío de un email de bienvenida
 * @access  Desarrollo
 */
router.get('/email', async (req, res) => {
  try {
    const testUser = {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User'
    };
    
    const result = await emailService.sendWelcomeEmail(testUser);
    
    res.json({ 
      success: true, 
      message: 'Email enviado correctamente',
      info: result,
      previewUrl: result.previewUrl || null
    });
  } catch (error) {
    console.error('Prueba de email fallida:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al enviar el email de prueba',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/test/email/verification
 * @desc    Probar el envío de un email de verificación
 * @access  Desarrollo
 */
router.get('/email/verification', async (req, res) => {
  try {
    const testUser = {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User'
    };
    
    const testToken = 'test-verification-token-123';
    
    const result = await emailService.sendAccountVerificationEmail(testUser, testToken);
    
    res.json({ 
      success: true, 
      message: 'Email de verificación enviado correctamente',
      info: result,
      previewUrl: result.previewUrl || null
    });
  } catch (error) {
    console.error('Prueba de email de verificación fallida:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al enviar el email de verificación de prueba',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/test/email/booking
 * @desc    Probar el envío de un email de confirmación de reserva
 * @access  Desarrollo
 */
router.get('/email/booking', async (req, res) => {
  try {
    // Datos de prueba para una reserva
    const mockBooking = {
      id: 'booking123',
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días después
      endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 días después
      totalPrice: 450.00,
      user: {
        id: 'user123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User'
      },
      property: {
        id: 'prop123',
        title: 'Apartamento de Lujo en la Playa',
        address: 'Calle Principal 123, Playa del Carmen',
        ownerId: 'owner123',
        owner: {
          id: 'owner123',
          email: 'owner@example.com',
          firstName: 'Propietario',
          lastName: 'Test'
        }
      }
    };
    
    const result = await emailService.sendBookingConfirmationEmail(mockBooking);
    
    res.json({ 
      success: true, 
      message: 'Email de confirmación de reserva enviado correctamente',
      info: result,
      previewUrl: result.previewUrl || null
    });
  } catch (error) {
    console.error('Prueba de email de reserva fallida:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al enviar el email de confirmación de reserva',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/test/ping
 * @desc    Verificar que las rutas de prueba funcionan
 * @access  Desarrollo
 */
router.get('/ping', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Rutas de prueba funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

export default router;