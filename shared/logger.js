/**
 * Shared Logger Utility
 * 
 * Provides consistent logging across all microservices.
 * Includes timestamps, service names, and log levels.
 * 
 * Usage:
 *   const logger = require('./shared/logger')('ServiceName');
 *   logger.info('Server started', { port: 3000 });
 *   logger.error('Database error', error);
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const COLORS = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[90m', // Gray
  RESET: '\x1b[0m',
  SERVICE: '\x1b[35m', // Magenta
};

class Logger {
  constructor(serviceName = 'Service') {
    this.serviceName = serviceName;
    this.logLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  _formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const color = COLORS[level];
    const reset = COLORS.RESET;
    const serviceColor = COLORS.SERVICE;
    
    let logMessage = `${color}[${timestamp}] [${level}]${reset} ${serviceColor}[${this.serviceName}]${reset} ${message}`;
    
    if (data !== undefined) {
      if (data instanceof Error) {
        logMessage += `\n${color}${data.stack}${reset}`;
      } else if (typeof data === 'object') {
        logMessage += `\n${JSON.stringify(data, null, 2)}`;
      } else {
        logMessage += ` ${data}`;
      }
    }
    
    return logMessage;
  }

  error(message, data) {
    if (this.logLevel >= LOG_LEVELS.ERROR) {
      console.error(this._formatMessage('ERROR', message, data));
    }
  }

  warn(message, data) {
    if (this.logLevel >= LOG_LEVELS.WARN) {
      console.warn(this._formatMessage('WARN', message, data));
    }
  }

  info(message, data) {
    if (this.logLevel >= LOG_LEVELS.INFO) {
      console.log(this._formatMessage('INFO', message, data));
    }
  }

  debug(message, data) {
    if (this.logLevel >= LOG_LEVELS.DEBUG) {
      console.log(this._formatMessage('DEBUG', message, data));
    }
  }

  http(method, path) {
    if (this.logLevel >= LOG_LEVELS.INFO) {
      const timestamp = new Date().toISOString();
      console.log(`${COLORS.DEBUG}[${timestamp}]${COLORS.RESET} ${method} ${path}`);
    }
  }
}

/**
 * Create a logger instance for a service
 * @param {string} serviceName - Name of the microservice
 * @returns {Logger} Logger instance
 */
const createLogger = (serviceName) => new Logger(serviceName);

// Export default logger for quick use
module.exports = createLogger;
module.exports.Logger = Logger;
