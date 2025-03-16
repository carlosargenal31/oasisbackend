// src/models/mysql/favorites.model.js
import { mysqlPool } from '../../config/database.js';

export const createFavoritesTable = async () => {
  try {
    const connection = await mysqlPool.getConnection();
    
    const query = `
      CREATE TABLE IF NOT EXISTS favorites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        property_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        UNIQUE KEY user_property (user_id, property_id)
      )
    `;
    
    await connection.query(query);
    console.log('Favorites table created successfully');
    connection.release();
  } catch (error) {
    console.error('Error creating favorites table:', error);
    throw error;
  }
};