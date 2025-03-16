// models/mysql/property-pet.model.js
import { mysqlPool } from '../../config/database.js';

export class PropertyPetAllowed {
  // Crear la tabla de mascotas permitidas si no existe
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS property_pets_allowed (
        property_id INT,
        pet_type ENUM('cats-allowed', 'dogs-allowed'),
        PRIMARY KEY (property_id, pet_type),
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )
    `;
    
    try {
      const connection = await mysqlPool.getConnection();
      await connection.query(query);
      connection.release();
      console.log('Property pets allowed table created successfully');
    } catch (error) {
      console.error('Error creating property pets allowed table:', error);
      throw error;
    }
  }

  // Añadir mascotas permitidas a una propiedad
  static async addToProperty(propertyId, petTypes) {
    if (!Array.isArray(petTypes) || petTypes.length === 0) {
      return;
    }
    
    try {
      const connection = await mysqlPool.getConnection();
      
      // Eliminar mascotas permitidas existentes
      await connection.query(
        'DELETE FROM property_pets_allowed WHERE property_id = ?',
        [propertyId]
      );
      
      // Preparar valores para inserción múltiple
      const values = petTypes.map(petType => [propertyId, petType]);
      
      // Insertar nuevas mascotas permitidas
      await connection.query(
        'INSERT INTO property_pets_allowed (property_id, pet_type) VALUES ?',
        [values]
      );
      
      connection.release();
      return true;
    } catch (error) {
      console.error('Error adding pets allowed to property:', error);
      throw error;
    }
  }

  // Obtener mascotas permitidas de una propiedad
  static async getByPropertyId(propertyId) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [rows] = await connection.query(
        'SELECT pet_type FROM property_pets_allowed WHERE property_id = ?',
        [propertyId]
      );
      
      connection.release();
      return rows.map(row => row.pet_type);
    } catch (error) {
      console.error('Error getting pets allowed for property:', error);
      throw error;
    }
  }
}

export const createPropertyPetTable = async () => {
  await PropertyPetAllowed.createTable();
};