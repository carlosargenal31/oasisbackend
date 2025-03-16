/**
 * Constants for OASIS application
 */

// Status constants
export const USER_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    BANNED: 'banned'
  };
  
  export const USER_ROLES = {
    GUEST: 'guest',
    HOST: 'host',
    ADMIN: 'admin'
  };
  
  export const BOOKING_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELED: 'canceled',
    COMPLETED: 'completed'
  };
  
  export const PAYMENT_STATUS = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded'
  };
  
  export const PAYMENT_METHODS = {
    CREDIT_CARD: 'credit_card',
    DEBIT_CARD: 'debit_card',
    PAYPAL: 'paypal',
    BANK_TRANSFER: 'bank_transfer'
  };
  
  export const PROPERTY_STATUS = {
    AVAILABLE: 'available',
    RENTED: 'rented',
    MAINTENANCE: 'maintenance'
  };
  
  export const PROPERTY_TYPES = {
    HOUSE: 'house',
    APARTMENT: 'apartment',
    COMMERCIAL: 'commercial'
  };
  
  // Pagination defaults
  export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100
  };
  
  // API response messages
  export const MESSAGES = {
    // Auth
    REGISTER_SUCCESS: 'Usuario registrado exitosamente',
    LOGIN_SUCCESS: 'Inicio de sesión exitoso',
    PASSWORD_CHANGED: 'Contraseña actualizada exitosamente',
    PASSWORD_RESET_REQUESTED: 'Instrucciones de reseteo enviadas',
    PASSWORD_RESET_SUCCESS: 'Contraseña reseteada exitosamente',
    LOGOUT_SUCCESS: 'Sesión cerrada exitosamente',
    
    // Resources
    CREATED: 'Recurso creado exitosamente',
    UPDATED: 'Recurso actualizado exitosamente',
    DELETED: 'Recurso eliminado exitosamente',
    NOT_FOUND: 'Recurso no encontrado',
    
    // Errors
    VALIDATION_ERROR: 'Error de validación',
    AUTH_ERROR: 'Error de autenticación',
    SERVER_ERROR: 'Error interno del servidor'
  };
  
  export default {
    USER_STATUS,
    USER_ROLES,
    BOOKING_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHODS,
    PROPERTY_STATUS,
    PROPERTY_TYPES,
    PAGINATION,
    MESSAGES
  };