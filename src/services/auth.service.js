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
        throw new ValidationError('Email ya está registrado');
      }
  
      // Hash password before storing
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // Hash security answer before storing
      const hashedSecurityAnswer = await bcrypt.hash(userData.security_answer.toLowerCase().trim(), 10);
  
      // Start transaction
      const connection = await mysqlPool.getConnection();
      await connection.beginTransaction();
  
      try {
        // Create user with all new fields
        const [userResult] = await connection.query(
          `INSERT INTO users 
           (first_name, last_name, email, phone, status, security_question, security_answer, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            userData.first_name,
            userData.last_name,
            userData.email,
            userData.phone,
            'active',
            userData.security_question,
            hashedSecurityAnswer
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
  
        // Fetch created user (without sensitive data)
        const [users] = await connection.query(
          `SELECT id, first_name, last_name, email, phone, status, security_question, created_at, updated_at 
           FROM users WHERE id = ?`,
          [userId]
        );
  
        // Commit transaction
        await connection.commit();
        connection.release();
  
        const newUser = users[0];
        
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

  async getUserSecurityInfo(email) {
    try {
      // Find user by email
      const [users] = await mysqlPool.query(
        'SELECT id, first_name, last_name, phone, security_question, created_at FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        throw new NotFoundError('No se encontró una cuenta con este email');
      }

      const user = users[0];

      return {
        hasPhone: !!user.phone,
        securityQuestion: user.security_question,
        accountCreated: new Date(user.created_at).getFullYear().toString()
      };
    } catch (error) {
      console.error('Get user security info failed', { error, email });
      
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to get user security info');
    }
  }

  async verifySecurityAnswers(email, answers) {
    try {
      // Find user by email
      const [users] = await mysqlPool.query(
        'SELECT id, first_name, last_name, phone, security_question, security_answer, created_at FROM users WHERE email = ?',
        [email]
      );

      if (users.length === 0) {
        throw new NotFoundError('Usuario no encontrado');
      }

      const user = users[0];
      
      // Verificar nombre completo (case insensitive)
      const expectedFullName = `${user.first_name} ${user.last_name}`.toLowerCase().trim();
      const providedFullName = answers.fullName.toLowerCase().trim();
      
      if (expectedFullName !== providedFullName) {
        throw new ValidationError('Las respuestas de seguridad no coinciden con nuestros registros');
      }
      
      // Verificar teléfono si aplica (últimos 4 dígitos)
      if (user.phone && answers.phoneDigits) {
        const phoneDigits = user.phone.replace(/\D/g, '').slice(-4);
        if (phoneDigits !== answers.phoneDigits) {
          throw new ValidationError('Las respuestas de seguridad no coinciden con nuestros registros');
        }
      }
      
      // Verificar respuesta de seguridad usando bcrypt
      const isSecurityAnswerValid = await bcrypt.compare(
        answers.securityAnswer.toLowerCase().trim(), 
        user.security_answer
      );
      
      if (!isSecurityAnswerValid) {
        throw new ValidationError('Las respuestas de seguridad no coinciden con nuestros registros');
      }
      
      // Verificar año de creación (permitir un rango de ±1 año)
      const creationYear = new Date(user.created_at).getFullYear();
      const providedYear = parseInt(answers.creationYear);
      
      if (Math.abs(creationYear - providedYear) > 1) {
        throw new ValidationError('Las respuestas de seguridad no coinciden con nuestros registros');
      }
      
      // Generar token de reset válido
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // Token válido por 1 hora

      // Guardar token de reset en la base de datos
      await mysqlPool.query(
        'UPDATE auth_credentials SET reset_token = ?, reset_token_expires = ? WHERE user_id = ?',
        [resetToken, resetExpires, user.id]
      );
      
      return resetToken;
    } catch (error) {
      console.error('Verify security answers failed', { error, email });
      
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to verify security answers');
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
        throw new ValidationError('Token de reset inválido o expirado');
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