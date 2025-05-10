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
import { createEventTable } from './models/mysql/event.model.js'; // Importar la tabla de eventos

// Importar rutas
import userRoutes from './routes/user.routes.js';
import propertyRoutes from './routes/property.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import reviewRoutes from './routes/review.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import messageRoutes from './routes/message.routes.js';
import authRoutes from './routes/auth.routes.js';
import blogRoutes from './routes/blog.routes.js';
import eventRoutes from './routes/event.routes.js'; // Importar rutas de eventos

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
    // Crear las tablas en orden de dependencias
    await createUserTable();

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
app.use('/api/events', eventRoutes); // Agregar rutas de eventos

// Rutas protegidas (requieren autenticación)
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);

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
  });
});

export default app;