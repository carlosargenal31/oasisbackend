// src/controllers/route.controller.js
import { RouteService } from '../services/route.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class RouteController {
  /**
   * Endpoint para geocodificar una dirección
   */
  static geocodeAddress = asyncErrorHandler(async (req, res) => {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere una dirección para geocodificar'
      });
    }
    
    try {
      const result = await RouteService.geocodeAddress(address);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * Endpoint para calcular una ruta entre origen y destino
   */
  static calculateRoute = asyncErrorHandler(async (req, res) => {
    const { originLat, originLng, destinationLat, destinationLng, originAddress, destinationAddress } = req.query;
    
    try {
      let origin, destination;
      
      // Si se proporcionan coordenadas directamente, usarlas
      if (originLat && originLng) {
        origin = {
          lat: parseFloat(originLat),
          lng: parseFloat(originLng)
        };
      } 
      // Si no, intentar geocodificar la dirección
      else if (originAddress) {
        const geocoded = await RouteService.geocodeAddress(originAddress);
        origin = {
          lat: geocoded.lat,
          lng: geocoded.lng
        };
      } else {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un origen (coordenadas o dirección)'
        });
      }
      
      // Igual para el destino
      if (destinationLat && destinationLng) {
        destination = {
          lat: parseFloat(destinationLat),
          lng: parseFloat(destinationLng)
        };
      } else if (destinationAddress) {
        const geocoded = await RouteService.geocodeAddress(destinationAddress);
        destination = {
          lat: geocoded.lat,
          lng: geocoded.lng
        };
      } else {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un destino (coordenadas o dirección)'
        });
      }
      
      // Calcular la ruta
      const result = await RouteService.calculateRoute(origin, destination);
      
      res.json({
        success: true,
        origin,
        destination,
        ...result
      });
    } catch (error) {
      console.error('Error en cálculo de ruta:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  });
}