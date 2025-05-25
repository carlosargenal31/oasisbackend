// updatePropertyRatings.js
import { mysqlPool } from './src/config/database.js';
import { fileURLToPath } from 'url';

/**
 * Script para actualizar los ratings promedio de todas las propiedades
 * Puede ejecutarse directamente como:
 * node updatePropertyRatings.js
 */
async function updateAllPropertyRatings() {
  const connection = await mysqlPool.getConnection();
  
  try {
    console.log('Iniciando actualización de ratings promedio para todas las propiedades...');
    
    // Obtener todas las propiedades que tienen reseñas
    const [properties] = await connection.query(`
      SELECT DISTINCT p.id 
      FROM properties p
      JOIN reviews r ON p.id = r.property_id
    `);
    
    console.log(`Se encontraron ${properties.length} propiedades con reseñas.`);
    
    // Para cada propiedad, calcular y actualizar el rating promedio
    let updated = 0;
    
    for (const property of properties) {
      const propertyId = property.id;
      
      // Calcular promedio
      const [ratings] = await connection.query(
        'SELECT AVG(rating) as avg_rating FROM reviews WHERE property_id = ?',
        [propertyId]
      );
      
      const avgRating = ratings[0].avg_rating || 0;
      
      // Actualizar rating en la tabla properties
      await connection.query(
        'UPDATE properties SET average_rating = ? WHERE id = ?',
        [avgRating, propertyId]
      );
      
      updated++;
      
      if (updated % 10 === 0) {
        console.log(`Actualizadas ${updated} de ${properties.length} propiedades...`);
      }
    }
    
    console.log(`¡Completado! Se actualizaron los ratings promedio de ${updated} propiedades.`);
    
    return {
      success: true,
      totalProperties: properties.length,
      updatedProperties: updated
    };
  } catch (error) {
    console.error('Error al actualizar los ratings promedio:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Exportar la función para usarla desde otros archivos
export default updateAllPropertyRatings;

// Si se ejecuta directamente el archivo, ejecutar la actualización
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateAllPropertyRatings()
    .then(result => {
      console.log('Resultado:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}