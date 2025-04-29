// src/config/axios-config.js
import axios from 'axios';

// Configurar URL base
axios.defaults.baseURL = 'http://localhost:3000'; // Puerto 3000 según tu server.config.js

// Interceptor para agregar el token de autenticación a todas las solicitudes
axios.interceptors.request.use(
  config => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores comunes de respuesta
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      // El servidor respondió con un código de estado fuera del rango 2xx
      if (error.response.status === 401) {
        console.warn('Error de autenticación:', error.response.data);
        
        // Limpiar tokens de autenticación
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        
        // Redireccionar al login si no estamos ya en esa página
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/auth/login')) {
          window.location.href = '/auth/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default axios;