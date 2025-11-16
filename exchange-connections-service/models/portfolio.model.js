const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Portfolio {
  static async create(userId, name) {
    const id = uuidv4();
    const query = `
      INSERT INTO portfolios (id, user_id, name)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [id, userId, name]);
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const query = 'SELECT * FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async findById(portfolioId) {
    const query = 'SELECT * FROM portfolios WHERE id = $1';
    const result = await pool.query(query, [portfolioId]);
    return result.rows[0];
  }

  static async update(portfolioId, name) {
    const query = `
      UPDATE portfolios 
      SET name = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [name, portfolioId]);
    return result.rows[0];
  }

  static async delete(portfolioId) {
    const query = 'DELETE FROM portfolios WHERE id = $1';
    await pool.query(query, [portfolioId]);
    return true;
  }

  static async getWithHoldings(portfolioId) {
    const portfolioQuery = 'SELECT * FROM portfolios WHERE id = $1';
    const holdingsQuery = 'SELECT * FROM holdings WHERE portfolio_id = $1';

    const [portfolioResult, holdingsResult] = await Promise.all([
      pool.query(portfolioQuery, [portfolioId]),
      pool.query(holdingsQuery, [portfolioId])
    ]);

    const portfolio = portfolioResult.rows[0];
    const holdings = holdingsResult.rows;

    return {
      portfolio,
      holdings,
      totalValue: holdings.reduce((sum, h) => sum + parseFloat(h.total_invested), 0)
    };
  }
}

module.exports = Portfolio;
