const pool = require('../../shared/database');

class ManualHolding {
  /**
   * Create or update a manual holding
   */
  static async upsert(portfolioId, assetSymbol, quantity, averageCost = null, notes = '') {
    const result = await pool.query(
      `INSERT INTO manual_holdings (portfolio_id, asset_symbol, quantity, average_cost, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (portfolio_id, asset_symbol)
       DO UPDATE SET
         quantity = EXCLUDED.quantity,
         average_cost = EXCLUDED.average_cost,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [portfolioId, assetSymbol.toUpperCase(), quantity, averageCost, notes]
    );
    return result.rows[0];
  }

  /**
   * Get all manual holdings for a portfolio
   */
  static async getByPortfolioId(portfolioId) {
    const result = await pool.query(
      `SELECT * FROM manual_holdings
       WHERE portfolio_id = $1
       ORDER BY asset_symbol ASC`,
      [portfolioId]
    );
    return result.rows;
  }

  /**
   * Get a specific manual holding
   */
  static async getBySymbol(portfolioId, assetSymbol) {
    const result = await pool.query(
      `SELECT * FROM manual_holdings
       WHERE portfolio_id = $1 AND asset_symbol = $2`,
      [portfolioId, assetSymbol.toUpperCase()]
    );
    return result.rows[0];
  }

  /**
   * Delete a manual holding
   */
  static async delete(portfolioId, assetSymbol) {
    const result = await pool.query(
      `DELETE FROM manual_holdings
       WHERE portfolio_id = $1 AND asset_symbol = $2
       RETURNING *`,
      [portfolioId, assetSymbol.toUpperCase()]
    );
    return result.rows[0];
  }

  /**
   * Delete all manual holdings for a portfolio
   */
  static async deleteByPortfolioId(portfolioId) {
    const result = await pool.query(
      `DELETE FROM manual_holdings
       WHERE portfolio_id = $1
       RETURNING id`,
      [portfolioId]
    );
    return result.rowCount;
  }
}

module.exports = ManualHolding;
