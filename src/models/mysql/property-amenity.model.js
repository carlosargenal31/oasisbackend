// models/mysql/property-amenity.model.js
import { mysqlPool } from '../../config/database.js';

export class PropertyAmenity {
  // Crear la tabla de amenidades si no existe
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS property_amenities (
        property_id INT,
        amenity VARCHAR(100),
        PRIMARY KEY (property_id, amenity),
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Property amenities table created successfully');
    } catch (error) {
      console.error('Error creating property amenities table:', error);
      throw error;
    }
  }

  // Añadir amenidades a una propiedad
  static async addToProperty(propertyId, amenities) {
    if (!Array.isArray(amenities) || amenities.length === 0) {
      return;
    }
    
    try {
      const connection = await mysqlPool.getConnection();
      
      // Eliminar amenidades existentes
      await connection.query(
        'DELETE FROM property_amenities WHERE property_id = ?',
        [propertyId]
      );
      
      // Preparar valores para inserción múltiple
      const values = amenities.map(amenity => [propertyId, amenity]);
      
      // Insertar nuevas amenidades
      await connection.query(
        'INSERT INTO property_amenities (property_id, amenity) VALUES ?',
        [values]
      );
      
      connection.release();
      return true;
    } catch (error) {
      console.error('Error adding amenities to property:', error);
      throw error;
    }
  }

  // Obtener amenidades de una propiedad
  static async getByPropertyId(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT amenity FROM property_amenities WHERE property_id = ?',
        [propertyId]
      );
      
      connection.release();
      return rows.map(row => row.amenity);
    } catch (error) {
      console.error('Error getting amenities for property:', error);
      throw error;
    }
  }
}

export const createPropertyAmenityTable = async () => {
  await PropertyAmenity.createTable();
};