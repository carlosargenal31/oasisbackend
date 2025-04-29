// reset-passwords.js
import { mysqlPool } from './src/config/database.js';
import bcrypt from 'bcryptjs';

const resetPasswords = async () => {
  const defaultPassword = 'password123';
  
  try {
    const connection = await mysqlPool.getConnection();
    
    // Paso 1: Obtener todos los usuarios
    const [users] = await connection.query('SELECT id, email FROM users');
    
    console.log(`Found ${users.length} users to update`);
    
    // Paso 2: Generar hash para la contraseña
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    console.log(`Generated new hash for password: ${defaultPassword}`);
    
    // Paso 3: Para cada usuario, actualizar o insertar credenciales
    for (const user of users) {
      // Verificar si ya tiene credenciales
      const [existingCredentials] = await connection.query(
        'SELECT id FROM auth_credentials WHERE user_id = ?',
        [user.id]
      );
      
      if (existingCredentials.length > 0) {
        // Actualizar credenciales existentes
        await connection.query(
          'UPDATE auth_credentials SET password = ? WHERE user_id = ?',
          [hashedPassword, user.id]
        );
        console.log(`Updated password for user ${user.email} (ID: ${user.id})`);
      } else {
        // Insertar nuevas credenciales
        await connection.query(
          'INSERT INTO auth_credentials (user_id, password) VALUES (?, ?)',
          [user.id, hashedPassword]
        );
        console.log(`Created new credentials for user ${user.email} (ID: ${user.id})`);
      }
    }
    
    connection.release();
    console.log('All passwords have been reset successfully');
    console.log(`New password for all users: ${defaultPassword}`);
  } catch (error) {
    console.error('Error resetting passwords:', error);
  } finally {
    // Cerrar la conexión al pool
    await mysqlPool.end();
  }
};

// Ejecutar la función
resetPasswords()
  .then(() => console.log('Password reset script completed'))
  .catch(err => console.error('Error running password reset script:', err));