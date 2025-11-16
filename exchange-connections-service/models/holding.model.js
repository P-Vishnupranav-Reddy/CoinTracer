const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Holding {
  static async upsert(holdingData) {
    const {
      portfolioId,
      assetId,
      symbol,
      totalQuantity,
      averageCost,
      totalInvested,
      currentPrice,
      depositAddress,
      network
    } = holdingData;

    try {
      // Note: holdings table uses asset_symbol, not asset_id
      // Check if holding exists
      const existingQuery = `
        SELECT id FROM holdings 
        WHERE portfolio_id = $1 AND asset_symbol = $2
      `;
      const existing = await pool.query(existingQuery, [portfolioId, symbol || assetId]);

      if (existing.rows.length > 0) {
        // Update existing
        const updateQuery = `
          UPDATE holdings 
          SET total_quantity = $1, average_cost = $2, total_invested = $3, 
              current_price = $4, deposit_address = $5, network = $6,
              last_updated = CURRENT_TIMESTAMP
          WHERE portfolio_id = $7 AND asset_symbol = $8
          RETURNING *
        `;
        const result = await pool.query(
          updateQuery,
          [totalQuantity, averageCost, totalInvested, currentPrice || null,
            depositAddress || null, network || null, portfolioId, symbol || assetId]
        );
        return result.rows[0];
      } else {
        // Insert new
        const id = uuidv4();
        const insertQuery = `
          INSERT INTO holdings (
            id, portfolio_id, asset_symbol, 
            total_quantity, average_cost, total_invested, current_price,
            deposit_address, network
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;
        const result = await pool.query(
          insertQuery,
          [id, portfolioId, symbol || assetId, totalQuantity, averageCost,
            totalInvested, currentPrice || null, depositAddress || null, network || null]
        );
        return result.rows[0];
      }
    } catch (error) {
      console.error('Holding upsert error:', error);
      throw error;
    }
  }

  static async findByPortfolioId(portfolioId) {
    const query = `
      SELECT * FROM holdings 
      WHERE portfolio_id = $1 
      ORDER BY total_invested DESC
    `;
    const result = await pool.query(query, [portfolioId]);
    return result.rows;
  }

  static async findByPortfolioAndAsset(portfolioId, assetSymbol) {
    const query = `
      SELECT * FROM holdings 
      WHERE portfolio_id = $1 AND asset_symbol = $2
    `;
    const result = await pool.query(query, [portfolioId, assetSymbol]);
    return result.rows[0];
  }

  static async recalculateFromTransactions(portfolioId) {
    try {
      const result = await pool.query(
        'SELECT * FROM recalculate_holdings_from_transactions($1)',
        [portfolioId]
      );
      return result.rows;
    } catch (error) {
      console.error('Recalculate holdings error:', error);
      throw error;
    }
  }
}

module.exports = Holding;
