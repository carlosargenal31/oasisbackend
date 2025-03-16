import express from 'express';
import { errorMiddleware } from './middleware/error.middleware.js';
import { authenticate } from './middleware/auth.middleware.js';
import dotenv from 'dotenv';
import cors from 'cors';
import { mysqlPool } from './config/database.js';
import mongoose from 'mongoose';

// Importar los modelos
import { createUserTable } from './models/mysql/user.model.js';
import { createAuthTable } from './models/mysql/auth.model.js';
import { createPropertyTable } from './models/mysql/property.model.js';
import { createPropertyAmenityTable } from './models/mysql/property-amenity.model.js';
import { createPropertyPetTable } from './models/mysql/property-pet.model.js';
import { createPropertyImageTable } from './models/mysql/property-image.model.js';
import { createBookingTable } from './models/mysql/booking.model.js';
import { createReviewTable } from './models/mysql/review.model.js';
import { createPaymentTable } from './models/mysql/payment.model.js';
import { createFavoritesTable } from './models/mysql/favorites.model.js';

// Importar rutas
import userRoutes from './routes/user.routes.js';
import propertyRoutes from './routes/property.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import reviewRoutes from './routes/review.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import messageRoutes from './routes/message.routes.js';
import authRoutes from './routes/auth.routes.js';

const app = express();
dotenv.config();

// Middleware
app.use(cors());
app.use(express.json());

// Función para inicializar la base de datos
const initDatabase = async () => {
  try {
    // Crear las tablas en orden de dependencias
    await createUserTable();
    await createAuthTable();
    
    // Crear tablas relacionadas con propiedades
    await createPropertyTable();
    await createPropertyAmenityTable(); // Nueva tabla de amenidades
    await createPropertyPetTable();     // Nueva tabla de mascotas permitidas
    await createPropertyImageTable();   // Nueva tabla de imágenes adicionales
    
    await createBookingTable();
    await createReviewTable();
    await createPaymentTable();
    await createFavoritesTable(); // Asegúrate de crear esta tabla
    
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
app.use('/api/properties', propertyRoutes); // Cambio importante: montamos directamente en /api/properties

// Aplicar middleware de autenticación a todas las rutas a partir de aquí
// app.use('/api', authenticate); // Eliminamos esto para evitar doble autenticación

// Rutas protegidas (requieren autenticación)
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);

// 404 error handler
app.use((req, res, next) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found' 
  });
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