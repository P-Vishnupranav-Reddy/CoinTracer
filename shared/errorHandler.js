/**
 * Shared Error Handling Middleware
 * 
 * Provides standardized error handling for all microservices.
 * Includes 404 handler and global error handler with proper logging.
 * 
 * Usage:
 *   const { notFoundHandler, errorHandler } = require('./shared/errorHandler');
 *   
 *   // ... your routes ...
 *   
 *   app.use(notFoundHandler);
 *   app.use(errorHandler);
 */

/**
 * 404 Not Found Handler
 * Place this after all your routes
 */
const notFoundHandler = (req, res) => {
  console.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
};

/**
 * Global Error Handler
 * Catches all errors and returns consistent error responses
 * Place this as the last middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Determine status code
  const statusCode = err.status || err.statusCode || 500;

  // Prepare error response
  const errorResponse = {
    error: err.message || 'Internal server error',
    ...(err.details && { details: err.details }),
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Async handler wrapper
 * Catches async errors and passes them to error handler
 * 
 * Usage:
 *   app.get('/users', asyncHandler(async (req, res) => {
 *     const users = await User.findAll();
 *     res.json(users);
 *   }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
};
