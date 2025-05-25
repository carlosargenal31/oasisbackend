/**
 * Configuración centralizada para OASIS
 */
import dotenv from 'dotenv';

dotenv.config();

export default {
  // Server configuration
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  apiPrefix: process.env.API_PREFIX || '/api',
  
  // Client application URL
  clientUrl: process.env.CLIENT_URL,
  emailAcount: process.env.EMAIL,
  emailPass: process.env.EMAIL_PASS,
  
  // Authentication configurations
  auth: {
    accessTokenSecret: process.env.JWT_SECRET || '1234',
    accessTokenExpiry: process.env.JWT_EXPIRES_IN || '7d',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || '1234',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  }
};