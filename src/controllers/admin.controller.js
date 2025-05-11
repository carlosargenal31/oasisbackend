// src/controllers/admin.controller.js
import { AdminService } from '../services/admin.service.js';
import { asyncErrorHandler } from '../utils/errors/index.js';

export class AdminController {
  static getAllBusinesses = asyncErrorHandler(async (req, res) => {
    const filters = {
      category: req.query.category,
      status: req.query.status,
      verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
      search: req.query.search,
      sort: req.query.sort || 'newest',
      limit: parseInt(req.query.limit) || 12,
      offset: parseInt(req.query.page) ? (parseInt(req.query.page) - 1) * (parseInt(req.query.limit) || 12) : 0
    };
    
    const result = await AdminService.getAllBusinesses(filters);
    
    res.json({
      success: true,
      data: {
        businesses: result.businesses,
        total: result.total,
        page: Math.floor(filters.offset / filters.limit) + 1,
        limit: filters.limit,
        totalPages: Math.ceil(result.total / filters.limit)
      }
    });
  });
  
  static updateVerificationStatus = asyncErrorHandler(async (req, res) => {
    const { id } = req.params;
    const { isVerified } = req.body;
    
    await AdminService.updateVerificationStatus(id, isVerified);
    
    res.json({
      success: true,
      message: `Negocio ${isVerified ? 'verificado' : 'no verificado'} correctamente`
    });
  });
  
  static updateFeaturedStatus = asyncErrorHandler(async (req, res) => {
    const { id } = req.params;
    const { isFeatured } = req.body;
    
    await AdminService.updateFeaturedStatus(id, isFeatured);
    
    res.json({
      success: true,
      message: `Negocio ${isFeatured ? 'destacado' : 'no destacado'} correctamente`
    });
  });
  
  static getAdminStats = asyncErrorHandler(async (req, res) => {
    const stats = await AdminService.getAdminStats();
    
    res.json({
      success: true,
      data: stats
    });
  });
}