/**
 * Authentication middleware for exchange-connections-service
 *
 * This file re-exports the shared auth middleware with user model lookup.
 *
 * For simple JWT verification without user lookup, use the shared middleware directly:
 *   const { authMiddleware } = require('../../shared');
 */

const { authMiddleware: baseAuthMiddleware } = require('../../shared');
const User = require('../models/user.model');

/**
 * Enhanced auth middleware that loads the full user model
 * Use this when you need access to user database fields beyond just userId
 */
const authMiddleware = async (req, res, next) => {
  // First run the base authentication
  baseAuthMiddleware(req, res, async (err) => {
    if (err) return next(err);

    try {
      // Load full user model if needed
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      req.user = user; // Attach full user object
      return next();
    } catch (error) {
      console.error('User lookup error:', error);
      return res.status(500).json({ error: 'Authentication processing failed' });
    }
  });
};

// For routes that don't need the full user model, use simple auth
const { authMiddleware: simpleAuth } = require('../../shared');

module.exports = {
  authMiddleware,
  simpleAuth
};
