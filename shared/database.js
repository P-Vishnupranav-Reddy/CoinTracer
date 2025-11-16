/**
 * Shared Database Connection Pool
 * 
 * Provides a standardized PostgreSQL connection pool for all microservices.
 * Reads configuration from environment variables (PG* or DB_* prefixes supported).
 * 
 * Usage:
 *   const { pool, query } = require('./shared/database');
 *   const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */

const { Pool } = require('pg');
require('dotenv').config();

// Support both DB_* and PG* environment variable prefixes
const config = {
  host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'portfolio_db',
  user: process.env.DB_USER || process.env.PGUSER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(config);

// Connection event handlers
pool.on('connect', () => {
  console.log('Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
  process.exit(-1);
});

// Graceful shutdown handler
let isShuttingDown = false;
const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  try {
    await pool.end();
    console.log('Database connection pool closed');
  } catch (err) {
    if (err.message !== 'Called end on pool more than once') {
      console.error('Error closing database pool:', err);
    }
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * Execute a parameterized query
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result object with rows property
 */
const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  query,
  end: pool.end.bind(pool),
};
