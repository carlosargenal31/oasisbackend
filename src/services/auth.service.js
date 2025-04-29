// src/services/auth.service.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { mysqlPool } from '../config/database.js';
import { ValidationError, AuthenticationError, NotFoundError, DatabaseError } from '../utils/errors/index.js';

class AuthService {
  static async getUserById(userId) {
    try {
      const [users] = await mysqlPool.query(
        `SELECT id, first_name, last_name, email, phone, status, profile_image, created_at, updated_at 
         FROM users WHERE id = ?`,
        [userId]
      );
      
      if (!users[0]) {
        throw new NotFoundError('Usuario no encontrado');
      }
      
      return users[0];
    } catch (error) {
      console.error('Error getting user:', error);
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Error al obtener usuario');
    }
  }

  async register(userData) {
    try {
      // Validar email uniqueness
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
        // Create user
        const [userResult] = await connection.query(
          `INSERT INTO users 
           (first_name, last_name, email, phone, status, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            userData.first_name,
            userData.last_name,
            userData.email,
            userData.phone || null,
            'active'
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
      console.error('User registration failed', { error, email: userData.email });
      
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to register user');
    }
  }

  async login(email, password) {
    try {
      console.log(`Attempting login with: ${email}`);
      
      // Find user by email
      const [users] = await mysqlPool.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
  
      if (users.length === 0) {
        console.log(`No user found with email: ${email}`);
        throw new AuthenticationError('Invalid email or password');
      }
  
      const user = users[0];
      console.log(`Found user with ID: ${user.id}`);
  
      // Fetch password from auth_credentials
      const [authCredentials] = await mysqlPool.query(
        'SELECT * FROM auth_credentials WHERE user_id = ?',
        [user.id]
      );
  
      if (authCredentials.length === 0) {
        console.log(`No auth credentials found for user ID: ${user.id}`);
        throw new AuthenticationError('No authentication credentials found');
      }
  
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, authCredentials[0].password);
      console.log(`Password validation result: ${isPasswordValid}`);
      
      if (!isPasswordValid) {
        console.log('Password validation failed');
        throw new AuthenticationError('Invalid email or password');
      }
      
      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token in database
      await mysqlPool.query(
        'UPDATE users SET refresh_token = ?, last_login = NOW() WHERE id = ?',
        [refreshToken, user.id]
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
      console.error('Login failed', { error, email });
      
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to process login');
    }
  }
 
  async logout(userId) {
    try {
      // Clear refresh token in database
      await mysqlPool.query(
        'UPDATE users SET refresh_token = NULL WHERE id = ?',
        [userId]
      );
      
      return true;
    } catch (error) {
      console.error('Logout failed', { error, userId });
      throw new DatabaseError('Failed to process logout');
    }
  }

  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || '1234');
      
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
      console.error('Token refresh failed', { error });
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  async requestPasswordReset(email) {
    try {
      // Find user by email
      const [users] = await mysqlPool.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        // Por seguridad, no revelar que el email no existe
        console.info('Password reset requested for non-existent email', { email });
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
      console.error('Password reset request failed', { error, email });
      throw new DatabaseError('Failed to process password reset request');
    }
  }

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
      console.error('Password reset failed', { error, token });
      
      if (error instanceof ValidationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to reset password');
    }
  }

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
      console.error('Password change failed', { error, userId });
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to change password');
    }
  }

  generateAccessToken(user) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email
      },
      process.env.JWT_SECRET || '1234',
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
      }
    );
  }

  generateRefreshToken(user) {
    return jwt.sign(
      {
        id: user.id
      },
      process.env.JWT_REFRESH_SECRET || '1234',
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
      }
    );
  }

  validateToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || '1234');
    } catch (error) {
      throw new AuthenticationError('Invalid token');
    }
  }
}

// Create a singleton instance
const authService = new AuthService();

export default authService;