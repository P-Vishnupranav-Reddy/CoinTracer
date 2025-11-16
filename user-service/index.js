require('dotenv').config();

const express = require('express');
const {
  corsMiddleware,
  errorHandler,
  notFoundHandler,
  createLogger,
  healthCheck
} = require('../shared');

const authRoutes = require('./routes/auth');

const logger = createLogger('User-Service');
const app = express();

// ======================
// Middleware
// ======================
app.use(corsMiddleware);
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  logger.http(req.method, req.path);
  next();
});

// ======================
// Health Check
// ======================
app.get('/health', healthCheck('User Service', '1.0.0'));

// ======================
// API Routes
// ======================
app.use('/api/v1/auth', authRoutes);

// ======================
// Error Handlers
// ======================
app.use(notFoundHandler);
app.use(errorHandler);

// ======================
// Start Server
// ======================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  logger.info('User Service started', { port: PORT, url: `http://localhost:${PORT}` });
});
