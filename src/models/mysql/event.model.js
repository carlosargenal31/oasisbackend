// src/models/mysql/event.model.js
import { mysqlPool } from '../../config/database.js';

export const createEventTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_name VARCHAR(255) NOT NULL,
      event_date DATE NOT NULL,
      event_time TIME NOT NULL,
      price DECIMAL(10, 2) DEFAULT 0.00,
      location VARCHAR(255) NOT NULL,
      description TEXT,
      event_type VARCHAR(100) NOT NULL,
      status ENUM('activo', 'cancelado', 'pospuesto', 'completado') DEFAULT 'activo',
      created_by INT NOT NULL,
      image_url VARCHAR(255),
      is_featured BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `;
  
  try {
    const connection = await mysqlPool.getConnection();
    await connection.query(query);
    connection.release();
    console.log('Events table created successfully');
  } catch (error) {
    console.error('Error creating events table:', error);
    throw error;
  }
};
export class Event {
  // Encontrar evento por ID
  static async findById(id) {
    if (!id) {
      throw new Error('ID de evento es requerido');
    }

    try {
      const connection = await mysqlPool.getConnection();
      
      const [events] = await connection.query(`
        SELECT e.*, u.first_name, u.last_name, u.profile_image 
        FROM events e
        JOIN users u ON e.created_by = u.id
        WHERE e.id = ?
      `, [id]);
      
      connection.release();
      
      if (events.length === 0) {
        return null;
      }
      
      return events[0];
    } catch (error) {
      console.error('Error finding event by ID:', error);
      throw error;
    }
  }
  
  // Obtener todos los eventos con opciones de filtro
  static async findAll(filters = {}) {
  try {
    const connection = await mysqlPool.getConnection();
    
    let query = `
      SELECT e.*, u.first_name, u.last_name, u.profile_image 
      FROM events e
      JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Si NO estamos en el panel de admin (indicado por un flag en filters)
    // filtramos para mostrar solo eventos activos
    if (!filters.isAdminPanel) {
      query += ' AND e.status = "activo"';
    }
    
    // Filtrar por tipo de evento
    if (filters.event_type) {
      query += ' AND e.event_type = ?';
      params.push(filters.event_type);
    }
    
    // Filtrar por creador
    if (filters.created_by) {
      query += ' AND e.created_by = ?';
      params.push(filters.created_by);
    }
    
    // Filtrar por is_featured
    if (filters.featured !== undefined) {
      query += ' AND e.is_featured = ?';
      params.push(filters.featured ? 1 : 0);
    }
    
    // Filtrar por is_home
    if (filters.home !== undefined) {
      query += ' AND e.is_home = ?';
      params.push(filters.home ? 1 : 0);
    }
    
    // Filtrar por status (uno o múltiples separados por coma)
    if (filters.status) {
      const statuses = filters.status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        query += ' AND e.status = ?';
        params.push(statuses[0]);
      } else {
        // Para múltiples estados, usar IN
        const placeholders = statuses.map(() => '?').join(',');
        query += ` AND e.status IN (${placeholders})`;
        params.push(...statuses);
      }
    }
    
    // Filtrar por fecha desde
    if (filters.date_from) {
      query += ' AND e.event_date >= ?';
      params.push(filters.date_from);
    }
    
    // Filtrar por fecha hasta
    if (filters.date_to) {
      query += ' AND e.event_date <= ?';
      params.push(filters.date_to);
    }
    
    // Filtrar por eventos futuros (desde hoy)
    if (filters.upcoming) {
      query += ' AND e.event_date >= CURDATE()';
    }
    
    // Filtrar por eventos pasados
    if (filters.past) {
      query += ' AND e.event_date < CURDATE()';
    }
    
    // Filtrar por precio exacto (para eventos gratuitos)
    if (filters.price !== undefined) {
      query += ' AND e.price = ?';
      params.push(filters.price);
    }
    
    // Filtrar por precio máximo
    if (filters.price_max !== undefined) {
      query += ' AND e.price <= ?';
      params.push(filters.price_max);
    }
    
    // Búsqueda por término
    if (filters.search) {
      query += ' AND (e.event_name LIKE ? OR e.description LIKE ? OR e.location LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Ordenamiento - SIN prioridad a destacados
    let orderClause = '';
    
    // Verificar si hay parámetros de ordenación específicos
    if (filters.sort_by) {
      // Añadir ordenamiento específico
      orderClause = ` ORDER BY e.${filters.sort_by} ${filters.sort_order || 'ASC'}`;
    } else {
      // Ordenamiento por defecto por fecha del evento
      orderClause = ' ORDER BY e.event_date ASC';
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
    
    console.log('Query final:', query);  // Debug log
    console.log('Params:', params);      // Debug log
    
    const [events] = await connection.query(query, params);
    
    connection.release();
    return events;
  } catch (error) {
    console.error('Error finding all events:', error);
    throw error;
  }
}

// Modificar también las funciones para eventos destacados y eventos de inicio
static async getFeatured(limit = 3) {
  try {
    const connection = await mysqlPool.getConnection();
    
    // Convertir limit a número para evitar el error de sintaxis SQL
    const limitValue = parseInt(limit);
    
    const [events] = await connection.query(`
      SELECT e.*, u.first_name, u.last_name, u.profile_image 
      FROM events e
      JOIN users u ON e.created_by = u.id
      WHERE e.is_featured = 1 AND e.event_date >= CURDATE() AND e.status = 'activo'
      ORDER BY e.event_date ASC
      LIMIT ?
    `, [limitValue]);
    
    connection.release();
    return events;
  } catch (error) {
    console.error('Error finding featured events:', error);
    throw error;
  }
}

static async getHomeEvents(limit = 6) {
  try {
    const connection = await mysqlPool.getConnection();
    
    // Convertir limit a número para evitar el error de sintaxis SQL
    const limitValue = parseInt(limit);
    
    const [events] = await connection.query(`
      SELECT e.*, u.first_name, u.last_name, u.profile_image 
      FROM events e
      JOIN users u ON e.created_by = u.id
      WHERE e.is_home = 1 AND e.event_date >= CURDATE() AND e.status = 'activo'
      ORDER BY e.event_date ASC
      LIMIT ?
    `, [limitValue]);
    
    connection.release();
    return events;
  } catch (error) {
    console.error('Error finding home events:', error);
    throw error;
  }
}
  
  // Obtener tipos de evento
  static async getEventTypes() {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [types] = await connection.query(`
        SELECT DISTINCT event_type FROM events ORDER BY event_type
      `);
      
      connection.release();
      return types.map(type => type.event_type);
    } catch (error) {
      console.error('Error getting event types:', error);
      throw error;
    }
  }
  
  // Contar eventos por filtros
  static async count(filters = {}) {
    try {
      const connection = await mysqlPool.getConnection();
      
      let query = 'SELECT COUNT(*) as count FROM events WHERE 1=1';
      const params = [];
      
      // Filtrar por tipo de evento
      if (filters.event_type) {
        query += ' AND event_type = ?';
        params.push(filters.event_type);
      }
      
      // Filtrar por creador
      if (filters.created_by) {
        query += ' AND created_by = ?';
        params.push(filters.created_by);
      }
      
      // Filtrar por is_featured
      if (filters.featured !== undefined) {
        query += ' AND is_featured = ?';
        params.push(filters.featured ? 1 : 0);
      }
      
      // Filtrar por is_home
      if (filters.home !== undefined) {
        query += ' AND is_home = ?';
        params.push(filters.home ? 1 : 0);
      }
      
      // Filtrar por status
      if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }
      
      // Filtrar por fecha desde
      if (filters.date_from) {
        query += ' AND event_date >= ?';
        params.push(filters.date_from);
      }
      
      // Filtrar por fecha hasta
      if (filters.date_to) {
        query += ' AND event_date <= ?';
        params.push(filters.date_to);
      }
      
      // Filtrar por eventos futuros (desde hoy)
      if (filters.upcoming) {
        query += ' AND event_date >= CURDATE()';
      }
      
      // Filtrar por eventos pasados
      if (filters.past) {
        query += ' AND event_date < CURDATE()';
      }
      
      // Búsqueda por término
      if (filters.search) {
        query += ' AND (event_name LIKE ? OR description LIKE ? OR location LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }
      
      const [result] = await connection.query(query, params);
      
      connection.release();
      return result[0].count;
    } catch (error) {
      console.error('Error counting events:', error);
      throw error;
    }
  }
  
  // En event.model.js - método create
static async create(eventData) {
  try {
    const connection = await mysqlPool.getConnection();
    
    // Asegurarse de que event_time tiene el formato correcto
    let eventTime = eventData.event_time;
    if (eventTime && eventTime.split(':').length === 2) {
      eventTime = `${eventTime}:00`;
    }
    
    console.log('Insertando evento en la BD con datos:', {
      event_name: eventData.event_name,
      event_date: eventData.event_date,
      event_time: eventTime,
      price: eventData.price || 0.00,
      location: eventData.location,
      description: eventData.description,
      event_type: eventData.event_type,
      status: eventData.status || 'activo',
      created_by: eventData.created_by,
      is_featured: eventData.is_featured ? 1 : 0
    });
    
    // MODIFICADO: Quitar is_home del query si no existe en la tabla
    const [result] = await connection.query(`
      INSERT INTO events (
        event_name, event_date, event_time, price, location, 
        description, event_type, status, created_by, 
        image_url, is_featured
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      eventData.event_name,
      eventData.event_date,
      eventTime, // Usar la variable formateada
      eventData.price || 0.00,
      eventData.location,
      eventData.description || '',
      eventData.event_type,
      eventData.status || 'activo',
      eventData.created_by,
      eventData.image_url || null,
      eventData.is_featured ? 1 : 0
    ]);
    
    connection.release();
    console.log(`Evento creado con ID: ${result.insertId}`);
    return result.insertId;
  } catch (error) {
    console.error('Error detallado al crear evento en BD:', error);
    throw error;
  }
}

// En event.model.js - método update
static async update(id, eventData) {
  try {
    const connection = await mysqlPool.getConnection();
    
    // Eliminar campos que no deberían actualizarse
    const cleanedData = { ...eventData };
    
    // Nunca actualizar estos campos
    delete cleanedData.id;
    delete cleanedData.created_by;
    delete cleanedData.created_at;
    delete cleanedData.updated_at;
    
    // Formatear event_time si es necesario
    if (cleanedData.event_time && cleanedData.event_time.split(':').length === 2) {
      cleanedData.event_time = `${cleanedData.event_time}:00`;
    }
    
    // Construir consulta dinámica
    const updateFields = [];
    const updateValues = [];
    
    Object.entries(cleanedData).forEach(([key, value]) => {
      if (value !== undefined) {
        // Convertir booleanos a 1/0 para MySQL
        if (key === 'is_featured') {
          updateFields.push(`${key} = ?`);
          updateValues.push(value === true || value === 'true' ? 1 : 0);
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
    
    console.log('Query de actualización:', `UPDATE events SET ${updateFields.join(', ')} WHERE id = ?`);
    console.log('Valores:', updateValues);
    
    const [result] = await connection.query(
      `UPDATE events SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    connection.release();
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}
  
  // Eliminar un evento
  static async delete(id) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'DELETE FROM events WHERE id = ?',
        [id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }
  
  // Actualizar el estado destacado de un evento
  static async updateFeaturedStatus(id, isFeatured) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'UPDATE events SET is_featured = ? WHERE id = ?',
        [isFeatured ? 1 : 0, id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating featured status:', error);
      throw error;
    }
  }
  
  // Actualizar el estado de visibilidad en inicio
  static async updateHomeStatus(id, isHome) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'UPDATE events SET is_home = ? WHERE id = ?',
        [isHome ? 1 : 0, id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating home status:', error);
      throw error;
    }
  }
  
  // Actualizar el estado del evento
  static async updateStatus(id, status) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [result] = await connection.query(
        'UPDATE events SET status = ? WHERE id = ?',
        [status, id]
      );
      
      connection.release();
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error updating event status:', error);
      throw error;
    }
  }
  
  // Obtener próximos eventos
  static async getUpcomingEvents(limit = 6) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [events] = await connection.query(`
        SELECT e.*, u.first_name, u.last_name, u.profile_image 
        FROM events e
        JOIN users u ON e.created_by = u.id
        WHERE e.event_date >= CURDATE() AND e.status = 'activo'
        ORDER BY e.event_date ASC, e.event_time ASC
        LIMIT ?
      `, [parseInt(limit)]);
      
      connection.release();
      return events;
    } catch (error) {
      console.error('Error getting upcoming events:', error);
      throw error;
    }
  }
  
  // Obtener eventos por organizador
  static async getEventsByCreator(creatorId, limit = 10) {
    try {
      const connection = await mysqlPool.getConnection();
      
      const [events] = await connection.query(`
        SELECT e.*, u.first_name, u.last_name, u.profile_image 
        FROM events e
        JOIN users u ON e.created_by = u.id
        WHERE e.created_by = ?
        ORDER BY e.event_date DESC
        LIMIT ?
      `, [creatorId, parseInt(limit)]);
      
      connection.release();
      return events;
    } catch (error) {
      console.error('Error getting events by creator:', error);
      throw error;
    }
  }
}