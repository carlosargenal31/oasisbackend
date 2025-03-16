/**
 * Authentication configuration
 * Settings for JWT tokens and authentication
 */
import dotenv from 'dotenv';

dotenv.config();

export default {
  auth: {
    accessTokenSecret: process.env.JWT_SECRET || '1234',
    accessTokenExpiry: process.env.JWT_EXPIRES_IN || '7d',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || '1234',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    saltRounds: 10
  }
};