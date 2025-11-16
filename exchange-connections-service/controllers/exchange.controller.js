const ExchangeConnection = require('../models/exchangeConnection.model');
const Transaction = require('../models/transaction.model');
const BinanceService = require('../services/binance.service');
const BitgetService = require('../services/bitget.service');
const ExchangeFactory = require('../services/exchangeFactory.service');
const PortfolioService = require('../services/portfolio.service');

class ExchangeController {
  /**
   * =========================================================
   * CONNECT EXCHANGE
   * =========================================================
   */
  static async connectExchange(req, res) {
    try {
      const { exchange, apiKey, apiSecret, passphrase, portfolioId } = req.body;
      const userId = req.user.id;

      if (!exchange || !apiKey || !apiSecret || !portfolioId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Reject if API key already used (any user) for this exchange
      const apiKeyHash = ExchangeConnection.hashApiKey(apiKey);
      const existing = await ExchangeConnection.findByApiKeyHash(exchange, apiKeyHash);
      if (existing) {
        const sameUser = existing.user_id === userId;
        const msg = sameUser
          ? 'This API key is already connected in your account.'
          : 'This API key is already connected by another account.';
        return res.status(409).json({ error: 'Duplicate API key', details: msg });
      }

      // Check if passphrase is required for this exchange
      if (ExchangeFactory.requiresPassphrase(exchange) && !passphrase) {
        return res.status(400).json({
          error: `Passphrase required for ${exchange}`,
          details: `${exchange} requires a passphrase to connect. Please provide your API passphrase.`
        });
      }

      // Test API connection before saving using ExchangeFactory
      const service = ExchangeFactory.createService(exchange, apiKey, apiSecret, passphrase);
      const testResult = await service.testConnection();

      if (!testResult.success) {
        return res.status(400).json({
          error: 'Failed to connect to exchange',
          details: testResult.message
        });
      }

      // Save verified connection
      const connection = await ExchangeConnection.create({
        userId,
        portfolioId,
        exchange,
        apiKey,
        apiSecret,
        passphrase
      });

      res.status(201).json({ connection });
    } catch (error) {
      console.error('Connect exchange error:', error);
      // Handle Postgres unique violation
      if (error && error.code === '23505') {
        return res.status(409).json({ error: 'Duplicate API key', details: 'This API key is already connected.' });
      }
      res.status(500).json({ error: 'Failed to connect exchange', details: error.message });
    }
  }

  /**
   * =========================================================
   * GET ALL USER CONNECTIONS
   * =========================================================
   */
  static async getConnections(req, res) {
    try {
      const userId = req.user.id;
      const connections = await ExchangeConnection.findByUserId(userId);
      res.json({ connections });
    } catch (error) {
      console.error('Get connections error:', error);
      res.status(500).json({ error: 'Failed to fetch connections' });
    }
  }

  /**
   * =========================================================
   * DISCONNECT EXCHANGE
   * =========================================================
   */
  static async disconnectExchange(req, res) {
    try {
      const { connectionId } = req.params;
      console.log(`[Disconnect] Starting disconnect for connection: ${connectionId}`);

      const connection = await ExchangeConnection.findById(connectionId);

      if (!connection) {
        console.log(`[Disconnect] Connection not found: ${connectionId}`);
        return res.status(404).json({ error: 'Connection not found' });
      }

      const portfolioId = connection.portfolio_id;
      console.log(`[Disconnect] Connection belongs to portfolio: ${portfolioId}`);

      // Step 1: Manually delete all transactions from this exchange connection
      const deletedCount = await Transaction.deleteByConnectionId(connectionId);
      console.log(`[Disconnect] Deleted ${deletedCount} transactions for connection ${connectionId}`);

      // Step 2: Delete the exchange connection (CASCADE will also delete any remaining transactions)
      await ExchangeConnection.delete(connectionId);
      console.log(`[Disconnect] Deleted connection ${connectionId}`);

      // Step 3: Recalculate holdings after removing exchange data
      // This will rebuild holdings from remaining transactions + manual holdings
      console.log(`[Disconnect] Recalculating holdings for portfolio ${portfolioId}`);
      await PortfolioService.recalculateHoldings(portfolioId);
      console.log(`[Disconnect] Successfully recalculated holdings for portfolio ${portfolioId}`);

      res.json({
        message: 'Exchange disconnected and all related data removed successfully',
        transactionsDeleted: deletedCount,
        portfolioId
      });
    } catch (error) {
      console.error('Disconnect exchange error:', error);
      res.status(500).json({ error: 'Failed to disconnect exchange', details: error.message });
    }
  }

  /**
   * =========================================================
   * SYNC EXCHANGE (UPDATED)
   * =========================================================
   */

  static async syncExchange(req, res) {
    try {
      const { connectionId } = req.params;
      const connection = await ExchangeConnection.findById(connectionId);

      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      // Create exchange service using ExchangeFactory
      const service = ExchangeFactory.createService(
        connection.exchange,
        connection.apiKey,
        connection.apiSecret,
        connection.passphrase
      );

      // Fetch transactions from 2017 (when most crypto exchanges started) to capture full cost basis
      // This is critical for accurate average cost calculation
      const since = new Date('2017-01-01').getTime();

      const transactions = await service.fetchAllTransactions(since);

      // Inside syncExchange() mapping section
      const transactionData = transactions.map(t => {
        const transactionDate = t.transactionDate || t.date || (t.timestamp ? new Date(t.timestamp) : null);

        if (!transactionDate) {
          console.warn(`Missing transaction date for ${t.type} ${t.symbol || t.asset}:`, t);
          return null; // Skip this transaction
        }

        if (!(transactionDate instanceof Date) || isNaN(transactionDate.getTime())) {
          console.warn(`Invalid transaction date "${transactionDate}" for ${t.type} ${t.symbol || t.asset}`);
          return null; // Skip this transaction
        }

        const base = {
          portfolioId: connection.portfolio_id,
          connectionId, // Add connection_id here
          exchange: connection.exchange,
          transactionDate
        };
        // Conversions
        if (t.type === 'convert' || t.exchangeType === 'convert') {
          return {
            ...base,
            type: 'convert',
            symbol: t.toAsset,
            assetId: t.toAsset,
            quantity: t.toQuantity,
            price: t.price || 0, // Use calculated price per unit
            fee: 0,
            orderId: t.orderId,
            tradeId: t.quoteId,
            quoteAsset: t.fromAsset,
            quoteQuantity: t.fromQuantity,
            conversionRate: t.conversionRate
          };
        }

        // Spot trades
        if (t.type === 'buy' || t.type === 'sell' || t.exchangeType === 'trade') {
          return {
            ...base,
            type: t.type,
            assetId: t.asset || t.assetId || t.symbol,
            symbol: t.asset || t.symbol,
            quantity: t.qty || t.quantity,
            price: t.price,
            fee: t.fee || 0,
            feeCurrency: t.feeCurrency || t.quoteAsset,
            orderId: t.orderId,
            tradeId: t.tradeId
          };
        }
        // Deposits / Withdrawals
        if (t.type === 'deposit' || t.type === 'withdraw' || t.exchangeType === 'wallet') {
          return {
            ...base,
            type: t.type,
            symbol: t.symbol,
            assetId: t.asset,
            quantity: t.quantity,
            price: 0,
            fee: t.fee || 0,
            feeCurrency: t.feeCurrency,
            tradeId: t.txid,
            walletAddress: t.walletAddress || null,
            network: t.network || null
          };
        }

        return null;
      }).filter(Boolean);

      // Insert into DB
      await Transaction.bulkCreate(transactionData);

      // Update sync status
      await ExchangeConnection.updateSyncStatus(
        connectionId,
        'success',
        transactionData.length
      );

      // Recalculate holdings
      await PortfolioService.recalculateHoldings(connection.portfolio_id);

      // Build breakdown summary
      const breakdown = {
        total: transactionData.length,
        spotTrades: transactionData.filter(t => ['buy', 'sell'].includes(t.type)).length,
        deposits: transactionData.filter(t => t.type === 'deposit').length,
        withdrawals: transactionData.filter(t => t.type === 'withdraw').length,
        conversions: transactionData.filter(t => t.type === 'convert').length,
        transfers: transactionData.filter(t => t.type === 'transfer').length
      };

      res.json({
        syncJob: {
          status: 'success',
          transactionsSynced: transactionData.length,
          breakdown,
          syncedAt: new Date()
        }
      });
    } catch (error) {
      console.error('Sync exchange error:', error);

      if (req.params.connectionId) {
        await ExchangeConnection.updateSyncStatus(
          req.params.connectionId,
          'error',
          0,
          error.message
        );
      }

      res.status(500).json({
        error: 'Failed to sync exchange',
        details: error.message
      });
    }
  }

  /**
   * =========================================================
   * GET SYNC STATUS
   * =========================================================
   */
  static async getSyncStatus(req, res) {
    try {
      const { connectionId } = req.params;
      const status = await ExchangeConnection.getSyncStatus(connectionId);
      res.json(status);
    } catch (error) {
      console.error('Get sync status error:', error);
      res.status(500).json({ error: 'Failed to fetch sync status' });
    }
  }

  /**
   * GET LIVE SPOT BALANCES (NO PRICES)
   * - Returns user's real spot assets with free/locked/total
   * - Also syncs these balances to holdings table for avg cost tracking
   */
  static async getBalances(req, res) {
    try {
      const { connectionId } = req.params;
      const connection = await ExchangeConnection.findById(connectionId);
      if (!connection) return res.status(404).json({ error: 'Connection not found' });

      // Use ExchangeFactory to support all exchanges
      const service = ExchangeFactory.createService(
        connection.exchange,
        connection.apiKey,
        connection.apiSecret,
        connection.passphrase
      );

      const balances = await service.fetchBalance();

      // Sync balances to holdings table (preserve avg cost if exists, fetch current prices)
      const Holding = require('../models/holding.model');
      const PortfolioService = require('../services/portfolio.service');

      // Get current prices for all assets
      const assetSymbols = balances
        .filter(b => b.total && b.total > 0)
        .map(b => b.asset);

      const currentPrices = await PortfolioService.fetchLivePrices(assetSymbols, 'usd');

      // Get all holdings for this portfolio to get average costs
      const allHoldings = await Holding.findByPortfolioId(connection.portfolio_id);
      const holdingsMap = {};
      for (const h of allHoldings) {
        const sym = String(h.asset_symbol || h.symbol || h.asset_id || '').toUpperCase();
        holdingsMap[sym] = h;
        // Also map by the original asset_symbol as stored (case-insensitive matching)
        if (h.asset_symbol) {
          holdingsMap[String(h.asset_symbol).toUpperCase()] = h;
        }
      }

      console.log('[getBalances] Holdings map keys:', Object.keys(holdingsMap));

      // Update holdings table with new balances and prices
      for (const balance of balances) {
        if (balance.total && balance.total > 0) {
          const existing = await Holding.findByPortfolioAndAsset(
            connection.portfolio_id,
            balance.asset
          );

          const assetSymbol = String(balance.asset || '').toUpperCase();
          const priceData = currentPrices[assetSymbol] || null;
          // Extract just the price number from {price, change24h} object
          const currentPrice = priceData?.price || priceData || null;

          const holdingData = {
            portfolioId: connection.portfolio_id,
            assetId: balance.asset,
            symbol: balance.asset,
            totalQuantity: balance.total,
            averageCost: existing?.average_cost || 0,
            totalInvested: existing?.total_invested || 0,
            currentPrice,
            lastUpdated: new Date()
          };

          await Holding.upsert(holdingData);
        }
      }

      // Build result with prices directly from backend API (no DB fallbacks)
      const result = balances
        .filter(b => (b.total || 0) > 0)
        .sort((a, b) => (b.total || 0) - (a.total || 0))
        .map(b => {
          const assetSymbol = String(b.asset || b.symbol || '').toUpperCase();

          // Price comes directly from backend API call (no fallbacks)
          const price = currentPrices[assetSymbol] || null;
          // Average cost from holdings table if exists
          const holding = holdingsMap[assetSymbol];
          const avgCost = holding?.average_cost != null && holding.average_cost > 0 ? holding.average_cost : null;

          // Debug logging
          if (!holding) {
            console.log(`[getBalances] No holding found for ${assetSymbol} (balance asset: ${b.asset})`);
          } else if (!avgCost) {
            console.log(`[getBalances] Holding found for ${assetSymbol} but average_cost is ${holding.average_cost}`);
          }

          // Extract price and 24h change from backend API
          const priceData = price; // price variable already exists
          const actualPrice = priceData?.price || priceData || null;
          const change24h = priceData?.change24h || null;

          return {
            asset: b.asset || b.symbol,
            free: Number(b.free) || 0,
            locked: Number(b.locked) || 0,
            total: Number(b.total) || 0,
            currentPrice: actualPrice, // Direct from backend API - null if not available
            change24h, // 24h price change percentage
            averageCost: avgCost // From DB holdings - null if not available or 0
          };
        });

      res.json({ connectionId, exchange: connection.exchange, balances: result, count: result.length });
    } catch (error) {
      console.error('Get balances error:', error);
      res.status(500).json({ error: 'Failed to fetch balances', details: error.message });
    }
  }

  /**
   * =========================================================
   * GET AVERAGE PRICES (BINANCE)
   * - Calculates average purchase price for each coin based on buy transactions
   * =========================================================
   */
  static async getAveragePrices(req, res) {
    try {
      const { connectionId } = req.params;
      const connection = await ExchangeConnection.findById(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      if (connection.exchange !== 'binance') {
        return res.status(400).json({
          error: 'Average price calculation is only available for Binance accounts'
        });
      }

      const service = new BinanceService(connection.apiKey, connection.apiSecret, {
        region: process.env.BINANCE_REGION || 'global',
        recvWindow: Number(process.env.BINANCE_RECV_WINDOW || 60000),
        timeout: Number(process.env.BINANCE_TIMEOUT || 30000)
      });

      // **** FIX: Renamed function to match the new service method ****
      const portfolioStats = await service.fetchPortfolioWithStats();

      res.json({
        connectionId,
        exchange: connection.exchange,
        // **** FIX: Send the new stats object ****
        averagePrices: portfolioStats,
        count: portfolioStats.length,
        calculatedAt: new Date()
      });
    } catch (error) {
      console.error('Get average prices error:', error);
      res.status(500).json({
        error: 'Failed to calculate average prices',
        details: error.message
      });
    }
  }

  /**
   * =========================================================
   * GET BREAKEVEN PRICES (BITGET)
   * - Calculates breakeven price for each coin including fees
   * =========================================================
   */
  static async getBreakevenPrices(req, res) {
    try {
      const { connectionId } = req.params;
      const connection = await ExchangeConnection.findById(connectionId);

      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      if (connection.exchange !== 'bitget') {
        return res.status(400).json({
          error: 'Breakeven price calculation is only available for Bitget accounts'
        });
      }

      const service = new BitgetService(
        connection.apiKey,
        connection.apiSecret,
        connection.passphrase
      );

      // **** FIX: Renamed function to match the new service method (assuming BitgetService has the same) ****
      const portfolioStats = await service.fetchPortfolioWithStats();

      res.json({
        connectionId,
        exchange: connection.exchange,
        // **** FIX: Send the new stats object ****
        breakevenPrices: portfolioStats,
        count: portfolioStats.length,
        calculatedAt: new Date()
      });
    } catch (error) {
      console.error('Get breakeven prices error:', error);
      res.status(500).json({
        error: 'Failed to calculate breakeven prices',
        details: error.message
      });
    }
  }

  /**
   * =========================================================
   * GET SUPPORTED EXCHANGES
   * =========================================================
   */
  static async getSupportedExchanges(req, res) {
    try {
      const ExchangeFactory = require('../services/exchangeFactory.service');
      const exchanges = ExchangeFactory.getSupportedExchanges();
      res.json({ exchanges });
    } catch (error) {
      console.error('Get supported exchanges error:', error);
      res.status(500).json({
        error: 'Failed to fetch supported exchanges',
        details: error.message
      });
    }
  }
}

module.exports = ExchangeController;
