/**
 * Shared JWT Authentication Middleware
 * 
 * Verifies JWT tokens and attaches user information to the request.
 * Use this middleware to protect routes that require authentication.
 * 
 * Usage:
 *   const { authMiddleware } = require('./shared/authMiddleware');
 *   app.get('/protected', authMiddleware, (req, res) => {
 *     // Access authenticated user via req.userId or req.user
 *   });
 */

const jwt = require('jsonwebtoken');

/**
 * Standard authentication middleware
 * Verifies JWT token from Authorization header and sets req.userId
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authMiddleware = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Verify token with JWT secret
    const jwtSecret = process.env.JWT_SECRET || 'dev-change-me';
    
    try {
      const decoded = jwt.verify(token, jwtSecret);
      
      // Attach userId to request for downstream use
      req.userId = decoded.userId;
      req.user = decoded; // Include full decoded token if needed
      
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication processing failed.' });
  }
};

/**
 * Optional authentication middleware
 * Does not reject unauthenticated requests, but sets req.userId if token is valid
 * Use for endpoints that work differently for authenticated vs anonymous users
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token, continue without user info
    }

    const token = authHeader.slice(7);
    const jwtSecret = process.env.JWT_SECRET || 'dev-change-me';
    
    try {
      const decoded = jwt.verify(token, jwtSecret);
      req.userId = decoded.userId;
      req.user = decoded;
    } catch (err) {
      // Invalid token, but don't fail the request
      console.warn('Optional auth: Invalid token provided');
    }
    
    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next(); // Continue even on error
  }
};

module.exports = {
  authMiddleware,
  optionalAuth,
};
