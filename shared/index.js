/**
 * CoinTracer Shared Utilities
 * 
 * Central export point for all shared utilities across microservices.
 * Import what you need to keep services clean and consistent.
 * 
 * Usage:
 *   const { authMiddleware, logger, corsMiddleware } = require('@cointracer/shared');
 */

module.exports = {
  // Database
  database: require('./database'),
  
  // Authentication
  authMiddleware: require('./authMiddleware').authMiddleware,
  optionalAuth: require('./authMiddleware').optionalAuth,
  
  // CORS
  corsMiddleware: require('./cors').corsMiddleware,
  
  // Error Handling
  errorHandler: require('./errorHandler').errorHandler,
  notFoundHandler: require('./errorHandler').notFoundHandler,
  asyncHandler: require('./errorHandler').asyncHandler,
  ValidationError: require('./errorHandler').ValidationError,
  UnauthorizedError: require('./errorHandler').UnauthorizedError,
  NotFoundError: require('./errorHandler').NotFoundError,
  ConflictError: require('./errorHandler').ConflictError,
  
  // Logging
  createLogger: require('./logger'),
  
  // Health Check
  healthCheck: require('./healthCheck').healthCheck,
  checkDatabase: require('./healthCheck').checkDatabase,
};
