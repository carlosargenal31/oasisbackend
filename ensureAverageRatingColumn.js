// ensureAverageRatingColumn.js
import { mysqlPool } from './src/config/database.js';
import { fileURLToPath } from 'url';

/**
 * Script para asegurar que existe la columna average_rating en la tabla properties
 * Puede ejecutarse directamente como:
 * node ensureAverageRatingColumn.js
 */
async function ensureAverageRatingColumn() {
  const connection = await mysqlPool.getConnection();
  
  try {
    console.log('Verificando si existe la columna average_rating en la tabla properties...');
    
    // Comprobar si la columna ya existe
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'properties'
      AND COLUMN_NAME = 'average_rating'
    `);
    
    if (columns.length === 0) {
      console.log('La columna average_rating no existe. Creándola...');
      
      // Añadir la columna si no existe
      await connection.query(`
        ALTER TABLE properties
        ADD COLUMN average_rating DECIMAL(3,2) DEFAULT 0
      `);
      
      console.log('Columna average_rating creada exitosamente.');
      return { 
        success: true, 
        message: 'Columna average_rating creada' 
      };
    } else {
      console.log('La columna average_rating ya existe en la tabla properties.');
      return { 
        success: true, 
        message: 'La columna average_rating ya existía' 
      };
    }
  } catch (error) {
    console.error('Error al verificar/crear la columna average_rating:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Exportar la función para usarla desde otros archivos
export default ensureAverageRatingColumn;

// Si se ejecuta directamente el archivo, ejecutar la verificación
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureAverageRatingColumn()
    .then(result => {
      console.log('Resultado:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}