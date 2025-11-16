/**
 * Shared CORS Configuration
 * 
 * Provides standardized CORS settings for all microservices.
 * Supports multiple frontend origins for development (CRA, Vite, etc.)
 * 
 * Usage:
 *   const { corsMiddleware } = require('./shared/cors');
 *   app.use(corsMiddleware);
 */

const cors = require('cors');

// Allowed origins for development and production
const allowedOrigins = new Set([
  'http://localhost:3000', // Create React App default
  'http://localhost:5173', // Vite default
  'http://localhost:4173', // Vite preview
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]);

// Add production origin if specified
if (process.env.FRONTEND_URL) {
  allowedOrigins.add(process.env.FRONTEND_URL);
}

/**
 * CORS middleware configuration
 */
const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    
    // Log rejected origins in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`CORS rejected origin: ${origin}`);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

module.exports = {
  corsMiddleware,
  allowedOrigins,
};
