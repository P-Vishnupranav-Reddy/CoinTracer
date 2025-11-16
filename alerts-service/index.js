require('dotenv').config();

const express = require('express');
const {
  corsMiddleware,
  errorHandler,
  notFoundHandler,
  createLogger,
  healthCheck
} = require('../shared');

const alertRoutes = require('./routes/alert.routes');
const AlertWorker = require('./services/alertWorker.service');

const logger = createLogger('Alerts-Service');
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
app.get('/health', healthCheck('Alerts Service', '1.0.0'));

// ======================
// API Routes
// ======================
app.use('/api/v1/alerts', alertRoutes);

// ======================
// Error Handlers
// ======================
app.use(notFoundHandler);
app.use(errorHandler);

// ======================
// Start Server
// ======================
const PORT = process.env.PORT || 5002;
const server = app.listen(PORT, () => {
  logger.info('Alerts Service started', { port: PORT, url: `http://localhost:${PORT}` });
});

// ======================
// Start Alert Worker
// ======================
const alertWorker = new AlertWorker({
  intervalMs: parseInt(process.env.ALERT_CHECK_INTERVAL_MS || '60000') // Default: 1 minute
});

// Start worker in production or when explicitly enabled
if (process.env.ENABLE_ALERT_WORKER !== 'false') {
  alertWorker.start();
  logger.info('Alert worker started', { intervalMs: alertWorker.intervalMs });
}

// ======================
// Graceful Shutdown
// ======================
const shutdown = () => {
  logger.info('Shutdown signal received, closing gracefully...');

  // Stop alert worker
  alertWorker.stop();

  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Export for testing
module.exports = app;
