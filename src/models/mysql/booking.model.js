// src/models/mysql/booking.model.js
import { mysqlPool } from '../../config/database.js';

export class Booking {
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS bookings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        property_id INT NOT NULL,
        user_id INT,
        guest_name VARCHAR(255) NOT NULL,
        guest_email VARCHAR(255) NOT NULL,
        guest_phone VARCHAR(20),
        check_in_date DATE NOT NULL,
        check_out_date DATE NOT NULL,
        guests INT NOT NULL DEFAULT 1,
        total_price DECIMAL(10,2) NOT NULL,
        special_requests TEXT,
        cancellation_reason TEXT,
        status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
        payment_status ENUM('pending', 'completed', 'refunded', 'failed') DEFAULT 'pending',
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Bookings table created successfully');
      
      // Create payments table if needed
      await this.createPaymentsTable();
      
      return true;
    } catch (error) {
      console.error('Error creating bookings table:', error);
      throw error;
    }
  }
  
  static async createPaymentsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS payments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        booking_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'HNL',
        payment_method VARCHAR(50),
        transaction_id VARCHAR(255),
        status ENUM('pending', 'completed', 'refunded', 'failed', 'cancelled') DEFAULT 'pending',
        payment_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Payments table created successfully');
      return true;
    } catch (error) {
      console.error('Error creating payments table:', error);
      throw error;
    }
  }
  
  static async findById(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT * FROM bookings WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
      
      connection.release();
      
      if (rows.length === 0) {
        return null;
      }
      
      return rows[0];
    } catch (error) {
      console.error('Error finding booking by ID:', error);
      throw error;
    }
  }
  
  static async countByPropertyId(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'SELECT COUNT(*) as count FROM bookings WHERE property_id = ? AND deleted_at IS NULL',
        [propertyId]
      );
      
      connection.release();
      
      return result[0].count;
    } catch (error) {
      console.error('Error counting bookings by property ID:', error);
      throw error;
    }
  }
  
  static async countByUserId(userId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'SELECT COUNT(*) as count FROM bookings WHERE user_id = ? AND deleted_at IS NULL',
        [userId]
      );
      
      connection.release();
      
      return result[0].count;
    } catch (error) {
      console.error('Error counting bookings by user ID:', error);
      throw error;
    }
  }
}

export default Booking;