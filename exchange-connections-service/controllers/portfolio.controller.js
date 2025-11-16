const Portfolio = require('../models/portfolio.model');
const Transaction = require('../models/transaction.model');
const Holding = require('../models/holding.model');
const User = require('../models/user.model');
const { stringify } = require('csv-stringify/sync');
const PortfolioService = require('../services/portfolio.service');
const ExchangeConnection = require('../models/exchangeConnection.model');

// Safe number coercion helper
function n(v, def = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

class PortfolioController {
  /**
   * Create new portfolio
   * - Handles both authenticated and mock users
   * - Prevents non-string `name` errors
   */
  static async createPortfolio(req, res) {
    try {
      let { name, description } = req.body;

      // Validate user authentication
      let userId = req.user?.id;
      if (!userId) {
        console.error('No user ID in request');
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Validate portfolio name
      if (typeof name !== 'string') {
        console.warn('Invalid portfolio name type:', typeof name, name);
        name = String(name || '').trim();
      }

      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Portfolio name is required and must be a string.' });
      }

      // Ensure user exists or create automatically
      const user = await User.findById(userId);
      if (!user) {
        console.warn('User not found in DB, attempting to create:', req.user.email);
        const newUser = await User.findOrCreate(req.user.email, req.user.name);
        userId = newUser.id;
      }

      console.log(`Creating portfolio '${name}' for user:`, userId);

      // Create portfolio
      const portfolio = await Portfolio.create(userId, name.trim(), description || null);

      console.log('Portfolio created successfully:', portfolio);

      res.status(201).json({
        portfolio,
        message: 'Portfolio created successfully'
      });
    } catch (error) {
      console.error('Create portfolio error:', error);
      res.status(500).json({
        error: 'Failed to create portfolio',
        details: error.message
      });
    }
  }

  /**
   * Get all user portfolios
   */
  static async getPortfolios(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const portfolios = await Portfolio.findByUserId(userId);

      res.json({
        portfolios,
        message: 'Retrieved all portfolios'
      });
    } catch (error) {
      console.error('Get portfolios error:', error);
      res.status(500).json({
        error: 'Failed to fetch portfolios',
        details: error.message
      });
    }
  }

  /**
   * Get a specific portfolio with holdings and summary
   */
  static async getPortfolio(req, res) {
    try {
      const { portfolioId } = req.params;

      const portfolio = await Portfolio.findById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      const holdings = await Holding.findByPortfolioId(portfolioId);
      const symbols = holdings.map(h => h.asset_symbol || h.symbol || h.asset_id).filter(Boolean);
      const livePrices = await PortfolioService.fetchLivePrices(symbols, 'usd');

      let totalValue = 0; let totalInvested = 0; let totalPnL = 0;
      const enrichedHoldings = holdings.map(h => {
        const qty = n(h.total_quantity);
        const avgCost = n(h.average_cost);
        const invested = n(h.total_invested);
        const sym = String(h.asset_symbol || h.symbol || h.asset_id || '').toUpperCase();
        // Get live price, fallback to stored current_price, then avgCost
        const livePrice = n(livePrices[sym]);
        const storedPrice = n(h.current_price);
        const currentPrice = livePrice || storedPrice || avgCost;
        const currentValue = qty * currentPrice;
        const unrealizedPnL = currentValue - invested;

        totalValue += currentValue;
        totalInvested += invested;
        totalPnL += unrealizedPnL;

        // Update current_price in holdings table if we got a new live price
        if (livePrice > 0 && livePrice !== storedPrice) {
          Holding.upsert({
            portfolioId: h.portfolio_id,
            assetId: h.asset_symbol || h.symbol,
            symbol: h.asset_symbol || h.symbol,
            totalQuantity: qty,
            averageCost: avgCost,
            totalInvested: invested,
            currentPrice: livePrice
          }).catch(err => console.error('Failed to update holding price:', err));
        }

        return {
          ...h,
          symbol: sym, // Ensure symbol is uppercase and consistent
          asset_symbol: sym, // Ensure asset_symbol is also set
          currentPrice,
          current_price: currentPrice, // Include both camelCase and snake_case for frontend compatibility
          currentValue: currentValue.toFixed(2),
          unrealizedPnL: unrealizedPnL.toFixed(2),
          pnlPercentage: invested > 0 ? ((unrealizedPnL / invested) * 100).toFixed(2) : 0
        };
      });

      res.json({
        portfolio,
        holdings: enrichedHoldings,
        summary: {
          totalValue: n(totalValue).toFixed(2),
          totalInvested: n(totalInvested).toFixed(2),
          totalPnL: n(totalPnL).toFixed(2),
          pnlPercentage:
            n(totalInvested) > 0 ? ((n(totalPnL) / n(totalInvested)) * 100).toFixed(2) : 0,
          assetCount: holdings.length,
          pricesLive: Object.keys(livePrices).length > 0,
          pricesFetchedCount: Object.keys(livePrices).length,
          pricesRequestedCount: symbols.length
        }
      });
    } catch (error) {
      console.error('Get portfolio error:', error);
      res.status(500).json({
        error: 'Failed to fetch portfolio',
        details: error.message
      });
    }
  }

  /**
   * Update portfolio name/description
   */
  static async updatePortfolio(req, res) {
    try {
      const { portfolioId } = req.params;
      let { name, description } = req.body;

      if (typeof name !== 'string') name = String(name || '').trim();

      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Portfolio name is required and must be a string.' });
      }

      const portfolio = await Portfolio.update(portfolioId, name.trim(), description || null);

      res.json({
        portfolio,
        message: 'Portfolio updated successfully'
      });
    } catch (error) {
      console.error('Update portfolio error:', error);
      res.status(500).json({
        error: 'Failed to update portfolio',
        details: error.message
      });
    }
  }

  /**
   * Delete a portfolio
   */
  static async deletePortfolio(req, res) {
    try {
      const { portfolioId } = req.params;

      // Check if portfolio exists
      const portfolio = await Portfolio.findById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      const result = await Portfolio.delete(portfolioId);

      res.json({
        message: 'Portfolio deleted successfully',
        deletedId: result.id
      });
    } catch (error) {
      console.error('Delete portfolio error:', error);
      res.status(500).json({
        error: 'Failed to delete portfolio',
        details: error.message
      });
    }
  }

  /**
   * Add manual transaction
   */
  static async addTransaction(req, res) {
    try {
      const { portfolioId } = req.params;
      const { type, symbol, quantity, price, date, fee = 0 } = req.body;

      if (!type || !symbol || !quantity || !price || !date) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const transactionData = {
        portfolioId,
        type,
        assetId: symbol,
        symbol,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        fee: parseFloat(fee),
        exchange: 'manual',
        transactionDate: new Date(date)
      };

      const transaction = await Transaction.create(transactionData);

      await Holding.recalculateFromTransactions(portfolioId);

      res.status(201).json({
        transaction,
        message: 'Transaction added successfully'
      });
    } catch (error) {
      console.error('Add transaction error:', error);
      res.status(500).json({
        error: 'Failed to add transaction',
        details: error.message
      });
    }
  }

  /**
   * Get transactions with optional filtering
   */
  static async getTransactions(req, res) {
    try {
      const { portfolioId } = req.params;
      const { limit = 50, offset = 0, type } = req.query;

      const transactions = await Transaction.findByPortfolioId(
        portfolioId,
        parseInt(limit),
        parseInt(offset),
        type
      );

      res.json({
        transactions,
        count: transactions.length
      });
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({
        error: 'Failed to fetch transactions',
        details: error.message
      });
    }
  }

  /**
   * Update transaction
   */
  static async updateTransaction(req, res) {
    try {
      const { portfolioId, transactionId } = req.params;
      const { quantity, price, date } = req.body;

      const updateData = {
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        transactionDate: new Date(date)
      };

      const transaction = await Transaction.update(transactionId, updateData);
      await Holding.recalculateFromTransactions(portfolioId);

      res.json({
        transaction,
        message: 'Transaction updated successfully'
      });
    } catch (error) {
      console.error('Update transaction error:', error);
      res.status(500).json({
        error: 'Failed to update transaction',
        details: error.message
      });
    }
  }

  /**
   * Delete transaction
   */
  static async deleteTransaction(req, res) {
    try {
      const { portfolioId, transactionId } = req.params;
      await Transaction.delete(transactionId);
      await Holding.recalculateFromTransactions(portfolioId);

      res.json({ message: 'Transaction deleted successfully' });
    } catch (error) {
      console.error('Delete transaction error:', error);
      res.status(500).json({
        error: 'Failed to delete transaction',
        details: error.message
      });
    }
  }

  /**
   * Get portfolio allocation
   */
  static async getAllocation(req, res) {
    try {
      const { portfolioId } = req.params;
      const holdings = await Holding.findByPortfolioId(portfolioId);
      const symbols = holdings.map(h => h.asset_symbol || h.symbol || h.asset_id).filter(Boolean);

      // Fetch live prices with timeout protection
      let livePrices = {};
      try {
        livePrices = await Promise.race([
          PortfolioService.fetchLivePrices(symbols, 'usd'),
          new Promise((resolve) => setTimeout(() => resolve({}), 55000)) // 55s timeout
        ]);
      } catch (err) {
        console.warn('[getAllocation] Failed to fetch live prices, using stored prices:', err.message);
        livePrices = {};
      }

      let totalValue = 0;
      const allocation = holdings.map(h => {
        const qty = n(h.total_quantity);
        const sym = String(h.asset_symbol || h.symbol || h.asset_id || '').toUpperCase();
        // Use live price, fallback to stored current_price, then average_cost
        const livePrice = n(livePrices[sym]);
        const storedPrice = n(h.current_price);
        const currentPrice = livePrice || storedPrice || n(h.average_cost);
        const value = qty * currentPrice;
        totalValue += value;
        return { symbol: sym, value };
      });

      const allocationWithPercentage = allocation.map(a => ({
        ...a,
        percentage: totalValue > 0 ? ((a.value / totalValue) * 100).toFixed(2) : 0
      })).sort((a, b) => Number(b.percentage) - Number(a.percentage));

      res.json({
        allocation: allocationWithPercentage,
        totalValue: n(totalValue).toFixed(2),
        pricesLive: Object.keys(livePrices).length > 0
      });
    } catch (error) {
      console.error('Get allocation error:', error);
      res.status(500).json({
        error: 'Failed to fetch allocation',
        details: error.message
      });
    }
  }

  /**
   * Export transactions to CSV
   */
  static async exportCSV(req, res) {
    try {
      const { portfolioId } = req.params;
      const transactions = await Transaction.findByPortfolioId(portfolioId, 10000);

      const csvData = transactions.map(t => ({
        Date: t.transaction_date,
        Type: t.type,
        Asset: t.symbol,
        Quantity: t.quantity,
        Price: t.price,
        'Total Value': t.total_value,
        Fee: t.fee,
        Exchange: t.exchange || 'Manual',
        'Wallet Address': t.wallet_address || '',
        Network: t.network || ''
      }));

      const csv = stringify(csvData, { header: true });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=portfolio-${portfolioId}-${Date.now()}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('Export CSV error:', error);
      res.status(500).json({
        error: 'Failed to export CSV',
        details: error.message
      });
    }
  }

  /**
   * =========================================================
   * GET TRANSACTIONS BY TYPE (buy/sell/deposit/withdraw/convert)
   * =========================================================
   */
  static async getTransactionsByType(req, res) {
    try {
      const { portfolioId } = req.params;
      const { type } = req.query;

      if (!type) {
        return res.status(400).json({ error: 'Transaction type is required' });
      }

      const types = type.split(',');
      const transactions = await Transaction.findByType(portfolioId, types);

      res.json({
        portfolioId,
        types,
        count: transactions.length,
        transactions
      });
    } catch (error) {
      console.error('Get transactions by type error:', error);
      res.status(500).json({ error: 'Failed to fetch transactions', details: error.message });
    }
  }

  /**
   * =========================================================
   * GET CONVERSION HISTORY
   * =========================================================
   */
  static async getConversionHistory(req, res) {
    try {
      const { portfolioId } = req.params;
      const conversions = await Transaction.findByType(portfolioId, ['convert']);

      res.json({
        portfolioId,
        count: conversions.length,
        conversions
      });
    } catch (error) {
      console.error('Get conversion history error:', error);
      res.status(500).json({ error: 'Failed to fetch conversion history', details: error.message });
    }
  }

  /**
   * =========================================================
   * GET SPOT TRADING HISTORY
   * =========================================================
   */
  static async getSpotTradingHistory(req, res) {
    try {
      const { portfolioId } = req.params;
      const spotTrades = await Transaction.findByType(portfolioId, ['buy', 'sell']);

      res.json({
        portfolioId,
        count: spotTrades.length,
        spotTrades
      });
    } catch (error) {
      console.error('Get spot trading history error:', error);
      res.status(500).json({ error: 'Failed to fetch spot trades', details: error.message });
    }
  }

  /**
   * =========================================================
   * GET PORTFOLIO WITH PNL SUMMARY
   * =========================================================
   */
  static async getPortfolioWithPnL(req, res) {
    try {
      const { portfolioId } = req.params;
      const portfolio = await Portfolio.findById(portfolioId);
      if (!portfolio) return res.status(404).json({ error: 'Portfolio not found' });

      // Fetch live prices and compute P&L using PortfolioService
      const holdings = await Holding.findByPortfolioId(portfolioId);
      const symbols = holdings.map(h => h.asset_symbol || h.symbol || h.asset_id).filter(Boolean);
      const livePrices = await PortfolioService.fetchLivePrices(symbols, 'usd');
      const { holdings: enrichedHoldings, summary } = await PortfolioService.calculatePortfolioWithPnL(portfolioId, livePrices);

      res.json({ portfolio, holdings: enrichedHoldings, summary: { ...summary, pricesLive: Object.keys(livePrices).length > 0 } });
    } catch (error) {
      console.error('Get portfolio with PnL error:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio PnL', details: error.message });
    }
  }

  /**
   * =========================================================
   * SYNC PORTFOLIO FROM EXCHANGE CONNECTION
   * =========================================================
   */
  static async syncPortfolio(req, res) {
    try {
      const { connectionId } = req.params;
      const connection = await ExchangeConnection.findById(connectionId);
      if (!connection) return res.status(404).json({ error: 'Connection not found' });

      await PortfolioService.recalculateHoldings(connection.portfolio_id);
      res.json({ message: 'Portfolio sync completed successfully' });
    } catch (error) {
      console.error('Sync portfolio error:', error);
      res.status(500).json({ error: 'Failed to sync portfolio', details: error.message });
    }
  }
}

module.exports = PortfolioController;
