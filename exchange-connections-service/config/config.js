require('dotenv').config();

// Allow both DB_* and PG* styles for easier sharing with other services
const dbHost = process.env.DB_HOST || process.env.PGHOST || 'localhost';
const dbPort = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
const dbName = process.env.DB_NAME || process.env.PGDATABASE || 'portfolio_db';
const dbUser = process.env.DB_USER || process.env.PGUSER || 'postgres';
const dbPass = process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres';

const config = {
  // Server
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  database: {
    host: dbHost,
    port: dbPort,
    database: dbName,
    user: dbUser,
    password: dbPass,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  },

  // Security
  // Align defaults across services for local dev
  jwtSecret: process.env.JWT_SECRET || 'dev-change-me',
  encryptionKey:
    process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  apiKeyHashSecret: process.env.API_KEY_HASH_SECRET || 'change-this-hmac-secret',

  // APIs
  apiTimeout: parseInt(process.env.API_TIMEOUT) || 60000,
  marketDataServiceUrl: process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:5001/api/v1'
};

module.exports = config;
