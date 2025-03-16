import { mysqlPool } from '../../config/database.js';

export const createPaymentTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS payments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      booking_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'USD',
      payment_method ENUM('credit_card', 'debit_card', 'paypal', 'bank_transfer') NOT NULL,
      status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
      transaction_id VARCHAR(255),
      payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
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