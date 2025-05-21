// src/middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import { ValidationError, AuthenticationError } from '../utils/errors/index.js';
import { mysqlPool } from '../config/database.js';
import { UserService} from '../services/user.service.js'

export const authenticate = async (req, res, next) => {
  try {
    // Permitir rutas de prueba sin autenticación en entorno de desarrollo
    if (process.env.NODE_ENV === 'development' && req.path.startsWith('/api/test/')) {
      return next();
    }

    // Caso especial: rutas de comentarios y reseñas - permitir autenticación simplificada
    if ((req.path.includes('/comments') || req.path.includes('/reviews')) && req.body.user_id) {
      try {
        const connection = await mysqlPool.getConnection();
        const [users] = await connection.query(
          'SELECT id, role FROM users WHERE id = ?', 
          [req.body.user_id]
        );
        connection.release();
        
        // Si el usuario existe, establecer userId y continuar
        if (users.length > 0) {
          req.userId = users[0].id;
          req.userRole = users[0].role;
          console.log(`Usuario ${req.userId} autenticado por ID para ${req.path.includes('/comments') ? 'comentarios' : 'reseñas'}`);
          return next();
        } else {
          console.warn(`Usuario con ID ${req.body.user_id} no encontrado en la base de datos`);
        }
      } catch (dbError) {
        console.error(`Error al verificar usuario para ${req.path.includes('/comments') ? 'comentario' : 'reseña'}:`, dbError);
      }
    }

    // Verificación normal con token para casos no especiales
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Token no proporcionado');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || '1234');
      req.userId = decoded.id;
      req.userRole = decoded.role;
      next();
    } catch (error) {
      throw new AuthenticationError('Token inválido o expirado');
    }
  } catch (error) {
    // Manejar el error aquí en lugar de dejarlo propagar
    return res.status(401).json({
      success: false,
      message: error.message || 'Error de autenticación'
    });
  }
};

// Middleware de autenticación opcional para reseñas y funcionalidades públicas
export const optionalAuth = (req, res, next) => {
  // Permitir rutas de prueba sin autenticación en entorno de desarrollo
  if (process.env.NODE_ENV === 'development' && req.path.startsWith('/api/test/')) {
    return next();
  }

  // Caso especial para rutas de comentarios y reseñas
  if ((req.path.includes('/comments') || req.path.includes('/reviews')) && req.body.user_id) {
    try {
      // No necesita verificar la existencia del usuario, sólo establecer userID
      req.userId = req.body.user_id;
      req.userRole = 'user'; // Rol predeterminado
      return next();
    } catch (error) {
      console.warn(`Error al procesar user_id en optionalAuth para ${req.path.includes('/comments') ? 'comentario' : 'reseña'}:`, error);
      // Continuar como usuario no autenticado
      return next();
    }
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Sin token - continuar como usuario no autenticado
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '1234');
    req.userId = decoded.id;
    req.userRole = decoded.role; // Guarda el rol del usuario en req
    next();
  } catch (error) {
    // Error de token - continuar como usuario no autenticado sin lanzar error
    console.warn('Token inválido en optionalAuth:', error.message);
    next();
  }
};

export const validateRegistrationData = (req, res, next) => {
  const { first_name, last_name, email, password } = req.body;

  const errors = [];

  if (!first_name) errors.push('first_name');
  if (!last_name) errors.push('last_name');
  if (!email) errors.push('email');
  if (!password) errors.push('password');

  if (errors.length > 0) {
    throw new ValidationError('Campos requeridos faltantes', errors);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }

  if (password.length < 6) {
    throw new ValidationError('La contraseña debe tener al menos 6 caracteres');
  }

  next();
};

export const validateLoginData = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email y contraseña son requeridos');
  }

  next();
};

export const validateEmailExists = (req, res, next) => {
  const { email } = req.body;

  if (UserService.validateEmail(email)  ) {
    next();
  }
};

export const validatePasswordChange = (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('La contraseña actual y la nueva contraseña son requeridas');
  }

  if (newPassword.length < 6) {
    throw new ValidationError('La nueva contraseña debe tener al menos 6 caracteres');
  }

  next();
};

export const hasRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Primero verificar que el usuario esté autenticado
      if (!req.userId) {
        throw new AuthenticationError('No autenticado');
      }
      
      // Verificar rol directamente si está disponible (caso especial de comentarios)
      if (req.userRole) {
        if (allowedRoles.includes(req.userRole)) {
          return next();
        } else {
          throw new AuthenticationError('No tienes permisos para acceder a este recurso');
        }
      }
      
      // Si no hay rol directamente, intentar verificar token
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('Token no proporcionado');
      }
      
      const token = authHeader.split(' ')[1];
      
      // Decodificar el token para obtener los datos del usuario
      const decoded = jwt.verify(token, process.env.JWT_SECRET || '1234');
      
      // Verificar si el rol del usuario está en los roles permitidos
      if (!decoded.role || !allowedRoles.includes(decoded.role)) {
        throw new AuthenticationError('No tienes permisos para acceder a este recurso');
      }
      
      // Si el rol es válido, continuar
      next();
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: error.message || 'No autorizado'
      });
    }
  };
};

// Middleware para validación de comentarios
export const validateCommentData = (req, res, next) => {
  try {
    const { blog_id, content, user_id } = req.body;
    const errors = [];

    // Validar blog
    if (!blog_id) {
      errors.push('blog_id');
    }

    // Validar contenido
    if (!content) {
      errors.push('content');
    }
    
    // Validar user_id (necesario para la autenticación simplificada)
    if (!user_id) {
      errors.push('user_id');
    }

    // Si hay errores, lanzar error de validación
    if (errors.length > 0) {
      throw new ValidationError('Campos requeridos faltantes', errors);
    }

    // Validar longitud del comentario
    if (content && content.length > 1000) {
      throw new ValidationError('El comentario debe tener menos de 1000 caracteres');
    }

    // Convertir datos a los tipos correctos
    req.body.blog_id = parseInt(blog_id);
    req.body.user_id = parseInt(user_id);

    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error al validar datos de comentario'
    });
  }
};

// Middleware para validación de reseñas
export const validateReviewData = (req, res, next) => {
  try {
    const { property_id, rating, user_id } = req.body;
    const errors = [];

    // Validar propiedad
    if (!property_id) {
      errors.push('property_id');
    }

    // Validar rating
    if (!rating) {
      errors.push('rating');
    } else if (rating < 1 || rating > 5) {
      throw new ValidationError('La calificación debe estar entre 1 y 5');
    }
    
    // Validar user_id (necesario para la autenticación simplificada)
    if (!req.userId && !user_id) {
      errors.push('user_id');
    }

    // Si hay errores, lanzar error de validación
    if (errors.length > 0) {
      throw new ValidationError('Campos requeridos faltantes', errors);
    }

    // Convertir datos a los tipos correctos
    req.body.property_id = parseInt(property_id);
    req.body.rating = parseInt(rating);
    if (user_id) req.body.user_id = parseInt(user_id);

    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message,
        errors: error.errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error al validar datos de reseña'
    });
  }
};

// Middleware especial para rutas de comentarios que no requieren token
export const commentAuth = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido'
      });
    }
    
    // Verificar que el usuario existe en la base de datos
    const connection = await mysqlPool.getConnection();
    const [users] = await connection.query(
      'SELECT id, role FROM users WHERE id = ?', 
      [user_id]
    );
    connection.release();
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Establecer userId y userRole para el controlador
    req.userId = users[0].id;
    req.userRole = users[0].role;
    
    next();
  } catch (error) {
    console.error('Error en comentario Auth:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la autenticación'
    });
  }
};

// Middleware especial para rutas de reseñas que no requieren token
export const reviewAuth = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido'
      });
    }
    
    // Verificar que el usuario existe en la base de datos
    const connection = await mysqlPool.getConnection();
    const [users] = await connection.query(
      'SELECT id, role FROM users WHERE id = ?', 
      [user_id]
    );
    connection.release();
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
    
    // Establecer userId y userRole para el controlador
    req.userId = users[0].id;
    req.userRole = users[0].role;
    
    next();
  } catch (error) {
    console.error('Error en reviewAuth:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la autenticación'
    });
  }
};