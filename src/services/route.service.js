// src/services/route.service.js (simplificado)
import axios from 'axios';
import polyline from '@mapbox/polyline';
import { ValidationError } from '../utils/errors/index.js';

export class RouteService {
  static async calculateRoute(origin, destination) {
    try {
      // Geocodificar origen/destino si es necesario
      let originCoords = origin;
      let destCoords = destination;

      if (origin.address && (!origin.lat || !origin.lng)) {
        const geocoded = await this.geocodeAddress(origin.address);
        originCoords = { lat: geocoded.lat, lng: geocoded.lng };
      }

      if (destination.address && (!destination.lat || !destination.lng)) {
        const geocoded = await this.geocodeAddress(destination.address);
        destCoords = { lat: geocoded.lat, lng: geocoded.lng };
      }

      console.log('Calculando ruta desde:', originCoords, 'hasta:', destCoords);

      // Intentar con OSRM primero (sin API key)
      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}`;
        
        console.log('Consultando OSRM:', osrmUrl);
        
        const response = await axios.get(osrmUrl, {
          params: {
            overview: 'full',
            geometries: 'polyline',
            steps: true
          },
          timeout: 5000 // 5 segundos timeout (reducido para fallar rápido)
        });

        if (response.data && response.data.routes && response.data.routes.length > 0) {
          const route = response.data.routes[0];
          
          // Decodificar la geometría del polyline
          const points = polyline.decode(route.geometry);
          
          // Convertir a formato [lat, lng]
          const coordinates = points.map(point => [point[0], point[1]]);
          
          const distanceInKm = (route.distance / 1000).toFixed(2);
          const durationInMinutes = Math.round(route.duration / 60);
          
          return {
            success: true,
            origin: originCoords,
            destination: destCoords,
            route: {
              distance: parseFloat(distanceInKm),
              duration: durationInMinutes,
              coordinates: coordinates,
              geometry: route.geometry // Mantener el polyline original
            }
          };
        }
      } catch (osrmError) {
        console.error('Error al calcular con OSRM:', osrmError);
        // Continuar con la alternativa
      }

      // Si OSRM falla, calcular distancia en línea recta como respaldo
      console.log('OSRM falló, calculando distancia en línea recta');
      const straightLineDistance = this.calculateStraightLineDistance(originCoords, destCoords);
      
      return {
        success: false,
        origin: originCoords,
        destination: destCoords,
        straightLine: {
          distance: straightLineDistance,
          duration: Math.round(straightLineDistance / 50 * 60), // Estimación a 50 km/h
          coordinates: [
            [originCoords.lat, originCoords.lng],
            [destCoords.lat, destCoords.lng]
          ],
          errorMessage: "No se pudo calcular la ruta exacta. Se muestra la distancia aproximada en línea recta."
        }
      };
    } catch (error) {
      console.error('Error general en calculateRoute:', error);
      throw new ValidationError('Error al calcular la ruta: ' + error.message);
    }
  }

  static async geocodeAddress(address) {
    if (!address) {
      throw new ValidationError('Se requiere una dirección para geocodificar');
    }

    try {
      // Geocodificación con Nominatim (sin API key)
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 1,
          addressdetails: 1
        },
        headers: {
          'User-Agent': 'OasisApp/1.0' // Requerido por Nominatim
        }
      });

      if (!response.data || response.data.length === 0) {
        throw new ValidationError('No se pudo encontrar la ubicación especificada');
      }

      const location = response.data[0];
      return {
        lat: parseFloat(location.lat),
        lng: parseFloat(location.lon),
        display_name: location.display_name
      };
    } catch (error) {
      console.error('Error en geocodificación:', error);
      throw new ValidationError('Error al obtener coordenadas de la dirección');
    }
  }

  static calculateStraightLineDistance(point1, point2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.deg2rad(point2.lat - point1.lat);
    const dLon = this.deg2rad(point2.lng - point1.lng);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(point1.lat)) * Math.cos(this.deg2rad(point2.lat)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distancia en km
    
    return parseFloat(distance.toFixed(2));
  }
  
  static deg2rad(deg) {
    return deg * (Math.PI/180);
  }
}