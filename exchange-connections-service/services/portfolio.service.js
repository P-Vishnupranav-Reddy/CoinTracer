const axios = require('axios');
const BinanceService = require('./binance.service');
const BitgetService = require('./bitget.service');
const ExchangeConnection = require('../models/exchangeConnection.model');
const Holding = require('../models/holding.model');
const Transaction = require('../models/transaction.model');
const config = require('../config/config');

/**
 * PortfolioService
 * Handles portfolio synchronization, P&L calculation, asset allocation, and breakdowns.
 */
class PortfolioService {
  /**
   * Fetch live prices and 24h changes in batch from market-data-service
   * @param {string[]} assets - array of asset symbols (e.g., ['BTC','ETH'])
   * @param {string} vs - quote currency, default 'usd'
   * @returns {Promise<Record<string, {price: number, change24h: number}>>} map of SYMBOL -> {price, change24h}
   */
  static async fetchLivePrices(assets = [], vs = 'usd') {
    try {
      const list = Array.from(new Set((assets || []).filter(Boolean)));
      if (!list.length) return {};
      const base = config.marketDataServiceUrl?.replace(/\/$/, '') || 'http://localhost:5001/api/v1';
      const url = `${base}/market/prices/batch`;
      const { data } = await axios.get(url, {
        params: { assets: list.join(','), vs: String(vs).toLowerCase() },
        timeout: config.apiTimeout || 30000
      });
      const out = {};
      const rows = data?.data || [];

      // Create a map of requested symbols (uppercase) for matching
      const requestedMap = {};
      for (const asset of list) {
        const key = String(asset).toUpperCase();
        requestedMap[key] = true;
      }

      for (const r of rows) {
        // Use symbol first (matches what we requested), then assetId as fallback
        const symbolKey = String(r.symbol || '').toUpperCase();
        const assetIdKey = String(r.assetId || '').toUpperCase();

        // Debug: log what we received
        console.log(`[Price Response] symbol="${r.symbol}", assetId="${r.assetId}", price=${r.price}, change24h=${r.change24h}`);

        const priceData = {
          price: Number(r.price) || 0,
          change24h: Number(r.change24h) || 0
        };

        if (symbolKey && Number.isFinite(priceData.price)) {
          // Map by symbol (what we requested) - this is the primary key
          out[symbolKey] = priceData;
          console.log(`[Price Mapped] ${symbolKey}: $${priceData.price} (${priceData.change24h > 0 ? '+' : ''}${priceData.change24h}%)`);
        }

        // Also map by assetId if it matches a requested symbol (for aliases like "ETHEREUM" -> "ETH")
        if (assetIdKey && assetIdKey !== symbolKey && requestedMap[assetIdKey] && Number.isFinite(priceData.price)) {
          out[assetIdKey] = priceData;
          console.log(`[Price Mapped] ${assetIdKey} (via assetId): $${priceData.price}`);
        }
      }

      console.log(`[fetchLivePrices] Fetched ${Object.keys(out).length} prices for ${list.length} requested assets`);
      return out;
    } catch (err) {
      // Graceful fallback: no prices
      return {};
    }
  }

  /**
   * =========================================================
   * PORTFOLIO CALCULATION & PNL
   * =========================================================
   */
  static async calculatePortfolioWithPnL(portfolioId, currentPrices = {}) {
    const holdings = await Holding.findByPortfolioId(portfolioId);

    let totalValue = 0;
    let totalInvested = 0;
    let totalUnrealizedPnL = 0;

    const enrichedHoldings = holdings.map(holding => {
      const sym = String(holding.asset_symbol || holding.symbol || holding.asset_id || '').toUpperCase();
      // Use live price, fallback to stored current_price, then average_cost
      const livePriceData = currentPrices[sym] || currentPrices[holding.asset_id];
      const livePrice = livePriceData?.price || livePriceData; // Handle both old number format and new object format
      const change24h = livePriceData?.change24h || null;
      const storedPrice = holding.current_price;
      const currentPrice = livePrice || storedPrice || holding.average_cost;

      const totalQuantity = parseFloat(holding.total_quantity);
      const invested = parseFloat(holding.total_invested);
      const currentValue = totalQuantity * currentPrice;
      const unrealizedPnL = currentValue - invested;
      const pnlPercentage = invested > 0 ? (unrealizedPnL / invested) * 100 : 0;

      totalValue += currentValue;
      totalInvested += invested;
      totalUnrealizedPnL += unrealizedPnL;

      return {
        id: holding.id,
        portfolio_id: holding.portfolio_id,
        asset_symbol: holding.asset_symbol || holding.symbol,
        total_quantity: totalQuantity,
        average_cost: parseFloat(holding.average_cost),
        total_invested: invested,
        current_price: currentPrice,
        change_24h: change24h,
        current_value: currentValue.toFixed(2),
        unrealized_pnl: unrealizedPnL.toFixed(2),
        pnl_percentage: pnlPercentage.toFixed(2),
        pnl_color: unrealizedPnL >= 0 ? 'success' : 'error',
        last_updated: holding.last_updated
      };
    });

    return {
      holdings: enrichedHoldings,
      summary: {
        totalValue: totalValue.toFixed(2),
        totalInvested: totalInvested.toFixed(2),
        totalUnrealizedPnL: totalUnrealizedPnL.toFixed(2),
        totalPnLPercentage:
          totalInvested > 0
            ? ((totalUnrealizedPnL / totalInvested) * 100).toFixed(2)
            : '0.00',
        pnlColor: totalUnrealizedPnL >= 0 ? 'success' : 'error',
        assetCount: holdings.length,
        pricesLive: Object.keys(currentPrices).length > 0
      }
    };
  }

  /**
   * =========================================================
   * CORE PORTFOLIO METRICS
   * =========================================================
   */
  static async calculatePortfolioMetrics(portfolioId, currentPrices = {}) {
    const holdings = await Holding.findByPortfolioId(portfolioId);

    let totalValue = 0;
    let totalInvested = 0;
    let totalPnL = 0;

    const enrichedHoldings = holdings.map(holding => {
      const sym = String(holding.asset_symbol || holding.symbol || holding.asset_id || '').toUpperCase();
      // Use live price, fallback to stored current_price, then average_cost
      const livePriceData = currentPrices[sym] || currentPrices[holding.asset_id];
      const livePrice = livePriceData?.price || livePriceData;
      const change24h = livePriceData?.change24h || null;
      const storedPrice = holding.current_price;
      const currentPrice = livePrice || storedPrice || holding.average_cost;
      const currentValue = holding.total_quantity * currentPrice;
      const unrealizedPnL = currentValue - holding.total_invested;
      const pnlPercentage =
        holding.total_invested > 0
          ? (unrealizedPnL / holding.total_invested) * 100
          : 0;

      totalValue += currentValue;
      totalInvested += parseFloat(holding.total_invested);
      totalPnL += unrealizedPnL;

      return {
        ...holding,
        currentPrice,
        change24h,
        currentValue,
        unrealizedPnL,
        pnlPercentage: pnlPercentage.toFixed(2)
      };
    });

    return {
      holdings: enrichedHoldings,
      totalValue: totalValue.toFixed(2),
      totalInvested: totalInvested.toFixed(2),
      totalPnL: totalPnL.toFixed(2),
      totalPnLPercentage:
        totalInvested > 0
          ? ((totalPnL / totalInvested) * 100).toFixed(2)
          : '0.00'
    };
  }

  /**
   * =========================================================
   * PORTFOLIO ALLOCATION (PERCENTAGE)
   * =========================================================
   */
  static async calculateAllocation(portfolioId, currentPrices = {}) {
    const holdings = await Holding.findByPortfolioId(portfolioId);

    let totalValue = 0;
    holdings.forEach(h => {
      const sym = String(h.asset_symbol || h.symbol || h.asset_id || '').toUpperCase();
      // Use live price, fallback to stored current_price, then average_cost
      const livePriceData = currentPrices[sym] || currentPrices[h.asset_id];
      const livePrice = livePriceData?.price || livePriceData;
      const storedPrice = h.current_price;
      const price = livePrice || storedPrice || h.average_cost;
      totalValue += h.total_quantity * price;
    });

    const allocation = holdings
      .map(holding => {
        const sym = String(holding.asset_symbol || holding.symbol || holding.asset_id || '').toUpperCase();
        // Use live price, fallback to stored current_price, then average_cost
        const livePriceData = currentPrices[sym] || currentPrices[holding.asset_id];
        const livePrice = livePriceData?.price || livePriceData;
        const storedPrice = holding.current_price;
        const price = livePrice || storedPrice || holding.average_cost;
        const value = holding.total_quantity * price;
        const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;

        return {
          assetId: holding.asset_id,
          symbol: holding.symbol,
          value: value.toFixed(2),
          percentage: percentage.toFixed(2)
        };
      })
      .sort((a, b) => b.percentage - a.percentage);

    return { allocation, totalValue: totalValue.toFixed(2) };
  }

  /**
   * =========================================================
   * HOLDING DETAIL VIEW (REALIZED & UNREALIZED PNL)
   * =========================================================
   */
  static async getHoldingDetails(portfolioId, assetId, currentPrice = null) {
    const holding = await Holding.findByPortfolioAndAsset(portfolioId, assetId);
    if (!holding) throw new Error('Holding not found');

    const price = currentPrice || holding.average_cost;
    const currentValue = holding.total_quantity * price;
    const unrealizedPnL = currentValue - holding.total_invested;

    const allTransactions = await Transaction.findByPortfolioId(portfolioId);
    const assetTransactions = allTransactions.filter(
      t => t.asset_id === assetId
    );

    let realizedPnL = 0;
    assetTransactions.forEach(txn => {
      if (txn.type === 'sell') {
        const sellProceeds = txn.total_value;
        const costBasis = txn.quantity * holding.average_cost;
        realizedPnL += sellProceeds - costBasis;
      }
    });

    return {
      assetId: holding.asset_id,
      symbol: holding.symbol,
      totalQuantity: holding.total_quantity,
      averageCost: holding.average_cost,
      currentPrice: price,
      currentValue: currentValue.toFixed(2),
      unrealizedPnL: unrealizedPnL.toFixed(2),
      realizedPnL: realizedPnL.toFixed(2),
      totalPnL: (unrealizedPnL + realizedPnL).toFixed(2)
    };
  }

  /**
   * =========================================================
   * PORTFOLIO SYNC FROM EXCHANGE
   * =========================================================
   */
  static async syncPortfolioFromExchange(connectionId) {
    const connection = await ExchangeConnection.findById(connectionId);
    if (!connection) throw new Error('Exchange connection not found');

    let service;
    if (connection.exchange === 'binance') {
      service = new BinanceService(connection.apiKey, connection.apiSecret);
    } else if (connection.exchange === 'bitget') {
      service = new BitgetService(
        connection.apiKey,
        connection.apiSecret,
        connection.passphrase
      );
    } else {
      throw new Error('Unsupported exchange');
    }

    const portfolio = await service.fetchPortfolio();

    // Update holdings based on new balances
    for (const asset of portfolio) {
      if (asset.total > 0) {
        const existing = await Holding.findByPortfolioAndAsset(
          connection.portfolio_id,
          asset.asset
        );

        const holdingData = {
          portfolioId: connection.portfolio_id,
          assetId: asset.asset,
          symbol: asset.symbol,
          totalQuantity: asset.total,
          averageCost: existing?.average_cost || 0,
          totalInvested: existing?.total_invested || 0,
          depositAddress: asset.depositAddress || null,
          network: asset.network || null,
          lastUpdated: new Date()
        };

        await Holding.upsert(holdingData);
      }
    }

    return {
      portfolio,
      syncedAssets: portfolio.length,
      timestamp: new Date()
    };
  }

  /**
   * =========================================================
   * TRANSACTION BREAKDOWN
   * =========================================================
   */
  static async getTransactionBreakdown(portfolioId) {
    const allTransactions = await Transaction.findByPortfolioId(
      portfolioId,
      10000,
      0
    );

    const breakdown = {
      total: allTransactions.length,
      buy: allTransactions.filter(t => t.type === 'buy').length,
      sell: allTransactions.filter(t => t.type === 'sell').length,
      deposit: allTransactions.filter(t => t.type === 'deposit').length,
      withdraw: allTransactions.filter(t => t.type === 'withdraw').length,
      convert: allTransactions.filter(t => t.type === 'convert').length,
      transfer: allTransactions.filter(t => t.type === 'transfer').length
    };

    return breakdown;
  }

  /**
   * =========================================================
   * HOLDING RECALCULATION
   * =========================================================
   */
  static async recalculateHoldings(portfolioId) {
    console.log(`[PortfolioService.recalculateHoldings] Starting recalculation for portfolio: ${portfolioId}`);
    try {
      const result = await Holding.recalculateFromTransactions(portfolioId);
      console.log(`[PortfolioService.recalculateHoldings] Successfully recalculated holdings for portfolio: ${portfolioId}`);
      return result;
    } catch (error) {
      console.error('[PortfolioService.recalculateHoldings] Error recalculating holdings:', error);
      throw error;
    }
  }

}

module.exports = PortfolioService;
