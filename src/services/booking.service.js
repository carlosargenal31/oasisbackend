/**
 * Booking Service
 * Manages booking operations for the OASIS application
 */
import { mysqlPool } from '../config/database.js';
import { ValidationError, NotFoundError, ConflictError, DatabaseError } from '../utils/errors/index.js';
import logger from '../utils/logger.js';

class BookingService {

  // Add this method to your existing BookingService class
static async cancelBooking(bookingId, userId) {
  try {
    // First check if booking exists and belongs to user
    const [booking] = await mysqlPool.query(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [bookingId, userId]
    );
    
    if (!booking[0]) {
      throw new NotFoundError('Reserva no encontrada o no autorizada');
    }
    
    // Check if booking can be cancelled
    if (booking[0].status === 'cancelled') {
      throw new ValidationError('La reserva ya está cancelada');
    }
    
    if (booking[0].status === 'completed') {
      throw new ValidationError('No se puede cancelar una reserva completada');
    }
    
    // Update booking status
    await mysqlPool.query(
      'UPDATE bookings SET status = "cancelled", updated_at = NOW() WHERE id = ?',
      [bookingId]
    );
    
    return true;
  } catch (error) {
    console.error('Error cancelling booking:', error);
    if (error instanceof BaseError) {
      throw error;
    }
    throw new DatabaseError('Error al cancelar la reserva');
  }
}
  /**
   * Create a new booking
   * @param {Object} bookingData - Booking data
   * @param {string} userId - User ID making the booking
   * @returns {Promise<Object>} - The created booking
   */
  async create(bookingData, userId) {
    try {
      // Validate required fields
      if (!bookingData.propertyId || !bookingData.startDate || !bookingData.endDate) {
        throw new ValidationError('Property ID, start date, and end date are required');
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

      // Check if user exists
      const [userRows] = await mysqlPool.query(
        'SELECT * FROM users WHERE id = ?',
        [userId]
      );
      
      if (userRows.length === 0) {
        throw new NotFoundError('User not found');
      }
      
      const user = userRows[0];

      // Check if property is available for the requested dates
      const isAvailable = await this.checkAvailability(
        bookingData.propertyId,
        startDate,
        endDate
      );

      if (!isAvailable) {
        throw new ConflictError('Property is not available for the selected dates');
      }

      // Calculate number of nights
      const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // Calculate total price
      const totalPrice = property.pricePerNight * nights;

      // Start transaction
      const connection = await mysqlPool.getConnection();
      await connection.beginTransaction();

      try {
        // Create booking
        const [result] = await connection.query(
          `INSERT INTO bookings 
           (propertyId, userId, ownerId, startDate, endDate, nights, 
            guests, totalPrice, status, createdAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            bookingData.propertyId,
            userId,
            property.ownerId,
            startDate,
            endDate,
            nights,
            bookingData.guests || 1,
            totalPrice,
            'pending',
            new Date()
          ]
        );

        const bookingId = result.insertId;

        // Create payment record
        const [paymentResult] = await connection.query(
          `INSERT INTO payments
           (bookingId, userId, amount, status, method, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            bookingId,
            userId,
            totalPrice,
            'pending',
            bookingData.paymentMethod || 'card',
            new Date()
          ]
        );

        const paymentId = paymentResult.insertId;

        // Update booking with payment ID
        await connection.query(
          'UPDATE bookings SET paymentId = ? WHERE id = ?',
          [paymentId, bookingId]
        );

        // Commit transaction
        await connection.commit();
        connection.release();

        // Fetch complete booking data
        const completeBooking = await this.findById(bookingId);

        // Log successful booking creation
        logger.info('Booking created successfully', { 
          bookingId,
          userId,
          propertyId: bookingData.propertyId,
          totalPrice
        });

        return completeBooking;
      } catch (error) {
        // Rollback transaction in case of error
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      logger.error('Failed to create booking', { error, userId, propertyId: bookingData.propertyId });
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError ||
          error instanceof ConflictError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to create booking');
    }
  }

  /**
   * Find booking by ID
   * @param {string} id - Booking ID
   * @returns {Promise<Object>} - The booking with related property and user data
   */
  async findById(id) {
    try {
      const [bookingRows] = await mysqlPool.query(
        'SELECT * FROM bookings WHERE id = ?',
        [id]
      );
      
      if (bookingRows.length === 0) {
        throw new NotFoundError('Booking not found');
      }
      
      const booking = bookingRows[0];

      // Get related property
      const [propertyRows] = await mysqlPool.query(
        'SELECT * FROM properties WHERE id = ?',
        [booking.propertyId]
      );
      
      const property = propertyRows.length > 0 ? propertyRows[0] : null;

      // Get user (guest) data
      const [userRows] = await mysqlPool.query(
        'SELECT * FROM users WHERE id = ?',
        [booking.userId]
      );
      
      const user = userRows.length > 0 ? userRows[0] : null;

      // Format dates for better readability
      booking.startDate = new Date(booking.startDate);
      booking.endDate = new Date(booking.endDate);
      booking.createdAt = new Date(booking.createdAt);
      if (booking.updatedAt) {
        booking.updatedAt = new Date(booking.updatedAt);
      }

      // Combine all data
      return {
        ...booking,
        property,
        user
      };
    } catch (error) {
      logger.error('Failed to find booking', { error, id });
      
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to retrieve booking');
    }
  }

  /**
   * Find bookings with filters
   * @param {Object} filters - Filter options
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Array>} - Array of bookings
   */
  async find(filters = {}, pagination = { page: 1, limit: 10 }) {
    try {
      // Build query parts
      let queryParts = ['SELECT * FROM bookings WHERE 1=1'];
      const queryParams = [];

      // Apply filters
      if (filters.userId) {
        queryParts.push('AND userId = ?');
        queryParams.push(filters.userId);
      }

      if (filters.propertyId) {
        queryParts.push('AND propertyId = ?');
        queryParams.push(filters.propertyId);
      }

      if (filters.status) {
        queryParts.push('AND status = ?');
        queryParams.push(filters.status);
      }

      if (filters.ownerId) {
        queryParts.push('AND ownerId = ?');
        queryParams.push(filters.ownerId);
      }

      if (filters.startDate) {
        queryParts.push('AND startDate >= ?');
        queryParams.push(new Date(filters.startDate));
      }

      if (filters.endDate) {
        queryParts.push('AND endDate <= ?');
        queryParams.push(new Date(filters.endDate));
      }

      // Add pagination
      const offset = (pagination.page - 1) * pagination.limit;
      queryParts.push('ORDER BY createdAt DESC LIMIT ? OFFSET ?');
      queryParams.push(pagination.limit, offset);

      // Execute query
      const [bookingRows] = await mysqlPool.query(
        queryParts.join(' '),
        queryParams
      );

      // Get related data for each booking
      const bookingsWithDetails = await Promise.all(
        bookingRows.map(async (booking) => {
          // Get property data
          const [propertyRows] = await mysqlPool.query(
            'SELECT * FROM properties WHERE id = ?',
            [booking.propertyId]
          );
          
          const property = propertyRows.length > 0 ? propertyRows[0] : null;

          // Get user data
          const [userRows] = await mysqlPool.query(
            'SELECT * FROM users WHERE id = ?',
            [booking.userId]
          );
          
          const user = userRows.length > 0 ? userRows[0] : null;

          // Format dates
          booking.startDate = new Date(booking.startDate);
          booking.endDate = new Date(booking.endDate);
          booking.createdAt = new Date(booking.createdAt);
          if (booking.updatedAt) {
            booking.updatedAt = new Date(booking.updatedAt);
          }

          return {
            ...booking,
            property,
            user
          };
        })
      );

      return bookingsWithDetails;
    } catch (error) {
      logger.error('Failed to find bookings', { error, filters });
      throw new DatabaseError('Failed to retrieve bookings');
    }
  }

  /**
   * Update booking status
   * @param {string} id - Booking ID
   * @param {string} status - New status
   * @param {string} userId - User ID performing the update
   * @returns {Promise<Object>} - The updated booking
   */
  async updateStatus(id, status, userId) {
    try {
      // Valid status transitions
      const validStatuses = ['pending', 'confirmed', 'canceled', 'completed'];
      if (!validStatuses.includes(status)) {
        throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      // Get booking from database
      const booking = await this.findById(id);
      if (!booking) {
        throw new NotFoundError('Booking not found');
      }

      // Check permissions (user must be the guest or the property owner)
      if (booking.userId !== userId && booking.property.ownerId !== userId) {
        throw new ValidationError('You do not have permission to update this booking');
      }

      // Additional validations based on status
      if (status === 'canceled') {
        // Check cancellation policy (could be more complex based on business rules)
        const now = new Date();
        const startDate = new Date(booking.startDate);
        const daysDifference = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysDifference < 1) {
          throw new ValidationError('Cannot cancel booking less than 24 hours before check-in');
        }
      }

      // Update booking status
      await mysqlPool.query(
        'UPDATE bookings SET status = ?, updatedAt = ? WHERE id = ?',
        [status, new Date(), id]
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
      logger.error('Failed to update booking status', { error, id, status, userId });
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to update booking status');
    }
  }

  /**
   * Check if property is available for the given date range
   * @param {string} propertyId - Property ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<boolean>} - Whether property is available
   */
  async checkAvailability(propertyId, startDate, endDate) {
    try {
      // Get property
      const [propertyRows] = await mysqlPool.query(
        'SELECT * FROM properties WHERE id = ?',
        [propertyId]
      );
      
      if (propertyRows.length === 0) {
        throw new NotFoundError('Property not found');
      }
      
      const property = propertyRows[0];

      // Check if property is active/available for booking
      if (!property.active) {
        return false;
      }

      // Find any overlapping bookings
      const [bookings] = await mysqlPool.query(
        `SELECT * FROM bookings 
         WHERE propertyId = ? 
         AND status IN ('pending', 'confirmed') 
         AND ((startDate < ? AND endDate > ?) OR 
              (startDate >= ? AND startDate < ?))`,
        [propertyId, endDate, startDate, startDate, endDate]
      );

      // If no overlapping bookings, property is available
      return bookings.length === 0;
    } catch (error) {
      logger.error('Failed to check availability', { error, propertyId, startDate, endDate });
      
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to check property availability');
    }
  }

  /**
   * Get guest bookings
   * @param {string} userId - User ID
   * @param {Object} filters - Additional filters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Array>} - Array of bookings
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
      logger.error('Failed to get guest bookings', { error, userId });
      throw new DatabaseError('Failed to retrieve guest bookings');
    }
  }

  /**
   * Get host bookings (bookings for properties owned by the user)
   * @param {string} ownerId - Owner/Host ID
   * @param {Object} filters - Additional filters
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Array>} - Array of bookings
   */
  async getHostBookings(ownerId, filters = {}, pagination = { page: 1, limit: 10 }) {
    try {
      // Combine owner filter with additional filters
      const combinedFilters = {
        ...filters,
        ownerId
      };
      
      return this.find(combinedFilters, pagination);
    } catch (error) {
      logger.error('Failed to get host bookings', { error, ownerId });
      throw new DatabaseError('Failed to retrieve host bookings');
    }
  }

  /**
   * Get booking statistics for a property
   * @param {string} propertyId - Property ID
   * @returns {Promise<Object>} - Booking statistics
   */
  async getPropertyBookingStats(propertyId) {
    try {
      // Check if property exists
      const [propertyRows] = await mysqlPool.query(
        'SELECT * FROM properties WHERE id = ?',
        [propertyId]
      );
      
      if (propertyRows.length === 0) {
        throw new NotFoundError('Property not found');
      }

      // Get total bookings
      const [totalBookingsResult] = await mysqlPool.query(
        'SELECT COUNT(*) as total FROM bookings WHERE propertyId = ?',
        [propertyId]
      );
      
      const totalBookings = totalBookingsResult[0].total;

      // Get completed bookings
      const [completedBookingsResult] = await mysqlPool.query(
        'SELECT COUNT(*) as completed FROM bookings WHERE propertyId = ? AND status = ?',
        [propertyId, 'completed']
      );
      
      const completedBookings = completedBookingsResult[0].completed;

      // Get canceled bookings
      const [canceledBookingsResult] = await mysqlPool.query(
        'SELECT COUNT(*) as canceled FROM bookings WHERE propertyId = ? AND status = ?',
        [propertyId, 'canceled']
      );
      
      const canceledBookings = canceledBookingsResult[0].canceled;

      // Get total revenue
      const [revenueResult] = await mysqlPool.query(
        'SELECT SUM(totalPrice) as revenue FROM bookings WHERE propertyId = ? AND status IN (?, ?)',
        [propertyId, 'confirmed', 'completed']
      );
      
      const revenue = revenueResult[0].revenue || 0;

      // Get average rating from reviews
      const [ratingResult] = await mysqlPool.query(
        'SELECT AVG(rating) as avgRating FROM reviews WHERE propertyId = ?',
        [propertyId]
      );
      
      const avgRating = ratingResult[0].avgRating || 0;

      // Get upcoming bookings
      const [upcomingBookings] = await mysqlPool.query(
        'SELECT COUNT(*) as upcoming FROM bookings WHERE propertyId = ? AND status = ? AND startDate > ?',
        [propertyId, 'confirmed', new Date()]
      );

      return {
        totalBookings,
        completedBookings,
        canceledBookings,
        upcomingBookings: upcomingBookings[0].upcoming,
        occupancyRate: totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0,
        totalRevenue: revenue,
        averageRating: parseFloat(avgRating.toFixed(1))
      };
    } catch (error) {
      logger.error('Failed to get property booking stats', { error, propertyId });
      
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to retrieve property booking statistics');
    }
  }

  /**
   * Delete a booking (soft delete)
   * @param {string} id - Booking ID
   * @param {string} userId - User ID performing the delete
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id, userId) {
    try {
      // Get booking from database
      const booking = await this.findById(id);
      if (!booking) {
        throw new NotFoundError('Booking not found');
      }

      // Check permissions (only admin or property owner can delete)
      const [userRows] = await mysqlPool.query(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );
      
      const user = userRows.length > 0 ? userRows[0] : null;
      const isAdmin = user && user.role === 'admin';
      const isOwner = booking.property.ownerId === userId;

      if (!isAdmin && !isOwner) {
        throw new ValidationError('You do not have permission to delete this booking');
      }

      // Soft delete by setting deletedAt timestamp
      await mysqlPool.query(
        'UPDATE bookings SET deletedAt = ? WHERE id = ?',
        [new Date(), id]
      );

      // Log deletion
      logger.info('Booking deleted (soft)', { bookingId: id, deletedBy: userId });

      return true;
    } catch (error) {
      logger.error('Failed to delete booking', { error, id, userId });
      
      if (error instanceof ValidationError || 
          error instanceof NotFoundError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to delete booking');
    }
  }
}

// Create singleton instance of the service
const bookingService = new BookingService();

// Export the service
export default bookingService;