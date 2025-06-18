/**
 * Booking Service
 * Manages booking operations for the OASIS application
 */
import { mysqlPool } from '../config/database.js';
import { ValidationError, NotFoundError, ConflictError, DatabaseError, AuthorizationError } from '../utils/errors/index.js';
import logger from '../utils/logger.js';

class BookingService {
  /**
   * Create a new booking
   * @param {Object} bookingData - Booking data from frontend
   * @param {string} userId - User ID making the booking (can be null for guest bookings)
   * @returns {Promise<Object>} - The created booking
   */
  async create(bookingData, userId = null) {
    try {
      console.log('Creating booking with userId:', userId);
      
      // Validate required fields
      if (!bookingData.propertyId || !bookingData.startDate || !bookingData.endDate) {
        throw new ValidationError('Property ID, start date, and end date are required');
      }

      // Para reservas de invitados (sin userId), validar información del huésped
      if (!userId && (!bookingData.guestName || !bookingData.guestEmail)) {
        throw new ValidationError('Guest name and email are required for guest bookings');
      }

      // Parse dates
      const startDate = new Date(bookingData.startDate);
      const endDate = new Date(bookingData.endDate);

      // Validate date range
      if (startDate >= endDate) {
        throw new ValidationError('End date must be after start date');
      }

      // Check if property exists
      const [propertyRows] = await mysqlPool.query(
        'SELECT * FROM properties WHERE id = ?',
        [bookingData.propertyId]
      );
      
      if (propertyRows.length === 0) {
        throw new NotFoundError('Property not found');
      }
      
      const property = propertyRows[0];

      // Usamos userId si está disponible
      const finalUserId = userId;
      console.log('Final userId to be used:', finalUserId);

      // Comprobar disponibilidad
      const isAvailable = await this.checkAvailability(
        bookingData.propertyId,
        startDate,
        endDate
      );

      if (!isAvailable) {
        throw new ConflictError('Property is not available for the selected dates');
      }

      // Calculate price
      const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const months = Math.ceil(nights / 30);
      const totalPrice = bookingData.totalPrice || (property.pricePerNight ? property.pricePerNight * nights : property.price * months);

      // Start transaction
      const connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      try {
        // Registramos lo que vamos a insertar
        console.log('Inserting booking with data:', {
          propertyId: bookingData.propertyId,
          userId: finalUserId,
          guestName: bookingData.guestName,
          email: bookingData.guestEmail,
          dates: `${startDate} to ${endDate}`
        });
        
        // Si finalUserId es null, no incluimos user_id en la consulta SQL
        let insertQuery;
        let insertParams;
        
        if (finalUserId) {
          // Consulta con user_id
          insertQuery = `
            INSERT INTO bookings 
            (property_id, user_id, guest_name, guest_email, guest_phone, check_in_date, check_out_date, 
            guests, total_price, special_requests, status, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;
          insertParams = [
            bookingData.propertyId,
            finalUserId,
            bookingData.guestName,
            bookingData.guestEmail,
            bookingData.guestPhone || null,
            startDate,
            endDate,
            bookingData.guests || 1,
            totalPrice,
            bookingData.specialRequests || null,
            'pending'
          ];
        } else {
          // Consulta sin user_id para permitir que sea NULL en la BD
          insertQuery = `
            INSERT INTO bookings 
            (property_id, guest_name, guest_email, guest_phone, check_in_date, check_out_date, 
            guests, total_price, special_requests, status, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;
          insertParams = [
            bookingData.propertyId,
            bookingData.guestName,
            bookingData.guestEmail,
            bookingData.guestPhone || null,
            startDate,
            endDate,
            bookingData.guests || 1,
            totalPrice,
            bookingData.specialRequests || null,
            'pending'
          ];
        }
        
        const [result] = await connection.query(insertQuery, insertParams);

        const bookingId = result.insertId;
        console.log('Booking created with ID:', bookingId);

        // Create initial payment record if needed
        // Este bloque es opcional dependiendo si manejas pagos separados
        const [paymentResult] = await connection.query(
          `INSERT INTO payments
           (booking_id, amount, currency, payment_method, status, payment_date)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            bookingId,
            totalPrice,
            'HNL',
            bookingData.paymentMethod || 'credit_card',
            'pending'
          ]
        );

        const paymentId = paymentResult.insertId;

        // Commit transaction
        await connection.commit();
        connection.release();

        return {
          id: bookingId,
          propertyId: bookingData.propertyId,
          userId: finalUserId,
          guestName: bookingData.guestName,
          guestEmail: bookingData.guestEmail,
          checkInDate: startDate,
          checkOutDate: endDate,
          totalPrice,
          status: 'pending',
          paymentId
        };
      } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Database error in booking creation:', error);
        throw error;
      }
    } catch (error) {
      console.error('Failed to create booking:', error);
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError ||
          error instanceof ConflictError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to create booking: ' + error.message);
    }
  }

  /**
   * Find booking by ID with improved error handling
   * @param {string} id - Booking ID
   * @returns {Promise<Object>} - The booking with related property and user data
   */
  async findById(id) {
    try {
      console.log(`Buscando reserva con ID: ${id}`);
      
      // Validar ID
      if (!id || isNaN(parseInt(id))) {
        throw new NotFoundError(`ID de reserva inválido: ${id}`);
      }
      
      // Buscar la reserva en la base de datos
      let [bookingRows] = await mysqlPool.query(
        'SELECT * FROM bookings WHERE id = ?',
        [id]
      );
      
      if (bookingRows.length === 0) {
        throw new NotFoundError(`Reserva #${id} no encontrada`);
      }
      
      const booking = bookingRows[0];

      // Get related property if available
      let property = null;
      if (booking.property_id) {
        const [propertyRows] = await mysqlPool.query(
          'SELECT * FROM properties WHERE id = ?',
          [booking.property_id]
        );
        
        property = propertyRows.length > 0 ? propertyRows[0] : null;
      }

      // Get user (guest) data if available
      let user = null;
      if (booking.user_id) {
        const [userRows] = await mysqlPool.query(
          'SELECT id, first_name, last_name, email, phone, profile_image FROM users WHERE id = ?',
          [booking.user_id]
        );
        
        user = userRows.length > 0 ? userRows[0] : null;
      }

      // Format dates for better readability
      booking.check_in_date = booking.check_in_date ? new Date(booking.check_in_date) : null;
      booking.check_out_date = booking.check_out_date ? new Date(booking.check_out_date) : null;
      booking.created_at = booking.created_at ? new Date(booking.created_at) : null;
      
      if (booking.updated_at) {
        booking.updated_at = new Date(booking.updated_at);
      }

      // Combine all data
      return {
        ...booking,
        property,
        user
      };
    } catch (error) {
      console.error(`Error al buscar reserva #${id}:`, error);
      
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError(`Error al recuperar la reserva #${id}: ${error.message}`);
    }
  }

  /**
   * Find bookings with filters
   * @param {Object} filters - Filter options
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} - Object with bookings array and total count
   */
  /**
 * Find bookings with filters - CORREGIDO para distinguir compras vs alquileres
 */
async find(filters = {}, pagination = { page: 1, limit: 10 }) {
  try {
    console.log('Finding bookings with filters:', filters);
    console.log('Pagination:', pagination);
    
    // Build query parts
    let queryParts = ['SELECT b.*'];
    let joinParts = ['FROM bookings b LEFT JOIN properties p ON b.property_id = p.id'];
    let whereParts = ['WHERE 1=1'];
    const queryParams = [];
    let countQueryParts = ['SELECT COUNT(*) as total'];
    let countJoinParts = ['FROM bookings b LEFT JOIN properties p ON b.property_id = p.id'];
    let countWhereParts = ['WHERE 1=1'];
    const countParams = [];

    // Apply filters
    if (filters.userId) {
      whereParts.push('AND b.user_id = ?');
      queryParams.push(filters.userId);
      
      countWhereParts.push('AND b.user_id = ?');
      countParams.push(filters.userId);
    }

    if (filters.propertyId) {
      whereParts.push('AND b.property_id = ?');
      queryParams.push(filters.propertyId);
      
      countWhereParts.push('AND b.property_id = ?');
      countParams.push(filters.propertyId);
    }

    // NUEVO: Filtrar por tipo de transacción (compra vs alquiler)
    if (filters.is_purchase === true) {
      // Solo propiedades en venta (compras)
      whereParts.push('AND (p.status = "for-sale" OR p.status = "sold")');
      countWhereParts.push('AND (p.status = "for-sale" OR p.status = "sold")');
    } else if (filters.is_purchase === false) {
      // Solo propiedades en alquiler
      whereParts.push('AND (p.status = "for-rent" OR p.status = "rented")');
      countWhereParts.push('AND (p.status = "for-rent" OR p.status = "rented")');
    }

    // Status filters - CORREGIDOS para compras
    if (filters.status && filters.status.length > 0) {
      whereParts.push(`AND b.status IN (${filters.status.map(() => '?').join(',')})`);
      queryParams.push(...filters.status);
      
      countWhereParts.push(`AND b.status IN (${filters.status.map(() => '?').join(',')})`);
      countParams.push(...filters.status);
    }

    // Upcoming bookings filter (future check-in date)
    if (filters.upcoming) {
      whereParts.push('AND b.check_in_date >= CURDATE()');
      countWhereParts.push('AND b.check_in_date >= CURDATE()');
    }

    // Past bookings filter (past check-out date)
    if (filters.past) {
      whereParts.push('AND b.check_out_date < CURDATE()');
      countWhereParts.push('AND b.check_out_date < CURDATE()');
    }

    // Filter by check-in date range
    if (filters.startDate) {
      whereParts.push('AND b.check_in_date >= ?');
      queryParams.push(filters.startDate);
      
      countWhereParts.push('AND b.check_in_date >= ?');
      countParams.push(filters.startDate);
    }

    if (filters.endDate) {
      whereParts.push('AND b.check_out_date <= ?');
      queryParams.push(filters.endDate);
      
      countWhereParts.push('AND b.check_out_date <= ?');
      countParams.push(filters.endDate);
    }

    // Filter out soft-deleted bookings
    whereParts.push('AND b.deleted_at IS NULL');
    countWhereParts.push('AND b.deleted_at IS NULL');

    // Add order by clause
    const orderParts = ['ORDER BY b.created_at DESC'];

    // Add pagination
    const limitParts = [];
    const offset = (pagination.page - 1) * pagination.limit;
    limitParts.push('LIMIT ? OFFSET ?');
    queryParams.push(parseInt(pagination.limit), offset);

    // Build final queries
    const bookingsQuery = [...queryParts, ...joinParts, ...whereParts, ...orderParts, ...limitParts].join(' ');
    const countQuery = [...countQueryParts, ...countJoinParts, ...countWhereParts].join(' ');

    console.log('Executing booking query:', bookingsQuery);
    console.log('With params:', queryParams);

    // Execute count query first to get total
    const [countResult] = await mysqlPool.query(countQuery, countParams);
    const total = countResult[0].total;

    // Execute bookings query
    const [bookingRows] = await mysqlPool.query(bookingsQuery, queryParams);

    // Get properties for all bookings in a single query for better performance
    const propertyIds = [...new Set(bookingRows.map(b => b.property_id))];
    let properties = [];
    
    if (propertyIds.length > 0) {
      const [propertyRows] = await mysqlPool.query(
        `SELECT * FROM properties WHERE id IN (${propertyIds.map(() => '?').join(',')})`,
        propertyIds
      );
      properties = propertyRows;
    }

    // Get users for all bookings in a single query
    const userIds = [...new Set(bookingRows.filter(b => b.user_id).map(b => b.user_id))];
    let users = [];
    
    if (userIds.length > 0) {
      const [userRows] = await mysqlPool.query(
        `SELECT id, first_name, last_name, email, phone, profile_image FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
        userIds
      );
      users = userRows;
    }

    // Get payment status for each booking - NUEVO
    const bookingIds = bookingRows.map(b => b.id);
    let payments = [];
    
    if (bookingIds.length > 0) {
      const [paymentRows] = await mysqlPool.query(
        `SELECT booking_id, status as payment_status, payment_method, amount, payment_date 
         FROM payments WHERE booking_id IN (${bookingIds.map(() => '?').join(',')})`,
        bookingIds
      );
      payments = paymentRows;
    }

    // Map properties, users, and payments to bookings
    const bookings = bookingRows.map(booking => {
      // Find matching property
      const property = properties.find(p => p.id === booking.property_id) || null;
      
      // Find matching user
      const user = users.find(u => u.id === booking.user_id) || null;

      // Find matching payment - NUEVO
      const payment = payments.find(p => p.booking_id === booking.id) || null;

      // Format dates
      const formattedBooking = {
        ...booking,
        check_in_date: booking.check_in_date ? new Date(booking.check_in_date) : null,
        check_out_date: booking.check_out_date ? new Date(booking.check_out_date) : null,
        created_at: booking.created_at ? new Date(booking.created_at) : null,
        updated_at: booking.updated_at ? new Date(booking.updated_at) : null
      };

      // Add payment information - NUEVO
      if (payment) {
        formattedBooking.payment_status = payment.payment_status;
        formattedBooking.payment_method = payment.payment_method;
        formattedBooking.payment_date = payment.payment_date;
        formattedBooking.payment_amount = payment.amount;
      }

      return {
        ...formattedBooking,
        property,
        user
      };
    });

    return {
      bookings,
      total
    };
  } catch (error) {
    console.error('Failed to find bookings:', error);
    throw new DatabaseError('Failed to retrieve bookings: ' + error.message);
  }
}

  // Añadir estos métodos al BookingService existente

/**
 * Obtener propiedades con reservas/pagos pendientes de confirmación para un host
 * @param {number} hostId - ID del anfitrión
 * @returns {Promise<Object>} - Propiedades con reservas pendientes
 */
async getPendingConfirmationsByHost(hostId) {
  try {
    console.log(`Buscando confirmaciones pendientes para host ${hostId}`);
    
    // Obtener propiedades del host con reservas que tienen pagos pendientes
    const [propertiesWithPending] = await mysqlPool.query(
      `SELECT DISTINCT
         p.id as property_id,
         p.title as property_title,
         p.address as property_address,
         p.image as property_image,
         p.price as property_price,
         p.status as property_status,
         COUNT(b.id) as pending_count
       FROM properties p
       INNER JOIN bookings b ON p.id = b.property_id
       INNER JOIN payments pay ON b.id = pay.booking_id
       WHERE p.host_id = ?
       AND pay.status = 'pending'
       AND b.deleted_at IS NULL
       GROUP BY p.id, p.title, p.address, p.image, p.price, p.status
       ORDER BY pending_count DESC, p.created_at DESC`,
      [hostId]
    );
    
    console.log(`Encontradas ${propertiesWithPending.length} propiedades con pagos pendientes`);
    
    // Para cada propiedad, obtener los detalles de las reservas pendientes
    const result = [];
    let totalPending = 0;
    
    for (const property of propertiesWithPending) {
      // Obtener reservas pendientes para esta propiedad
      const [pendingBookings] = await mysqlPool.query(
        `SELECT 
           b.id,
           b.guest_name,
           b.guest_email,
           b.guest_phone,
           b.check_in_date,
           b.check_out_date,
           b.guests,
           b.total_price,
           b.special_requests,
           b.created_at,
           pay.id as payment_id,
           pay.amount as payment_amount,
           pay.currency,
           pay.payment_method,
           pay.transaction_id,
           pay.payment_date
         FROM bookings b
         INNER JOIN payments pay ON b.id = pay.booking_id
         WHERE b.property_id = ?
         AND pay.status = 'pending'
         AND b.deleted_at IS NULL
         ORDER BY b.created_at ASC`,
        [property.property_id]
      );
      
      if (pendingBookings.length > 0) {
        result.push({
          property: {
            id: property.property_id,
            title: property.property_title,
            address: property.property_address,
            image: property.property_image,
            price: property.property_price,
            status: property.property_status
          },
          pendingBookings: pendingBookings.map(booking => ({
            ...booking,
            check_in_date: booking.check_in_date ? new Date(booking.check_in_date) : null,
            check_out_date: booking.check_out_date ? new Date(booking.check_out_date) : null,
            created_at: booking.created_at ? new Date(booking.created_at) : null,
            payment_date: booking.payment_date ? new Date(booking.payment_date) : null
          }))
        });
        
        totalPending += pendingBookings.length;
      }
    }
    
    console.log(`Total de reservas pendientes: ${totalPending}`);
    
    return {
      propertiesWithPending: result,
      totalPending
    };
  } catch (error) {
    console.error('Error obteniendo confirmaciones pendientes:', error);
    throw new DatabaseError('Error al obtener confirmaciones pendientes: ' + error.message);
  }
}

/**
 * Confirmar o rechazar el pago de una reserva
 * @param {number} bookingId - ID de la reserva
 * @param {string} action - 'confirm' o 'reject'
 * @param {number} userId - ID del usuario que confirma
 * @returns {Promise<Object>} - Resultado de la confirmación
 */
/**
 * Confirmar o rechazar el pago de una reserva
 * CORREGIDO para manejar estados correctos de propiedades
 */
async confirmBookingPayment(bookingId, action, userId) {
  try {
    console.log(`Procesando ${action} para reserva ${bookingId} por usuario ${userId}`);
    
    const connection = await mysqlPool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Verificar que la reserva existe y pertenece a una propiedad del usuario
      const [bookingData] = await connection.query(
        `SELECT b.*, p.host_id, p.status as property_status, p.title as property_title,
                pay.id as payment_id, pay.status as payment_status
         FROM bookings b
         INNER JOIN properties p ON b.property_id = p.id
         INNER JOIN payments pay ON b.id = pay.booking_id
         WHERE b.id = ? AND b.deleted_at IS NULL`,
        [bookingId]
      );
      
      if (bookingData.length === 0) {
        throw new NotFoundError('Reserva no encontrada');
      }
      
      const booking = bookingData[0];
      
      // Verificar autorización
      if (booking.host_id !== userId) {
        throw new AuthorizationError('No tienes permiso para confirmar esta reserva');
      }
      
      // Verificar que el pago esté pendiente
      if (booking.payment_status !== 'pending') {
        throw new ValidationError(`El pago ya está ${booking.payment_status}`);
      }
      
      if (action === 'confirm') {
        // Confirmar el pago
        await connection.query(
          'UPDATE payments SET status = "completed", updated_at = NOW() WHERE id = ?',
          [booking.payment_id]
        );
        
        // Confirmar la reserva
        await connection.query(
          'UPDATE bookings SET status = "confirmed", updated_at = NOW() WHERE id = ?',
          [bookingId]
        );
        
        // **ACTUALIZADO**: Manejar correctamente los estados de propiedad
        let newPropertyStatus = null;
        
        if (booking.property_status === 'for-sale') {
          newPropertyStatus = 'sold';
          console.log(`Marcando propiedad ${booking.property_id} como VENDIDA`);
        } else if (booking.property_status === 'for-rent') {
          newPropertyStatus = 'rented';
          console.log(`Marcando propiedad ${booking.property_id} como ALQUILADA`);
        }
        
        // Actualizar el estado de la propiedad si corresponde
        if (newPropertyStatus) {
          await connection.query(
            `UPDATE properties SET 
               status = ?, 
               updated_at = NOW() 
             WHERE id = ?`,
            [newPropertyStatus, booking.property_id]
          );
          
          console.log(`Propiedad ${booking.property_id} actualizada de ${booking.property_status} a ${newPropertyStatus}`);
        }
        
        console.log(`Pago ${booking.payment_id} confirmado para reserva ${bookingId}`);
        
      } else if (action === 'reject') {
        // Rechazar el pago
        await connection.query(
          'UPDATE payments SET status = "failed", updated_at = NOW() WHERE id = ?',
          [booking.payment_id]
        );
        
        // Cancelar la reserva
        await connection.query(
          'UPDATE bookings SET status = "cancelled", updated_at = NOW() WHERE id = ?',
          [bookingId]
        );
        
        console.log(`Pago ${booking.payment_id} rechazado para reserva ${bookingId}`);
      }
      
      await connection.commit();
      
      // Obtener datos actualizados
      const [updatedBooking] = await connection.query(
        `SELECT b.*, pay.status as payment_status, p.status as property_status
         FROM bookings b
         INNER JOIN payments pay ON b.id = pay.booking_id
         INNER JOIN properties p ON b.property_id = p.id
         WHERE b.id = ?`,
        [bookingId]
      );
      
      return {
        bookingId,
        action,
        newBookingStatus: updatedBooking[0].status,
        newPaymentStatus: updatedBooking[0].payment_status,
        newPropertyStatus: updatedBooking[0].property_status,
        processedAt: new Date()
      };
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Error confirmando pago de reserva:', error);
    
    if (error instanceof ValidationError || 
        error instanceof NotFoundError || 
        error instanceof AuthorizationError) {
      throw error;
    }
    
    throw new DatabaseError('Error al procesar la confirmación: ' + error.message);
  }
}
// Añadir estos métodos al BookingService existente

/**
 * Obtener propiedades con reservas confirmadas (vendidas/alquiladas) para un host
 * @param {number} hostId - ID del anfitrión
 * @returns {Promise<Object>} - Propiedades con reservas confirmadas
 */
async getConfirmedBookingsByHost(hostId) {
  try {
    console.log(`Buscando propiedades confirmadas para host ${hostId}`);
    
    // Obtener propiedades del host con reservas confirmadas
    const [propertiesWithConfirmed] = await mysqlPool.query(
      `SELECT DISTINCT
         p.id as property_id,
         p.title as property_title,
         p.address as property_address,
         p.image as property_image,
         p.price as property_price,
         p.status as property_status,
         p.property_type,
         p.square_feet,
         p.bedrooms,
         p.bathrooms,
         p.parkingSpaces,
         COUNT(CASE WHEN pay.status = 'completed' AND b.status = 'confirmed' THEN 1 END) as confirmed_count
       FROM properties p
       INNER JOIN bookings b ON p.id = b.property_id
       INNER JOIN payments pay ON b.id = pay.booking_id
       WHERE p.host_id = ?
       AND pay.status = 'completed'
       AND b.status = 'confirmed'
       AND b.deleted_at IS NULL
       GROUP BY p.id, p.title, p.address, p.image, p.price, p.status, p.property_type, p.square_feet, p.bedrooms, p.bathrooms, p.parkingSpaces
       HAVING confirmed_count > 0
       ORDER BY p.created_at DESC`,
      [hostId]
    );
    
    console.log(`Encontradas ${propertiesWithConfirmed.length} propiedades con reservas confirmadas`);
    
    const result = [];
    
    for (const property of propertiesWithConfirmed) {
      // Obtener reservas confirmadas para esta propiedad
      const [confirmedBookings] = await mysqlPool.query(
        `SELECT 
           b.id,
           b.guest_name,
           b.guest_email,
           b.guest_phone,
           b.check_in_date,
           b.check_out_date,
           b.guests,
           b.total_price,
           b.special_requests,
           b.created_at,
           pay.id as payment_id,
           pay.amount as payment_amount,
           pay.currency,
           pay.payment_method,
           pay.transaction_id,
           pay.payment_date
         FROM bookings b
         INNER JOIN payments pay ON b.id = pay.booking_id
         WHERE b.property_id = ?
         AND pay.status = 'completed'
         AND b.status = 'confirmed'
         AND b.deleted_at IS NULL
         ORDER BY b.check_in_date ASC`,
        [property.property_id]
      );
      
      // Determinar si es una venta o alquiler basado en el tipo de propiedad y duración
      const isForSale = this.determineIfSale(property, confirmedBookings);
      
      result.push({
        property: {
          id: property.property_id,
          title: property.property_title,
          address: property.property_address,
          image: property.property_image,
          price: property.property_price,
          status: property.property_status,
          property_type: property.property_type,
          square_feet: property.square_feet,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          parkingSpaces: property.parkingSpaces
        },
        confirmedBookings: confirmedBookings.map(booking => ({
          ...booking,
          check_in_date: booking.check_in_date ? new Date(booking.check_in_date) : null,
          check_out_date: booking.check_out_date ? new Date(booking.check_out_date) : null,
          created_at: booking.created_at ? new Date(booking.created_at) : null,
          payment_date: booking.payment_date ? new Date(booking.payment_date) : null
        })),
        isForSale,
        totalRevenue: confirmedBookings.reduce((sum, booking) => sum + parseFloat(booking.payment_amount || 0), 0)
      });
    }
    
    console.log(`Total de propiedades procesadas: ${result.length}`);
    
    return {
      propertiesWithConfirmed: result,
      totalConfirmed: result.reduce((sum, item) => sum + item.confirmedBookings.length, 0)
    };
  } catch (error) {
    console.error('Error obteniendo propiedades confirmadas:', error);
    throw new DatabaseError('Error al obtener propiedades confirmadas: ' + error.message);
  }
}

/**
 * Determinar si una propiedad con reservas confirmadas es una venta o alquiler
 * @param {Object} property - Datos de la propiedad
 * @param {Array} bookings - Array de reservas confirmadas
 * @returns {boolean} - True si es venta, false si es alquiler
 */
determineIfSale(property, bookings) {
  // Si la propiedad está marcada como "for-sale", es una venta
  if (property.property_status === 'for-sale') {
    return true;
  }
  
  // Si hay alguna reserva de larga duración (más de 11 meses), considerarla venta
  for (const booking of bookings) {
    const startDate = new Date(booking.check_in_date);
    const endDate = new Date(booking.check_out_date);
    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                      (endDate.getMonth() - startDate.getMonth());
    
    if (monthsDiff >= 11) {
      return true; // Consideramos que es una venta si el alquiler es mayor a 11 meses
    }
  }
  
  return false; // Es un alquiler regular
}

/**
 * Marcar una propiedad como vendida definitivamente
 * @param {number} propertyId - ID de la propiedad
 * @param {number} userId - ID del usuario
 * @param {Object} saleData - Datos de la venta
 * @returns {Promise<boolean>} - Resultado de la operación
 */
async markPropertyAsSold(propertyId, userId, saleData = {}) {
  try {
    const connection = await mysqlPool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Verificar que la propiedad existe y pertenece al usuario
      const [property] = await connection.query(
        'SELECT host_id, status FROM properties WHERE id = ?',
        [propertyId]
      );
      
      if (property.length === 0) {
        throw new NotFoundError('Propiedad no encontrada');
      }
      
      if (property[0].host_id !== userId) {
        throw new AuthorizationError('No tienes permiso para marcar esta propiedad como vendida');
      }
      
      // Actualizar el estado de la propiedad a vendida
      await connection.query(
        'UPDATE properties SET status = "sold", updated_at = NOW() WHERE id = ?',
        [propertyId]
      );
      
      // Registrar la venta en una tabla de historial
      await connection.query(
        `INSERT INTO property_sales_history 
         (property_id, previous_status, new_status, sale_date, sale_notes, marked_by, created_at)
         VALUES (?, ?, 'sold', NOW(), ?, ?, NOW())`,
        [
          propertyId,
          property[0].status,
          saleData.notes || 'Propiedad marcada como vendida',
          userId
        ]
      );
      
      await connection.commit();
      return true;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Error marcando propiedad como vendida:', error);
    throw error;
  }
}
  /**
   * Update booking status
   * @param {number} id - Booking ID
   * @param {string} status - New status
   * @param {number} userId - User ID performing the update
   * @returns {Promise<Object>} - The updated booking
   */
  async updateStatus(id, status, userId) {
    try {
      // Valid status transitions
      const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
      if (!validStatuses.includes(status)) {
        throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      // Get booking from database
      const booking = await this.findById(id);
      
      // Check permissions (user must be the guest or the property owner)
      if (booking.user_id !== userId && (!booking.property || booking.property.host_id !== userId)) {
        throw new AuthorizationError('You do not have permission to update this booking');
      }

      // Additional validations based on status
      if (status === 'cancelled') {
        // Check cancellation policy (could be more complex based on business rules)
        const now = new Date();
        const startDate = new Date(booking.check_in_date);
        const daysDifference = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysDifference < 1) {
          throw new ValidationError('Cannot cancel booking less than 24 hours before check-in');
        }
      }

      // Update booking status
      await mysqlPool.query(
        'UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?',
        [status, id]
      );

      // Fetch complete booking data with related entities
      const updatedBooking = await this.findById(id);

      // Log status update
      logger.info('Booking status updated', { 
        bookingId: id, 
        oldStatus: booking.status, 
        newStatus: status,
        updatedBy: userId
      });

      return updatedBooking;
    } catch (error) {
      console.error('Failed to update booking status:', error);
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError ||
          error instanceof AuthorizationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to update booking status: ' + error.message);
    }
  }

 /**
 * Cancel a booking - Versión corregida para manejar compras vs alquileres
 * @param {number} bookingId - Booking ID
 * @param {number} userId - User ID performing the cancellation
 * @returns {Promise<boolean>} - Success status
 */
/**
 * Cancel a booking - CORREGIDO para distinguir compras vs alquileres
 */
async cancelBooking(bookingId, userId) {
  try {
    console.log(`Iniciando cancelación de transacción #${bookingId} por usuario ${userId}`);
    
    const connection = await mysqlPool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Obtener la reserva con información de la propiedad
      const [booking] = await connection.query(
        `SELECT b.*, p.host_id, p.status as property_status, p.title as property_title 
         FROM bookings b 
         LEFT JOIN properties p ON b.property_id = p.id 
         WHERE b.id = ?`,
        [bookingId]
      );
      
      if (booking.length === 0) {
        throw new NotFoundError('Transacción no encontrada');
      }
      
      const bookingData = booking[0];
      
      console.log(`Transacción encontrada - Estado: ${bookingData.status}, Propiedad: ${bookingData.property_status}`);
      
      // Verificar autorización
      if (bookingData.user_id !== userId && bookingData.host_id !== userId) {
        throw new AuthorizationError('No tienes permiso para cancelar esta transacción');
      }
      
      // Check if booking can be cancelled
      if (bookingData.status === 'cancelled') {
        console.log('La transacción ya está cancelada, devolviendo éxito');
        await connection.commit();
        return true;
      }
      
      // Si es una compra/alquiler confirmado, revertir el estado de la propiedad
      if (bookingData.status === 'confirmed') {
        if (bookingData.property_status === 'sold') {
          await connection.query(
            'UPDATE properties SET status = "for-sale", updated_at = NOW() WHERE id = ?',
            [bookingData.property_id]
          );
          console.log(`Propiedad ${bookingData.property_id} revertida de 'sold' a 'for-sale'`);
        } else if (bookingData.property_status === 'rented') {
          await connection.query(
            'UPDATE properties SET status = "for-rent", updated_at = NOW() WHERE id = ?',
            [bookingData.property_id]
          );
          console.log(`Propiedad ${bookingData.property_id} revertida de 'rented' a 'for-rent'`);
        }
      }
      
      // Determinar el tipo de transacción
      const isPropertyForSale = bookingData.property_status === 'for-sale' || bookingData.property_status === 'sold';
      
      if (!isPropertyForSale && bookingData.status === 'pending') {
        // Para ALQUILERES pendientes, aplicar restricción de 48 horas
        console.log('Es un ALQUILER pendiente - Verificar restricción de 48 horas');
        
        const now = new Date();
        const checkInDate = new Date(bookingData.check_in_date);
        const timeDifference = checkInDate.getTime() - now.getTime();
        const hoursDifference = timeDifference / (1000 * 60 * 60);
        
        if (hoursDifference < 48) {
          throw new ValidationError('No se puede cancelar una reserva de alquiler con menos de 48 horas de anticipación');
        }
      } else {
        console.log('Es una COMPRA o transacción confirmada - No aplicar restricción de tiempo');
      }
      
      // Proceder con la cancelación
      console.log(`Cancelando ${isPropertyForSale ? 'compra' : 'alquiler'} #${bookingId}`);
      
      // Update booking status
      await connection.query(
        'UPDATE bookings SET status = "cancelled", updated_at = NOW() WHERE id = ?',
        [bookingId]
      );
      
      // Actualizar el registro de pago si existe
      await connection.query(
        'UPDATE payments SET status = "cancelled", updated_at = NOW() WHERE booking_id = ?',
        [bookingId]
      );
      console.log('Estado del pago actualizado a "cancelled"');
      
      await connection.commit();
      console.log(`${isPropertyForSale ? 'Compra' : 'Alquiler'} #${bookingId} cancelada exitosamente`);
      
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error cancelling booking:', error);
    
    if (error instanceof ValidationError || 
        error instanceof NotFoundError || 
        error instanceof AuthorizationError || 
        error instanceof ConflictError) {
      throw error;
    }
    
    throw new DatabaseError('Error al cancelar la transacción: ' + error.message);
  }
}

  /**
   * Check if property is available for given date range
   * @param {number} propertyId - Property ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<boolean>} - Whether property is available
   */
  async checkAvailability(propertyId, startDate, endDate) {
    try {
      console.log(`Verificando disponibilidad para propiedad ${propertyId}`);
      console.log(`Fechas solicitadas: ${startDate} a ${endDate}`);
      
      // Convertir fechas a formato de MySQL
      const formattedStartDate = startDate instanceof Date ? 
        startDate.toISOString().split('T')[0] : startDate;
      
      const formattedEndDate = endDate instanceof Date ? 
        endDate.toISOString().split('T')[0] : endDate;
      
      // Consultar reservas existentes que se solapan con el período solicitado
      const [existingBookings] = await mysqlPool.query(
        `SELECT * FROM bookings 
         WHERE property_id = ? 
         AND status != 'cancelled'
         AND deleted_at IS NULL
         AND (
           (check_in_date <= ? AND check_out_date >= ?) OR
           (check_in_date <= ? AND check_out_date >= ?) OR
           (check_in_date >= ? AND check_out_date <= ?)
         )`,
        [
          propertyId,
          formattedEndDate, formattedStartDate,   // Caso 1: Reserva existente incluye fecha inicio
          formattedStartDate, formattedStartDate, // Caso 2: Reserva existente incluye fecha fin
          formattedStartDate, formattedEndDate    // Caso 3: Reserva existente dentro del rango
        ]
      );
      
      // Si hay reservas existentes que se solapan, la propiedad no está disponible
      if (existingBookings.length > 0) {
        console.log(`La propiedad ${propertyId} no está disponible para las fechas solicitadas.`);
        console.log(`Se encontraron ${existingBookings.length} reservas que se solapan.`);
        return false;
      }
      
      // Si no hay reservas existentes que se solapen, la propiedad está disponible
      console.log(`La propiedad ${propertyId} está disponible para las fechas solicitadas.`);
      return true;
    } catch (error) {
      console.error('Error al verificar disponibilidad:', error);
      // En caso de error, es más seguro devolver false
      return false;
    }
  }

  // Este código debe añadirse o modificarse en booking.service.js
// Modificamos el método cancelExpiredBookings para que solo cancele reservas con estado 'pending'
// y que hayan expirado hace más de 30 minutos (no reservas válidas)

/**
 * Cancelar automáticamente reservas pendientes que han expirado
 * @param {number} timeoutMinutes - Tiempo en minutos después del cual se considera que una reserva pendiente ha expirado
 * @returns {Promise<number>} - Número de reservas canceladas
 */
async cancelExpiredBookings(timeoutMinutes = 30) {
  try {
    console.log(`Buscando reservas pendientes expiradas (> ${timeoutMinutes} minutos)...`);
    
    // Obtener la fecha límite (ahora menos el tiempo de expiración)
    const expirationDate = new Date();
    expirationDate.setMinutes(expirationDate.getMinutes() - timeoutMinutes);
    
    // Formatear fecha para MySQL
    const formattedExpirationDate = expirationDate.toISOString().slice(0, 19).replace('T', ' ');
    
    // Primero obtenemos las reservas que serán canceladas (para logging)
    // IMPORTANTE: Solo seleccionar reservas con estado 'pending'
    // y que su fecha de creación (no la fecha de check-in) sea anterior al límite de expiración
    const [expiredBookings] = await mysqlPool.query(
      `SELECT id, property_id, guest_name, created_at 
       FROM bookings 
       WHERE status = 'pending' 
       AND created_at < ?
       AND deleted_at IS NULL`,
      [formattedExpirationDate]
    );
    
    if (expiredBookings.length === 0) {
      console.log('No se encontraron reservas pendientes expiradas');
      return 0;
    }
    
    console.log(`Se encontraron ${expiredBookings.length} reservas pendientes expiradas`);
    
    // Actualizar el estado de las reservas expiradas a 'cancelled'
    const [result] = await mysqlPool.query(
      `UPDATE bookings 
       SET status = 'cancelled', 
           updated_at = NOW()
       WHERE status = 'pending' 
       AND created_at < ?
       AND deleted_at IS NULL`,
      [formattedExpirationDate]
    );
    
    console.log(`Se cancelaron ${result.affectedRows} reservas pendientes expiradas`);
    return result.affectedRows;
  } catch (error) {
    console.error('Error al cancelar reservas pendientes expiradas:', error);
    throw new DatabaseError('Error al cancelar reservas pendientes expiradas: ' + error.message);
  }
}

  /**
   * Get guest bookings
   * @param {number} userId - User ID
   * @param {Object} filters - Additional filters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} - Bookings data and count
   */
  async getGuestBookings(userId, filters = {}, pagination = { page: 1, limit: 10 }) {
    try {
      // Combine user filter with additional filters
      const combinedFilters = {
        ...filters,
        userId
      };
      
      return this.find(combinedFilters, pagination);
    } catch (error) {
      console.error('Failed to get guest bookings:', error);
      throw new DatabaseError('Failed to retrieve guest bookings: ' + error.message);
    }
  }

  /**
   * Get host bookings (bookings for properties owned by the user)
   * @param {number} hostId - Host/Owner ID
   * @param {Object} filters - Additional filters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} - Bookings data and count
   */
  async getHostBookings(hostId, filters = {}, pagination = { page: 1, limit: 10 }) {
    try {
      // Para host bookings, necesitamos buscar propiedades del anfitrión primero
      const [properties] = await mysqlPool.query(
        'SELECT id FROM properties WHERE host_id = ?',
        [hostId]
      );
      
      if (properties.length === 0) {
        return { bookings: [], total: 0 };
      }
      
      const propertyIds = properties.map(p => p.id);
      
      // Build query for bookings of properties owned by this host
      let queryParts = [
        'SELECT b.* FROM bookings b',
        'JOIN properties p ON b.property_id = p.id',
        'WHERE p.host_id = ?',
        'AND b.deleted_at IS NULL'
      ];
      let queryParams = [hostId];
      
      // Add status filter if provided
      if (filters.status && filters.status.length > 0) {
        queryParts.push(`AND b.status IN (${filters.status.map(() => '?').join(',')})`);
        queryParams.push(...filters.status);
      }
      
      // Add order and pagination
      queryParts.push('ORDER BY b.created_at DESC');
      queryParts.push('LIMIT ? OFFSET ?');
      
      const offset = (pagination.page - 1) * pagination.limit;
      queryParams.push(pagination.limit, offset);
      
      // Execute query
      const [bookingRows] = await mysqlPool.query(
        queryParts.join(' '),
        queryParams
      );
      
      // Get count for pagination
      const [countResult] = await mysqlPool.query(
        'SELECT COUNT(*) as total FROM bookings b JOIN properties p ON b.property_id = p.id WHERE p.host_id = ? AND b.deleted_at IS NULL',
        [hostId]
      );
      
      const total = countResult[0].total;
      
      // Load related data for bookings
      const bookings = await Promise.all(bookingRows.map(async (booking) => {
        // Get property data
        const [propertyRows] = await mysqlPool.query(
          'SELECT * FROM properties WHERE id = ?',
          [booking.property_id]
        );
        
        const property = propertyRows.length > 0 ? propertyRows[0] : null;
        
        // Get user data if available
        let user = null;
        if (booking.user_id) {
          const [userRows] = await mysqlPool.query(
            'SELECT id, first_name, last_name, email, phone, profile_image FROM users WHERE id = ?',[booking.user_id]
          );
          
          user = userRows.length > 0 ? userRows[0] : null;
        }
        
        // Format dates
        return {
          ...booking,
          check_in_date: booking.check_in_date ? new Date(booking.check_in_date) : null,
          check_out_date: booking.check_out_date ? new Date(booking.check_out_date) : null,
          created_at: booking.created_at ? new Date(booking.created_at) : null,
          updated_at: booking.updated_at ? new Date(booking.updated_at) : null,
          property,
          user
        };
      }));
      
      return {
        bookings,
        total
      };
    } catch (error) {
      console.error('Failed to get host bookings:', error);
      throw new DatabaseError('Failed to retrieve host bookings: ' + error.message);
    }
  }

  /**
   * Delete a booking (soft delete)
   * @param {number} id - Booking ID
   * @param {number} userId - User ID performing the delete
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id, userId) {
    try {
      // Get booking from database
      const booking = await this.findById(id);
      
      // Check permissions (only admin, property owner, or the booking user can delete)
      const [userRows] = await mysqlPool.query(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );
      
      const user = userRows.length > 0 ? userRows[0] : null;
      const isAdmin = user && user.role === 'admin';
      const isOwner = booking.property && booking.property.host_id === userId;
      const isBookingUser = booking.user_id === userId;
      
      if (!isAdmin && !isOwner && !isBookingUser) {
        throw new AuthorizationError('No tienes permiso para eliminar esta reserva');
      }
      
      // Soft delete by setting deletedAt timestamp
      await mysqlPool.query(
        'UPDATE bookings SET deleted_at = NOW() WHERE id = ?',
        [id]
      );
      
      // Log deletion
      logger.info('Booking deleted (soft)', { bookingId: id, deletedBy: userId });
      return true;
    } catch (error) {
      console.error('Failed to delete booking:', error);
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError || 
          error instanceof AuthorizationError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to delete booking: ' + error.message);
    }
  }
}

// Create singleton instance of the service
const bookingService = new BookingService();

// Export the service
export default bookingService;