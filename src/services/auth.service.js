/**
 * Authentication Service
 * Manages user authentication, registration, password reset, etc.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { mysqlPool } from '../config/database.js';
import config from '../config/index.js';
import { ValidationError, AuthenticationError, NotFoundError, DatabaseError } from '../utils/errors/index.js';
import logger from '../utils/logger.js';

class AuthService {

  static async getUserById(userId) {
    try {
      const [users] = await mysqlPool.query(
        `SELECT id, first_name, last_name, email, phone, role, created_at, updated_at 
         FROM users WHERE id = ?`,
        [userId]
      );
      
      if (!users[0]) {
        throw new NotFoundError('Usuario no encontrado');
      }
      
      return users[0];
    } catch (error) {
      console.error('Error getting user:', error);
      if (error instanceof BaseError) {
        throw error;
      }
      throw new DatabaseError('Error al obtener usuario');
    }
  }
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} - The created user object (without password)
   */
  async register(userData) {
    try {
      // Validate email uniqueness
      const [existingUsers] = await mysqlPool.query(
        'SELECT * FROM users WHERE email = ?',
        [userData.email]
      );
      
      if (existingUsers.length > 0) {
        throw new ValidationError('Email is already registered');
      }
  
      // Hash password before storing
      const hashedPassword = await bcrypt.hash(userData.password, 10);
  
      // Start transaction
      const connection = await mysqlPool.getConnection();
      await connection.beginTransaction();
  
      try {
        // Create user (simplificado, sin tokens de verificación)
        const [userResult] = await connection.query(
          `INSERT INTO users 
           (first_name, last_name, email, role, created_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            userData.first_name,
            userData.last_name,
            userData.email,
            userData.role || 'guest',
            new Date()
          ]
        );
  
        const userId = userResult.insertId;
  
        // Insert into auth_credentials
        await connection.query(
          `INSERT INTO auth_credentials 
           (user_id, password) 
           VALUES (?, ?)`,
          [userId, hashedPassword]
        );
  
        // Fetch created user
        const [users] = await connection.query(
          'SELECT * FROM users WHERE id = ?',
          [userId]
        );
  
        // Commit transaction
        await connection.commit();
        connection.release();
  
        const newUser = users[0];
        
        // Remove sensitive data before returning
        delete newUser.password;
        
        return newUser;
      } catch (error) {
        // Rollback transaction in case of error
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      logger.error('User registration failed', { error, email: userData.email });
      
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to register user');
    }
  }

  /**
   * Login user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} - Authentication tokens and user data
   */
  async login(email, password) {
    try {
      // Find user by email
      const [users] = await mysqlPool.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
  
      if (users.length === 0) {
        throw new AuthenticationError('Invalid email or password');
      }
  
      const user = users[0];
  
      // Fetch password from auth_credentials
      const [authCredentials] = await mysqlPool.query(
        'SELECT password FROM auth_credentials WHERE user_id = ?',
        [user.id]
      );
  
      if (authCredentials.length === 0) {
        throw new AuthenticationError('No authentication credentials found');
      }
  
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, authCredentials[0].password);
      
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid email or password');
      }
      
      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token in database
      await mysqlPool.query(
        'UPDATE users SET refresh_token = ?, last_login = ? WHERE id = ?',
        [refreshToken, new Date(), user.id]
      );

      // Remove sensitive data before returning
      const userWithoutPassword = { ...user };
      delete userWithoutPassword.password;

      return {
        user: userWithoutPassword,
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error('Login failed', { error, email });
      
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to process login');
    }
  }
 
  /**
   * Logout user by invalidating refresh token
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async logout(userId) {
    try {
      // Clear refresh token in database
      await mysqlPool.query(
        'UPDATE users SET refresh_token = NULL WHERE id = ?',
        [userId]
      );
      
      return true;
    } catch (error) {
      logger.error('Logout failed', { error, userId });
      throw new DatabaseError('Failed to process logout');
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} - New access token
   */
  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.auth.refreshTokenSecret);
      
      // Find user with the given refresh token
      const [users] = await mysqlPool.query(
        'SELECT * FROM users WHERE id = ? AND refresh_token = ?',
        [decoded.id, refreshToken]
      );

      if (users.length === 0) {
        throw new AuthenticationError('Invalid refresh token');
      }

      const user = users[0];

      // Generate new access token
      const newAccessToken = this.generateAccessToken(user);
      
      return {
        accessToken: newAccessToken
      };
    } catch (error) {
      logger.error('Token refresh failed', { error });
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  /**
   * Request password reset - SIMPLIFICADO sin email
   * @param {string} email - User email
   * @returns {Promise<string>} - Reset token
   */
  async requestPasswordReset(email) {
    try {
      // Find user by email
      const [users] = await mysqlPool.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        // Por seguridad, no revelar que el email no existe
        logger.info('Password reset requested for non-existent email', { email });
        throw new NotFoundError('User not found');
      }

      const user = users[0];

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // Token valid for 1 hour

      // Store reset token in database
      await mysqlPool.query(
        'UPDATE auth_credentials SET reset_token = ?, reset_token_expires = ? WHERE user_id = ?',
        [resetToken, resetExpires, user.id]
      );
      
      // En vez de enviar email, devolvemos el token para pruebas
      return resetToken;
    } catch (error) {
      logger.error('Password reset request failed', { error, email });
      throw new DatabaseError('Failed to process password reset request');
    }
  }

  /**
   * Reset password with token
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} - Success status
   */
  async resetPassword(token, newPassword) {
    try {
      // Find user with the given reset token
      const [credentials] = await mysqlPool.query(
        'SELECT * FROM auth_credentials WHERE reset_token = ? AND reset_token_expires > ?',
        [token, new Date()]
      );

      if (credentials.length === 0) {
        throw new ValidationError('Invalid or expired reset token');
      }

      const credential = credentials[0];

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user password and clear reset token
      await mysqlPool.query(
        'UPDATE auth_credentials SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [hashedPassword, credential.id]
      );
      
      return true;
    } catch (error) {
      logger.error('Password reset failed', { error, token });
      
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to reset password');
    }
  }

  /**
   * Change password for authenticated user
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} - Success status
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Find credentials by user ID
      const [credentials] = await mysqlPool.query(
        'SELECT * FROM auth_credentials WHERE user_id = ?',
        [userId]
      );
      
      if (credentials.length === 0) {
        throw new NotFoundError('User credentials not found');
      }

      const credential = credentials[0];

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, credential.password);
      if (!isPasswordValid) {
        throw new ValidationError('Current password is incorrect');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user password
      await mysqlPool.query(
        'UPDATE auth_credentials SET password = ? WHERE user_id = ?',
        [hashedPassword, userId]
      );
      
      return true;
    } catch (error) {
      logger.error('Password change failed', { error, userId });
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to change password');
    }
  }

  /**
   * Generate JWT access token
   * @param {Object} user - User object
   * @returns {string} - JWT token
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
      }
    );
  }

  /**
   * Generate JWT refresh token
   * @param {Object} user - User object
   * @returns {string} - JWT token
   */
  generateRefreshToken(user) {
    return jwt.sign(
      {
        id: user.id
      },
      process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
      }
    );
  }

  /**
   * Validate JWT token
   * @param {string} token - JWT token
   * @returns {Object} - Decoded token payload
   */
  validateToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (error) {
      throw new AuthenticationError('Invalid token');
    }
  }
}

// Create a singleton instance
const authService = new AuthService();

export default authService;