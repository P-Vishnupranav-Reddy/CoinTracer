// Backfill api_key_hash for existing exchange_connections
// Usage: node scripts/backfill_api_key_hash.js

require('dotenv').config();
const pool = require('../config/database');
const EncryptionUtil = require('../utils/encryption.util');
const ExchangeConnection = require('../models/exchangeConnection.model');

(async () => {
  try {
    const { rows } = await pool.query(
      'SELECT id, exchange, api_key_encrypted FROM exchange_connections WHERE api_key_hash IS NULL'
    );
    console.log(`Found ${rows.length} rows to backfill...`);

    for (const row of rows) {
      try {
        const apiKey = EncryptionUtil.decrypt(row.api_key_encrypted);
        const hash = ExchangeConnection.hashApiKey(apiKey);
        await pool.query(
          'UPDATE exchange_connections SET api_key_hash = $1 WHERE id = $2',
          [hash, row.id]
        );
        console.log(`Updated ${row.id}`);
      } catch (e) {
        console.warn(`Skipping ${row.id}:`, e.message);
      }
    }

    console.log('Backfill complete.');
    process.exit(0);
  } catch (err) {
    console.error('Backfill error:', err);
    process.exit(1);
  }
})();
