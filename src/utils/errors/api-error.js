// src/utils/errors/api-error.js
import { BaseError } from './base-error.js';

export class ValidationError extends BaseError {
  constructor(message = 'Error de validación', errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class AuthenticationError extends BaseError {
  constructor(message = 'Error de autenticación') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends BaseError {
  constructor(message = 'No autorizado') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends BaseError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends BaseError {
  constructor(message = 'Conflicto con el recurso') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class DatabaseError extends BaseError {
  constructor(message = 'Error en la base de datos') {
    super(message, 500, 'DATABASE_ERROR', false);
  }
}