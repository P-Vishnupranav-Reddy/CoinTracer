const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Convert various date inputs to a valid JS Date. Falls back to now if invalid.
function toValidDate(input) {
  if (!input) {
    console.warn('toValidDate: No input provided, using current date');
    return new Date();
  }
  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      console.warn('toValidDate: Invalid Date object, using current date');
      return new Date();
    }
    return input;
  }
  // numeric string or number timestamp (sec or ms)
  let value = input;
  if (typeof input === 'string' && /^\d+$/.test(input)) {
    value = Number(input);
  }
  if (typeof value === 'number') {
    // if seconds, convert to ms
    if (value < 1e12) value = value * 1000;
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      console.warn(`toValidDate: Invalid numeric timestamp ${input}, using current date`);
      return new Date();
    }
    return d;
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    console.warn(`toValidDate: Could not parse date "${input}", using current date`);
    return new Date();
  }
  return d;
}

class Transaction {
  /**
   * =========================================================
   * CREATE SINGLE TRANSACTION
   * =========================================================
   */
  static async create(transactionData) {
    const {
      portfolioId,
      type,
      assetId,
      symbol,
      quantity,
      price,
      fee = 0,
      exchange = null,
      transactionDate,
      orderId = null,
      tradeId = null,
      feeCurrency = null,
      walletAddress = null,
      network = null,
      quoteAsset = null,
      quoteQuantity = null,
      conversionRate = null,
      txid = null
    } = transactionData;

    const id = uuidv4();

    // Prevent inserting duplicates
    if (tradeId || txid) {
      const existing = await pool.query(
        'SELECT id FROM transactions WHERE portfolio_id = $1 AND (trade_id = $2 OR trade_id = $3)',
        [portfolioId, tradeId, txid]
      );
      if (existing.rows.length > 0) return existing.rows[0];
    }

    const query = `
      INSERT INTO transactions (
        id, portfolio_id, type, asset_id, symbol, quantity, price, fee, exchange,
        transaction_date, order_id, trade_id, fee_currency, wallet_address, network,
        quote_asset, quote_quantity, conversion_rate
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `;

    const values = [
      id, portfolioId, type, assetId, symbol, quantity, price, fee, exchange,
      toValidDate(transactionDate), orderId, tradeId, feeCurrency, walletAddress, network,
      quoteAsset, quoteQuantity, conversionRate
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * =========================================================
   * BULK CREATE MULTIPLE TRANSACTIONS
   * Skips duplicates (tradeId or txid)
   * Safe for generated columns (no total_value insert)
   * =========================================================
   */
  static async bulkCreate(transactions) {
    if (!transactions || transactions.length === 0) {
      console.warn('No transactions provided for bulk insert');
      return [];
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const portfolioId = transactions[0]?.portfolioId;
      if (!portfolioId) throw new Error('Missing portfolioId in bulkCreate() transactions');

      // Step 1: Prefetch existing trade_ids to avoid duplicates
      const existingRes = await client.query(
        'SELECT trade_id FROM transactions WHERE portfolio_id = $1 AND trade_id IS NOT NULL',
        [portfolioId]
      );
      const existingTradeIds = new Set(existingRes.rows.map(r => r.trade_id));

      const createdTransactions = [];

      // Step 2: Prepare inserts
      for (const txn of transactions) {
      // Skip empty or invalid records
        if (!txn || !txn.portfolioId) continue;

        const id = uuidv4();
        const type = txn.type || 'trade';
        const assetId = txn.assetId || txn.symbol?.split('/')[0] || txn.symbol || 'UNKNOWN';
        const symbol = txn.symbol || 'UNKNOWN';
        const quantity = Number(txn.quantity) || 0;
        const price = Number(txn.price) || 0;
        const fee = Number(txn.fee) || 0;
        const exchange = txn.exchange || 'unknown';
        const transactionDate = toValidDate(txn.transactionDate || txn.date);
        const tradeId = txn.tradeId || null;

        // Skip duplicate trades (trade_id already exists)
        if (tradeId && existingTradeIds.has(tradeId)) continue;

        const query = `
        INSERT INTO transactions (
          id, portfolio_id, connection_id, type, asset_id, symbol, quantity,
          price, fee, exchange, transaction_date,
          order_id, trade_id, fee_currency, wallet_address, network,
          quote_asset, quote_quantity, conversion_rate
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (portfolio_id, trade_id)
        DO NOTHING
        RETURNING *
      `;

        const values = [
          id, txn.portfolioId, txn.connectionId || null, type, assetId, symbol, quantity, price, fee, exchange, transactionDate,
          txn.orderId || null, tradeId, txn.feeCurrency || null,
          txn.walletAddress || null, txn.network || null,
          txn.quoteAsset || null, txn.quoteQuantity || null, txn.conversionRate || null
        ];

        const result = await client.query(query, values);

        if (result.rows.length > 0) {
          createdTransactions.push(result.rows[0]);
          if (tradeId) existingTradeIds.add(tradeId); // cache to prevent same-batch duplicates
        }
      }

      await client.query('COMMIT');
      console.log(`Inserted ${createdTransactions.length} new transactions into portfolio ${portfolioId}`);
      return createdTransactions;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk transaction insert failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * =========================================================
   * FIND TRANSACTIONS BY PORTFOLIO ID
   * Supports optional filtering by type
   * =========================================================
   */
  static async findByPortfolioId(portfolioId, limit = 50, offset = 0, type = null) {
    let query = `
      SELECT *
      FROM transactions
      WHERE portfolio_id = $1
    `;
    const values = [portfolioId];

    if (type) {
      const types = type.split(',').map(t => t.trim());
      query += ' AND type = ANY($2)';
      values.push(types);
    }

    query += ` ORDER BY transaction_date DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * =========================================================
   * FIND TRANSACTIONS BY TYPE (used by filter routes)
   * =========================================================
   */
  static async findByType(portfolioId, types) {
    const query = `
      SELECT *
      FROM transactions
      WHERE portfolio_id = $1
        AND type = ANY($2)
      ORDER BY transaction_date DESC
    `;
    try {
      const { rows } = await pool.query(query, [portfolioId, types]);
      return rows;
    } catch (error) {
      console.error('Error in Transaction.findByType:', error);
      throw error;
    }
  }

  /**
   * =========================================================
   * FIND TRANSACTION BY ID
   * =========================================================
   */
  static async findById(transactionId) {
    const query = 'SELECT * FROM transactions WHERE id = $1';
    const result = await pool.query(query, [transactionId]);
    return result.rows[0];
  }

  /**
   * =========================================================
   * UPDATE TRANSACTION (safe for generated columns)
   * =========================================================
   */
  static async update(transactionId, updateData) {
    const { quantity, price, transactionDate } = updateData;

    const query = `
      UPDATE transactions
      SET quantity = $1, price = $2, transaction_date = $3
      WHERE id = $4
      RETURNING *
    `;

    const result = await pool.query(query, [quantity, price, toValidDate(transactionDate), transactionId]);
    return result.rows[0];
  }

  /**
   * =========================================================
   * DELETE TRANSACTION
   * =========================================================
   */
  static async delete(transactionId) {
    await pool.query('DELETE FROM transactions WHERE id = $1', [transactionId]);
    return true;
  }

  /**
   * Delete all transactions for a specific exchange connection
   */
  static async deleteByConnectionId(connectionId) {
    console.log(`[Transaction.deleteByConnectionId] Attempting to delete transactions for connection: ${connectionId}`);
    try {
      const result = await pool.query(
        'DELETE FROM transactions WHERE connection_id = $1 RETURNING id',
        [connectionId]
      );
      console.log(`[Transaction.deleteByConnectionId] Successfully deleted ${result.rowCount} transactions`);
      console.log('[Transaction.deleteByConnectionId] Deleted transaction IDs:', result.rows.map(r => r.id));
      return result.rowCount;
    } catch (error) {
      console.error('[Transaction.deleteByConnectionId] Error deleting transactions:', error);
      throw error;
    }
  }
}

module.exports = Transaction;
