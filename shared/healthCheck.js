/**
 * Shared Health Check Utility
 * 
 * Provides standardized health check endpoint for all microservices.
 * Returns consistent response format with service status and metadata.
 * 
 * Usage:
 *   const { healthCheck } = require('./shared/healthCheck');
 *   app.get('/health', healthCheck('ServiceName', '1.0.0'));
 */

/**
 * Create a health check handler
 * @param {string} serviceName - Name of the microservice
 * @param {string} version - Service version
 * @param {Function} additionalChecks - Optional async function for additional health checks
 * @returns {Function} Express request handler
 */
const healthCheck = (serviceName, version = '1.0.0', additionalChecks = null) => {
  return async (req, res) => {
    const healthData = {
      status: 'healthy',
      service: serviceName,
      version: version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };

    // Run additional health checks if provided
    if (additionalChecks) {
      try {
        const checks = await additionalChecks();
        healthData.checks = checks;
      } catch (error) {
        healthData.status = 'unhealthy';
        healthData.error = error.message;
        return res.status(503).json(healthData);
      }
    }

    res.status(200).json(healthData);
  };
};

/**
 * Database health check
 * @param {Object} pool - Database connection pool
 * @returns {Promise<Object>} Health check result
 */
const checkDatabase = async (pool) => {
  try {
    await pool.query('SELECT 1');
    return { database: 'connected' };
  } catch (error) {
    throw new Error(`Database unhealthy: ${error.message}`);
  }
};

module.exports = {
  healthCheck,
  checkDatabase,
};
