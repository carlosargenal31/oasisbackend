// src/models/mysql/booking.model.js
import { mysqlPool } from '../../config/database.js';

export const createBookingTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS bookings (
      id INT PRIMARY KEY AUTO_INCREMENT,
      property_id INT NOT NULL,
      guest_name VARCHAR(255) NOT NULL,
      guest_email VARCHAR(255) NOT NULL,
      check_in_date DATE NOT NULL,
      check_out_date DATE NOT NULL,
      total_price DECIMAL(10,2) NOT NULL,
      status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
    )
  `;
  
  try {
    const connection = await mysqlPool.getConnection();
    await connection.query(query);
    connection.release();
    console.log('Bookings table created successfully');
  } catch (error) {
    console.error('Error creating bookings table:', error);
    throw error;
  }
};
