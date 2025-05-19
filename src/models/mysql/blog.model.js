// src/models/mysql/blog.model.js
import { mysqlPool } from '../../config/database.js';

// Modificar la función createBlogTable para incluir active
export const createBlogTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS blogs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      author_id INT NOT NULL,
      published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      image_url VARCHAR(255),
      content TEXT,
      is_featured BOOLEAN DEFAULT FALSE,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id)
    )
  `;
  
  try {
    const connection = await mysqlPool.getConnection();
    await connection.query(query);
    connection.release();
    console.log('Blogs table created successfully');
  } catch (error) {
    console.error('Error creating blogs table:', error);
    throw error;
  }
};

// Clase Blog para manejar operaciones relacionadas con blogs
export class Blog {
  // Encontrar blog por ID
  static async findById(id) {
    if (!id) {
      throw new Error('ID de blog es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      const [blogs] = await connection.query(`
        SELECT b.*, u.first_name, u.last_name, u.profile_image 
        FROM blogs b
        JOIN users u ON b.author_id = u.id
        WHERE b.id = ?
      `, [id]);
      
      connection.release();
      
      if (blogs.length === 0) {
        return null;
      }
      
      return blogs[0];
    } catch (error) {
      console.error('Error finding blog by ID:', error);
      throw error;
    }
  }
  
  static async findAll(filters = {}) {
  try {
    const connection = await mysqlPool.getConnection();
    
    let query = `
      SELECT b.*, u.first_name, u.last_name, u.profile_image 
      FROM blogs b
      JOIN users u ON b.author_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filtrar por categoría
    if (filters.category) {
      query += ' AND b.category = ?';
      params.push(filters.category);
    }
    
    // Filtrar por autor
    if (filters.author_id) {
      query += ' AND b.author_id = ?';
      params.push(filters.author_id);
    }
    
    // Filtrar por is_featured
    if (filters.featured !== undefined) {
      query += ' AND b.is_featured = ?';
      params.push(filters.featured ? 1 : 0);
    }
    
    // Filtrar por active (estado activo/inactivo)
    if (filters.active !== undefined) {
      query += ' AND b.active = ?';
      params.push(filters.active ? 1 : 0);
    }
    // IMPORTANTE: Ya no añadimos el filtro por defecto para active=1 para que el admin pueda ver todos
    
    // Búsqueda por término
    if (filters.search) {
      query += ' AND (b.title LIKE ? OR b.content LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    // Ordenamiento
    let orderClause = ' ORDER BY b.is_featured DESC';
    
    // Verificar si hay parámetros de ordenación específicos
    if (filters.sort_by) {
      // Añadir ordenamiento específico
      orderClause += `, b.${filters.sort_by} ${filters.sort_order || 'DESC'}`;
    } else {
      // Ordenamiento por defecto por fecha de publicación descendente
      orderClause += ', b.published_at DESC';
    }
    
    query += orderClause;
    
    // Paginación
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(parseInt(filters.limit));
      
      if (filters.offset || filters.offset === 0) {
        query += ' OFFSET ?';
        params.push(parseInt(filters.offset));
      }
    }
    
    const [blogs] = await connection.query(query, params);
    
    connection.release();
    return blogs;
  } catch (error) {
    console.error('Error finding all blogs:', error);
    throw error;
  }
}
  // Obtener blogs destacados
  // Corregir la función getFeatured en src/models/mysql/blog.model.js
static async getFeatured(limit = 2) {
  try {
    const connection = await mysqlPool.getConnection();
    
    // Convertir limit a número para evitar el error de sintaxis SQL
    const limitValue = parseInt(limit);
    
    const [blogs] = await connection.query(`
      SELECT b.*, u.first_name, u.last_name, u.profile_image 
      FROM blogs b
      JOIN users u ON b.author_id = u.id
      WHERE b.is_featured = 1
      AND b.active = 1
      ORDER BY b.published_at DESC
      LIMIT ?
    `, [limitValue]);
    
    connection.release();
    return blogs;
  } catch (error) {
    console.error('Error finding featured blogs:', error);
    throw error;
  }
}
  
  // Obtener categorías de blog
  static async getCategories() {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [categories] = await connection.query(`
        SELECT DISTINCT category FROM blogs ORDER BY category
      `);
      
      connection.release();
      return categories.map(cat => cat.category);
    } catch (error) {
      console.error('Error getting blog categories:', error);
      throw error;
    }
  }
  
  // Contar blogs por filtros
  static async count(filters = {}) {
    try {
      const connection = await mysqlPool.getConnection();
      
      let query = 'SELECT COUNT(*) as count FROM blogs WHERE 1=1';
      const params = [];
      
      // Filtrar por categoría
      if (filters.category) {
        query += ' AND category = ?';
        params.push(filters.category);
      }
      
      // Filtrar por autor
      if (filters.author_id) {
        query += ' AND author_id = ?';
        params.push(filters.author_id);
      }
      
      // Filtrar por is_featured
      if (filters.featured !== undefined) {
        query += ' AND is_featured = ?';
        params.push(filters.featured ? 1 : 0);
      }
      
      // Búsqueda por término
      if (filters.search) {
        query += ' AND (title LIKE ? OR content LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm);
      }
      
      const [result] = await connection.query(query, params);
      
      connection.release();
      return result[0].count;
    } catch (error) {
      console.error('Error counting blogs:', error);
      throw error;
    }
  }
  
  // Modificar el método create para incluir active
static async create(blogData) {
  try {
    const connection = await mysqlPool.getConnection();
    
    const [result] = await connection.query(`
      INSERT INTO blogs (title, category, author_id, image_url, content, is_featured, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      blogData.title,
      blogData.category,
      blogData.author_id,
      blogData.image_url || null,
      blogData.content,
      blogData.is_featured ? 1 : 0,
      blogData.active !== undefined ? (blogData.active ? 1 : 0) : 1
    ]);
    
    connection.release();
    return result.insertId;
  } catch (error) {
    console.error('Error creating blog:', error);
    throw error;
  }
}
  
  // Actualizar un blog
  static async update(id, blogData) {
    try {
      const connection = await mysqlPool.getConnection();
      
      // Construir consulta dinámica
      const updateFields = [];
      const updateValues = [];
      
      Object.entries(blogData).forEach(([key, value]) => {
        if (value !== undefined && 
            key !== 'id' && 
            key !== 'created_at' && 
            key !== 'updated_at' &&
            key !== 'published_at') {
          
          // Convertir booleano is_featured a 1/0 para MySQL
          if (key === 'is_featured') {
            updateFields.push(`${key} = ?`);
            updateValues.push(value ? 1 : 0);
          } else {
            updateFields.push(`${key} = ?`);
            updateValues.push(value);
          }
        }
      });
      
      if (updateFields.length === 0) {
        connection.release();
        return false; // No hay campos para actualizar
      }
      
      updateValues.push(id); // Agregar ID al final para WHERE
      
      const [result] = await connection.query(
        `UPDATE blogs SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating blog:', error);
      throw error;
    }
  }
  
  // Añadir al final de la clase Blog
static async updateActiveStatus(id, isActive) {
  try {
    const connection = await mysqlPool.getConnection();
    
    const [result] = await connection.query(
      'UPDATE blogs SET active = ? WHERE id = ?',
      [isActive ? 1 : 0, id]
    );
    
    connection.release();
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error updating active status:', error);
    throw error;
  }
}
  // Eliminar un blog
  static async delete(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'DELETE FROM blogs WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting blog:', error);
      throw error;
    }
  }
  
  // Actualizar el estado destacado de un blog
  static async updateFeaturedStatus(id, isFeatured) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'UPDATE blogs SET is_featured = ? WHERE id = ?',
        [isFeatured ? 1 : 0, id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating featured status:', error);
      throw error;
    }
  }
}