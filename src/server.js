// server.js
import express from 'express';
import { errorMiddleware } from './middleware/error.middleware.js';
import { authenticate } from './middleware/auth.middleware.js';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool } from './config/database.js';
import mongoose from 'mongoose';

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar los modelos
import { createUserTable} from './models/mysql/user.model.js';
import { createAuthTable } from './models/mysql/auth.model.js';
import { createPropertyTable } from './models/mysql/property.model.js';
import { createPropertyAmenityTable } from './models/mysql/property-amenity.model.js';
import { createPropertyPetTable } from './models/mysql/property-pet.model.js';
import { createPropertyImageTable } from './models/mysql/property-image.model.js';
import { Booking } from './models/mysql/booking.model.js';
import { createReviewTable } from './models/mysql/review.model.js';
import { createPaymentTable } from './models/mysql/payment.model.js';
import { createFavoritesTable } from './models/mysql/favorites.model.js';
import { createBlogTable } from './models/mysql/blog.model.js';
import { createEventTable } from './models/mysql/event.model.js';

// Importar rutas
import userRoutes from './routes/user.routes.js';
import propertyRoutes from './routes/property.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import reviewRoutes from './routes/review.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import messageRoutes from './routes/message.routes.js';
import authRoutes from './routes/auth.routes.js';
import blogRoutes from './routes/blog.routes.js';
import eventRoutes from './routes/event.routes.js';
import adminRoutes from './routes/admin.routes.js'; // Importar las rutas de administrador

const app = express();
dotenv.config();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar directorio estático para servir archivos de uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Función para inicializar la base de datos
const initDatabase = async () => {
  try {
    console.log('Iniciando creación de tablas...');
    
    // Actualizar la tabla de usuarios para incluir el campo 'role'
    await createUserTable();
    
    // Verificar y agregar la columna 'role' si no existe
    try {
      const checkRoleColumn = await mysqlPool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'role'
      `, [process.env.DB_NAME || 'oasis']);
      
      if (checkRoleColumn[0].length === 0) {
        console.log('Adding role column to users table...');
        await mysqlPool.query(`
          ALTER TABLE users 
          ADD COLUMN role ENUM('user', 'admin') DEFAULT 'user'
        `);
        console.log('Role column added successfully');
      } else {
        console.log('Role column already exists');
      }
    } catch (error) {
      console.error('Error checking/adding role column:', error);
    }

    await createAuthTable();
    
    // Crear tablas relacionadas con propiedades
    await createPropertyTable();
    await createPropertyAmenityTable(); 
    await createPropertyPetTable();     
    await createPropertyImageTable();   
    
    await Booking.createTable();
    await createReviewTable();
    await createPaymentTable();
    await createFavoritesTable();
    
    // Crear tabla de blogs
    await createBlogTable();
    
    // Crear tabla de eventos
    await createEventTable();
    
    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// Test route
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'API is working!' 
  });
});

// Rutas públicas (no requieren autenticación)
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/blogs', blogRoutes); 
app.use('/api/events', eventRoutes);

// Rutas protegidas (requieren autenticación)
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);

// Rutas de administrador (requieren autenticación y privilegios de admin)
app.use('/api/admin', adminRoutes);

// Ruta para probar un usuario específico (solo para desarrollo)
app.get('/api/dev/user/:id', async (req, res) => {
  try {
    const connection = await mysqlPool.getConnection();
    const [users] = await connection.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    connection.release();
    
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    
    res.json({ success: true, data: users[0] });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// Ruta para crear un usuario administrador (solo para desarrollo)
app.post('/api/dev/create-admin', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, password, first_name y last_name son requeridos' 
      });
    }
    
    const connection = await mysqlPool.getConnection();
    
    // Verificar si el usuario ya existe
    const [existingUser] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    
    if (existingUser.length > 0) {
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: 'El email ya está registrado' 
      });
    }
    
    // Crear el usuario con role admin
    const [userResult] = await connection.query(`
      INSERT INTO users (first_name, last_name, email, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 'active', NOW(), NOW())
    `, [first_name, last_name, email]);
    
    // Hash de la contraseña
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Crear credenciales de autenticación
    await connection.query(`
      INSERT INTO auth_credentials (user_id, password)
      VALUES (?, ?)
    `, [userResult.insertId, hashedPassword]);
    
    connection.release();
    
    res.json({ 
      success: true, 
      message: 'Administrador creado exitosamente',
      data: {
        id: userResult.insertId,
        email,
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Error creando administrador:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al crear administrador' 
    });
  }
});

// 404 error handler para API
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Page not found: ${req.originalUrl}`
  });
});

// Para una aplicación Vue.js con Vue Router en modo history,
// todas las demás rutas deben redirigirse al index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Middleware de manejo de errores
app.use(errorMiddleware);

// Conectar MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/oasis')
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Inicializar base de datos y servidor
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Admin routes available at: http://localhost:${PORT}/api/admin`);
  });
});

export default app;