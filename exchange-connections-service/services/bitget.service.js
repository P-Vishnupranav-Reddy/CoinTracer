/**
 * BitgetService
 * Unified CCXT-based service for Bitget
 *
 * Features:
 *  - Fetch spot trade history
 *  - Fetch deposit/withdrawal history (with addresses)
 *  - Fetch portfolio with deposit addresses
 *  - Handle conversions (placeholder, since Bitget lacks a Convert API)
 *  - Combine all transactions (trades + deposits/withdrawals)
 *  - Proper rate limit handling
 */

const ccxt = require('ccxt');

class BitgetService {
  constructor(apiKey, apiSecret, passphrase) {
    this.exchange = new ccxt.bitget({
      apiKey,
      secret: apiSecret,
      password: passphrase,
      enableRateLimit: true,
      options: {
        defaultType: 'spot'
      }
    });
  }

  /**
   * ==============================
   *  BALANCE & PORTFOLIO SECTION
   * ==============================
   */

  async fetchBalance() {
    try {
      const balance = await this.exchange.fetchBalance();
      const formattedBalances = [];

      for (const [asset, data] of Object.entries(balance)) {
        if (
          asset !== 'info' &&
          asset !== 'free' &&
          asset !== 'used' &&
          asset !== 'total'
        ) {
          if (data.total && data.total > 0) {
            formattedBalances.push({
              asset,
              symbol: asset,
              free: data.free || 0,
              locked: data.used || 0,
              total: data.total || 0
            });
          }
        }
      }

      return formattedBalances;
    } catch (error) {
      console.error('Bitget fetchBalance error:', error.message);
      throw new Error(`Failed to fetch Bitget balance: ${error.message}`);
    }
  }

  async fetchPortfolio() {
    try {
      const balance = await this.fetchBalance();
      const portfolioWithAddresses = [];

      for (const asset of balance) {
        if (asset.total > 0) {
          try {
            const depositInfo = await this.exchange.fetchDepositAddress(asset.asset);
            portfolioWithAddresses.push({
              asset: asset.asset,
              symbol: asset.asset,
              free: asset.free,
              locked: asset.locked,
              total: asset.total,
              depositAddress: depositInfo.address,
              depositTag: depositInfo.tag || null,
              network: depositInfo.network || 'default',
              lastUpdated: new Date()
            });
            await new Promise(resolve => setTimeout(resolve, 300));
          } catch {
            portfolioWithAddresses.push({
              asset: asset.asset,
              symbol: asset.asset,
              free: asset.free,
              locked: asset.locked,
              total: asset.total,
              depositAddress: null,
              depositTag: null,
              network: null,
              lastUpdated: new Date()
            });
          }
        }
      }

      return portfolioWithAddresses;
    } catch (error) {
      console.error('Bitget fetchPortfolio error:', error.message);
      throw new Error(`Failed to fetch Bitget portfolio: ${error.message}`);
    }
  }

  /**
   * ==============================
   *  TRADE HISTORY SECTION
   * ==============================
   */

  async fetchTrades(symbol = null, since = null, limit = 100) {
    try {
      let allTrades = [];

      if (symbol) {
        const trades = await this.exchange.fetchMyTrades(symbol, since, limit);
        allTrades = trades;
      } else {
        const markets = await this.exchange.fetchMarkets();
        const balance = await this.fetchBalance();
        const assetsWithBalance = balance.map(b => b.asset);

        for (const asset of assetsWithBalance) {
          const pairs = [`${asset}/USDT`, `${asset}/USDC`, `${asset}/BTC`];
          for (const pair of pairs) {
            try {
              if (markets.find(m => m.symbol === pair)) {
                const trades = await this.exchange.fetchMyTrades(pair, since, limit);
                allTrades = allTrades.concat(trades);
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            } catch {
              continue;
            }
          }
        }
      }

      return this.formatTrades(allTrades);
    } catch (error) {
      console.error('Bitget fetchTrades error:', error.message);
      throw new Error(`Failed to fetch Bitget trades: ${error.message}`);
    }
  }

  formatTrades(trades) {
    return trades.map(trade => {
      const [baseAsset, quoteAsset] = trade.symbol.split('/');
      return {
        type: trade.side === 'buy' ? 'buy' : 'sell',
        assetId: baseAsset,
        symbol: baseAsset,
        quoteAsset,
        quantity: trade.amount,
        price: trade.price,
        totalValue: trade.cost,
        fee: trade.fee?.cost || 0,
        feeCurrency: trade.fee?.currency || quoteAsset,
        transactionDate: new Date(trade.timestamp),
        tradeId: trade.id,
        orderId: trade.order
      };
    });
  }

  /**
   * ==============================
   *  DEPOSITS / WITHDRAWALS SECTION
   * ==============================
   */

  async fetchDepositsWithdrawalsEnhanced(since = null, limit = 100) {
    try {
      const [deposits, withdrawals] = await Promise.all([
        this.exchange.fetchDeposits(undefined, since, limit).catch(() => []),
        this.exchange.fetchWithdrawals(undefined, since, limit).catch(() => [])
      ]);

      const formattedDeposits = deposits.map(d => ({
        type: 'deposit',
        asset: d.currency,
        symbol: d.currency,
        quantity: d.amount,
        price: 0,
        fee: d.fee?.cost || 0,
        feeCurrency: d.fee?.currency || d.currency,
        transactionDate: new Date(d.timestamp),
        txid: d.txid,
        walletAddress: d.address || null,
        addressTag: d.tag || null,
        network: d.network || null,
        status: d.status || 'completed'
      }));

      const formattedWithdrawals = withdrawals.map(w => ({
        type: 'withdraw',
        asset: w.currency,
        symbol: w.currency,
        quantity: w.amount,
        price: 0,
        fee: w.fee?.cost || 0,
        feeCurrency: w.fee?.currency || w.currency,
        transactionDate: new Date(w.timestamp),
        txid: w.txid,
        walletAddress: w.address || null,
        addressTag: w.tag || null,
        network: w.network || null,
        status: w.status || 'completed'
      }));

      return [...formattedDeposits, ...formattedWithdrawals].sort(
        (a, b) => b.transactionDate - a.transactionDate
      );
    } catch (error) {
      console.error('Bitget fetchDepositsWithdrawalsEnhanced error:', error.message);
      return [];
    }
  }

  async fetchDepositsWithdrawals(since = null, limit = 100) {
    return this.fetchDepositsWithdrawalsEnhanced(since, limit);
  }

  /**
   * ==============================
   *  CONVERSION HISTORY (N/A)
   * ==============================
   */

  async fetchConversions(since = null, limit = 100) {
    try {
      console.log('Bitget conversion API not available');
      return [];
    } catch (error) {
      console.error('Bitget fetchConversions error:', error.message);
      return [];
    }
  }

  /**
   * ==============================
   *  COMBINED TRANSACTIONS SECTION
   * ==============================
   */

  async fetchAllTransactions(since = null) {
    try {
      const [trades, depositsWithdrawals, conversions] = await Promise.all([
        this.fetchTrades(null, since).catch(() => []),
        this.fetchDepositsWithdrawalsEnhanced(since).catch(() => []),
        this.fetchConversions(since).catch(() => [])
      ]);

      return [...trades, ...depositsWithdrawals, ...conversions].sort((a, b) => {
        const dateA = a.transactionDate || a.date;
        const dateB = b.transactionDate || b.date;
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Bitget fetchAllTransactions error:', error.message);
      throw error;
    }
  }

  async fetchSpotTradingHistory(symbol = null, since = null, limit = 100) {
    return this.fetchTrades(symbol, since, limit);
  }

  /**
   * ==============================
   *  BREAKEVEN PRICE CALCULATION
   * ==============================
   */

  /**
   * Calculate breakeven price for each coin in the account
   * Formula: (Total cost + Total fees) / (Total quantity - Quantity sold)
   * Accounts for all fees to determine true breakeven
   */
  async getBreakevenPrices() {
    try {
      // Fetch current balances first to know what coins the user has
      const balances = await this.fetchBalance();
      console.log(`[Bitget getBreakevenPrices] Found ${balances.length} assets with balance`);

      // Fetch all trades
      const trades = await this.fetchTrades(null, null, 100);
      console.log(`[Bitget getBreakevenPrices] Found ${trades.length} trades`);

      // Group by asset and calculate breakeven price
      const assetData = {};

      trades.forEach(trade => {
        const asset = trade.symbol; // This is the base asset (e.g., 'BTC' from 'BTC/USDT')

        if (!assetData[asset]) {
          assetData[asset] = {
            asset,
            totalCost: 0,
            totalFees: 0,
            quantityBought: 0,
            quantitySold: 0,
            buyCount: 0,
            sellCount: 0
          };
        }

        if (trade.type === 'buy') {
          assetData[asset].totalCost += trade.totalValue;
          assetData[asset].totalFees += trade.fee || 0;
          assetData[asset].quantityBought += trade.quantity;
          assetData[asset].buyCount++;
        } else if (trade.type === 'sell') {
          assetData[asset].quantitySold += trade.quantity;
          assetData[asset].totalFees += trade.fee || 0;
          assetData[asset].sellCount++;
        }
      });

      // Calculate breakeven price for each asset
      const breakevenPrices = Object.values(assetData)
        .filter(data => data.buyCount > 0)
        .map(data => {
          const remainingQuantity = data.quantityBought - data.quantitySold;
          const breakevenPrice = remainingQuantity > 0
            ? (data.totalCost + data.totalFees) / remainingQuantity
            : 0;

          return {
            asset: data.asset,
            breakevenPrice,
            totalCost: data.totalCost,
            totalFees: data.totalFees,
            quantityBought: data.quantityBought,
            quantitySold: data.quantitySold,
            remainingQuantity,
            buyTransactions: data.buyCount,
            sellTransactions: data.sellCount
          };
        })
        .filter(data => data.remainingQuantity > 0)
        .sort((a, b) => b.totalCost - a.totalCost);

      console.log(`[Bitget getBreakevenPrices] Calculated prices for ${breakevenPrices.length} assets:`, breakevenPrices.map(a => a.asset).join(', '));

      return breakevenPrices;
    } catch (error) {
      console.error('Bitget getBreakevenPrices error:', error.message);
      throw new Error(`Failed to calculate breakeven prices: ${error.message}`);
    }
  }

  /**
   * ==============================
   *  UTILITIES
   * ==============================
   */

  async testConnection() {
    try {
      await this.exchange.fetchBalance();
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = BitgetService;
