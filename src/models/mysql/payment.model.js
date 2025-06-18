import { mysqlPool } from '../../config/database.js';

export const createPaymentTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS payments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      booking_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'HNL',
      payment_method ENUM('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash') NOT NULL,
      status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
      transaction_id VARCHAR(255),
      details JSON,
      payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      processed_by INT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_booking_id (booking_id),
      INDEX idx_status (status),
      INDEX idx_payment_date (payment_date)
    )
  `;
  
  try {
    const connection = await mysqlPool.getConnection();
    await connection.query(query);
    connection.release();
    console.log('Payments table created successfully');
  } catch (error) {
    console.error('Error creating payments table:', error);
    throw error;
  }
};