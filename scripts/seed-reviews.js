// scripts/seed-reviews.js
import { mysqlPool } from '../config/database.js';

// Nombres aleatorios para los reviewers
const reviewerNames = [
  "Laura Mendoza", "Carlos Rodríguez", "Ana García", "Juan Pérez", 
  "María López", "Roberto Fernández", "Sofía Martínez", "Fernando Torres",
  "Gabriela Castro", "Daniel Herrera", "Valentina Sánchez", "José Ramírez",
  "Camila Flores", "Miguel González", "Isabella Díaz", "Alejandro Vargas",
  "Lucía Morales", "Diego Gutiérrez", "Victoria Rojas", "Eduardo Paredes"
];

// Comentarios positivos
const positiveComments = [
  "¡Increíble propiedad! Las instalaciones están impecables y la ubicación es perfecta. 100% recomendada.",
  "Excelente relación calidad-precio. Muy satisfecho con la atención recibida y las facilidades de la propiedad.",
  "Definitivamente superó mis expectativas. El lugar es amplio, luminoso y muy bien ubicado.",
  "Quedé encantado con esta propiedad. Tiene todo lo necesario para una estancia cómoda y agradable.",
  "El mejor lugar donde me he hospedado hasta ahora. El espacio está perfectamente distribuido y tiene acabados de primera.",
  "La propiedad es aún mejor que en las fotos. Muy espaciosa, ordenada y con una decoración encantadora.",
  "Fabuloso lugar, muy céntrico y con todas las comodidades necesarias. Lo recomiendo ampliamente.",
  "Nos encantó nuestra estancia. El alojamiento está muy bien cuidado y tiene una vista espectacular.",
  "Un lugar excelente para descansar y disfrutar. La zona es tranquila pero tiene todo lo necesario cerca.",
  "La propiedad cumplió todas mis expectativas. Cómoda, limpia y con un diseño moderno."
];

// Comentarios regulares
const averageComments = [
  "Buena propiedad en general. Algunos detalles menores podrían mejorar, pero cumple con lo necesario.",
  "Alojamiento adecuado para nuestra estadía. La ubicación es buena aunque el espacio es algo reducido.",
  "La relación calidad-precio es correcta. La propiedad tiene lo básico para una estancia confortable.",
  "En general bien, aunque hay algunos aspectos que podrían mejorar como el mantenimiento de algunas áreas.",
  "Lugar decente para hospedarse. No tiene lujos pero cumple con lo básico para una estancia cómoda.",
  "La propiedad está bien ubicada y es funcional, aunque el mobiliario está algo desgastado.",
  "Nuestra estancia fue satisfactoria. El lugar es como se muestra en las fotos, aunque esperaba un poco más.",
  "Aceptable para una estancia corta. La ubicación es buena pero las instalaciones necesitan actualizarse."
];

// Comentarios negativos
const negativeComments = [
  "La propiedad no cumplió con mis expectativas. Las fotos mostraban algo diferente a la realidad.",
  "Varios problemas de mantenimiento en la propiedad. No lo recomendaría hasta que mejoren estos aspectos.",
  "La ubicación es buena pero la limpieza dejó mucho que desear. No volvería a hospedarme aquí.",
  "Experiencia decepcionante. El lugar es más pequeño de lo que parece en las fotos y necesita renovación.",
  "No recomendaría esta propiedad. Tuvimos varios inconvenientes durante nuestra estancia."
];

// Función auxiliar para obtener un elemento aleatorio de un array
const getRandomItem = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

// Función auxiliar para obtener un número aleatorio entre min y max (inclusive)
const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Función auxiliar para obtener una fecha aleatoria en los últimos 180 días
const getRandomDate = () => {
  const now = new Date();
  const past = new Date(now.getTime() - getRandomInt(1, 180) * 24 * 60 * 60 * 1000);
  return past.toISOString().slice(0, 19).replace('T', ' ');
};

// Función principal para sembrar reseñas
async function seedReviews() {
  const connection = await mysqlPool.getConnection();
  
  try {
    console.log('Iniciando la siembra de reseñas...');
    
    // Obtener IDs de propiedades existentes
    const [properties] = await connection.query('SELECT id FROM properties');
    
    if (properties.length === 0) {
      console.log('No hay propiedades en la base de datos. No se pueden generar reseñas.');
      return;
    }
    
    console.log(`Se encontraron ${properties.length} propiedades para generar reseñas.`);
    
    // Preparar las reseñas a insertar
    const reviewsToInsert = [];
    
    // Por cada propiedad, generar entre 0 y 8 reseñas
    for (const property of properties) {
      const propertyId = property.id;
      const numReviews = getRandomInt(0, 8); // Algunas propiedades no tendrán reseñas
      
      console.log(`Generando ${numReviews} reseñas para la propiedad ID ${propertyId}`);
      
      for (let i = 0; i < numReviews; i++) {
        // Generar rating entre 1 y 5
        const rating = getRandomInt(1, 5);
        
        // Seleccionar comentario según el rating
        let comment;
        if (rating >= 4) {
          comment = getRandomItem(positiveComments);
        } else if (rating >= 3) {
          comment = getRandomItem(averageComments);
        } else {
          comment = getRandomItem(negativeComments);
        }
        
        // Generar número aleatorio de likes y dislikes
        const likes = getRandomInt(0, 15);
        const dislikes = getRandomInt(0, 5);
        
        // Seleccionar un nombre aleatorio para el revisor
        const reviewerName = getRandomItem(reviewerNames);
        
        // Generar un ID de revisor (0 para anónimo, o un número entre 1 y 50 para usuarios autenticados)
        const reviewerId = Math.random() > 0.3 ? getRandomInt(1, 50) : 0;
        
        // Generar una fecha aleatoria
        const createdAt = getRandomDate();
        
        // Agregar la reseña al array de reseñas a insertar
        reviewsToInsert.push([
          propertyId,
          null, // booking_id (nulo para este ejemplo)
          reviewerId,
          reviewerName,
          rating,
          comment,
          likes,
          dislikes,
          createdAt,
          createdAt // updated_at inicialmente igual a created_at
        ]);
      }
    }
    
    // Si no hay reseñas para insertar, terminar
    if (reviewsToInsert.length === 0) {
      console.log('No se generaron reseñas para insertar.');
      return;
    }
    
    // Insertar todas las reseñas en la base de datos
    const insertQuery = `
      INSERT INTO reviews 
      (property_id, booking_id, reviewer_id, reviewer_name, rating, comment, likes, dislikes, created_at, updated_at)
      VALUES ?
    `;
    
    const [result] = await connection.query(insertQuery, [reviewsToInsert]);
    
    console.log(`Se insertaron exitosamente ${result.affectedRows} reseñas.`);
    
    // Actualizar los ratings promedio en la tabla de propiedades
    console.log('Actualizando los ratings promedio de las propiedades...');
    
    await connection.query(`
      UPDATE properties p
      LEFT JOIN (
        SELECT property_id, AVG(rating) as avg_rating
        FROM reviews
        GROUP BY property_id
      ) r ON p.id = r.property_id
      SET p.average_rating = r.avg_rating
    `);
    
    console.log('Ratings promedio actualizados exitosamente.');
    
  } catch (error) {
    console.error('Error durante la siembra de reseñas:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Ejecutar la función de siembra
seedReviews()
  .then(() => {
    console.log('Proceso de siembra de reseñas finalizado exitosamente.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error en el proceso de siembra de reseñas:', error);
    process.exit(1);
  });