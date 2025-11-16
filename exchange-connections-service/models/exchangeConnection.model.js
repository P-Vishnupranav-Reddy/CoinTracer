const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const EncryptionUtil = require('../utils/encryption.util');
const crypto = require('crypto');
const config = require('../config/config');

class ExchangeConnection {
  static hashApiKey(apiKey) {
    const secret = config.apiKeyHashSecret || 'change-this-hmac-secret';
    return crypto.createHmac('sha256', secret).update(String(apiKey)).digest('hex');
  }

  static async create(connectionData) {
    const { userId, portfolioId, exchange, apiKey, apiSecret, passphrase } = connectionData;

    const id = uuidv4();
    const apiKeyEncrypted = EncryptionUtil.encrypt(apiKey);
    const apiSecretEncrypted = EncryptionUtil.encrypt(apiSecret);
    const passphraseEncrypted = passphrase ? EncryptionUtil.encrypt(passphrase) : null;
    const apiKeyHash = this.hashApiKey(apiKey);

    const query = `
      INSERT INTO exchange_connections (
        id, user_id, portfolio_id, exchange, api_key_encrypted, 
        api_secret_encrypted, passphrase_encrypted, api_key_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, portfolio_id, exchange, is_active, 
                last_sync_at, sync_status, transactions_synced, created_at
    `;

    const values = [id, userId, portfolioId, exchange, apiKeyEncrypted, apiSecretEncrypted, passphraseEncrypted, apiKeyHash];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findByApiKeyHash(exchange, apiKeyHash) {
    const query = `
      SELECT id, user_id, portfolio_id, exchange, created_at
      FROM exchange_connections
      WHERE exchange = $1 AND api_key_hash = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [exchange, apiKeyHash]);
    return result.rows[0] || null;
  }

  static async findByUserId(userId) {
    const query = `
      SELECT id, user_id, portfolio_id, exchange, is_active, 
             last_sync_at, sync_status, transactions_synced, created_at
      FROM exchange_connections 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async findById(connectionId) {
    const query = 'SELECT * FROM exchange_connections WHERE id = $1';
    const result = await pool.query(query, [connectionId]);

    if (result.rows.length > 0) {
      const connection = result.rows[0];
      // Decrypt API credentials
      connection.apiKey = EncryptionUtil.decrypt(connection.api_key_encrypted);
      connection.apiSecret = EncryptionUtil.decrypt(connection.api_secret_encrypted);
      if (connection.passphrase_encrypted) {
        connection.passphrase = EncryptionUtil.decrypt(connection.passphrase_encrypted);
      }
      return connection;
    }
    return null;
  }

  static async updateSyncStatus(connectionId, status, transactionsSynced, errorMessage = null) {
    const query = `
      UPDATE exchange_connections 
      SET last_sync_at = CURRENT_TIMESTAMP, 
          sync_status = $1, 
          transactions_synced = $2,
          error_message = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, sync_status, last_sync_at, transactions_synced
    `;
    const result = await pool.query(query, [status, transactionsSynced, errorMessage, connectionId]);
    return result.rows[0];
  }

  static async delete(connectionId) {
    const query = 'DELETE FROM exchange_connections WHERE id = $1';
    await pool.query(query, [connectionId]);
    return true;
  }

  static async getSyncStatus(connectionId) {
    const query = `
      SELECT id, last_sync_at, sync_status, transactions_synced, error_message
      FROM exchange_connections 
      WHERE id = $1
    `;
    const result = await pool.query(query, [connectionId]);
    return result.rows[0];
  }
}

module.exports = ExchangeConnection;
