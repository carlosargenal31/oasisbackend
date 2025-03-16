// src/models/mysql/auth.model.js
import { mysqlPool } from '../../config/database.js';
import bcrypt from 'bcryptjs';

export const createAuthTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS auth_credentials (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      reset_token VARCHAR(255),
      reset_token_expires DATETIME,
      last_login TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;
  
  try {
    const connection = await mysqlPool.getConnection();
    await connection.query(query);
    connection.release();
    console.log('Auth credentials table created successfully');
  } catch (error) {
    console.error('Error creating auth credentials table:', error);
    throw error;
  }
};