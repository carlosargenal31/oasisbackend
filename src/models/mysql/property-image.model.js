// models/mysql/property-image.model.js
import { mysqlPool } from '../../config/database.js';

export class PropertyImage {
  // Crear la tabla de imágenes si no existe
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS property_images (
        id INT PRIMARY KEY AUTO_INCREMENT,
        property_id INT,
        image_url VARCHAR(255) NOT NULL,
        is_primary BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Property images table created successfully');
    } catch (error) {
      console.error('Error creating property images table:', error);
      throw error;
    }
  }

  // Añadir una imagen a una propiedad
  static async addToProperty(propertyId, imageUrl, isPrimary = false) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Si es primaria, actualizar las existentes
      if (isPrimary) {
        await connection.query(
          'UPDATE property_images SET is_primary = FALSE WHERE property_id = ?',
          [propertyId]
        );
      }
      
      // Insertar nueva imagen
      const [result] = await connection.query(
        'INSERT INTO property_images (property_id, image_url, is_primary) VALUES (?, ?, ?)',
        [propertyId, imageUrl, isPrimary]
      );
      
      connection.release();
      return result.insertId;
    } catch (error) {
      console.error('Error adding image to property:', error);
      throw error;
    }
  }

  // Obtener imágenes de una propiedad
  static async getByPropertyId(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT id, image_url, is_primary FROM property_images WHERE property_id = ? ORDER BY is_primary DESC',
        [propertyId]
      );
      
      connection.release();
      return rows;
    } catch (error) {
      console.error('Error getting images for property:', error);
      throw error;
    }
  }

  // Eliminar una imagen
  static async delete(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'DELETE FROM property_images WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting property image:', error);
      throw error;
    }
  }
}

export const createPropertyImageTable = async () => {
  await PropertyImage.createTable();
};