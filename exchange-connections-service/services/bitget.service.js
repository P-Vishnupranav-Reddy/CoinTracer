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

  async fetchTrades(symbol = null, since = null, limit = 500) {
    try {
      let allTrades = [];

      // Bitget has strict time range limits - use last 90 days if since is too old
      const now = Date.now();
      const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
      const effectiveSince = since && since < ninetyDaysAgo ? ninetyDaysAgo : (since || ninetyDaysAgo);

      console.log(`[Bitget] Using time range: ${new Date(effectiveSince).toISOString()} to ${new Date(now).toISOString()}`);

      if (symbol) {
        console.log(`[Bitget] Fetching trades for specific symbol: ${symbol}`);
        const trades = await this.exchange.fetchMyTrades(symbol, effectiveSince, limit);
        console.log(`[Bitget] Found ${trades.length} trades for ${symbol}`);
        return this.formatTrades(trades);
      }

      console.log('[Bitget] Fetching ALL trade history using comprehensive approach');
      const markets = await this.exchange.loadMarkets();
      console.log(`[Bitget] Total markets available: ${Object.keys(markets).length}`);

      // Collect all assets to scan
      const allAssets = new Set();

      // Strategy 1: Get assets with current balance
      try {
        const balance = await this.fetchBalance();
        balance.forEach(b => allAssets.add(b.asset));
        console.log(`[Bitget] Found ${balance.length} assets with current balance`);
      } catch (err) {
        console.warn('[Bitget] Could not fetch balance:', err.message);
      }

      // Strategy 2: Scan deposit/withdrawal history in 90-day chunks
      try {
        console.log('[Bitget] Scanning deposit/withdrawal history (last 90 days) to find all traded assets...');
        const [deposits, withdrawals] = await Promise.all([
          this.exchange.fetchDeposits(undefined, effectiveSince, 500).catch(err => {
            console.warn('[Bitget] Could not fetch deposits:', err.message);
            return [];
          }),
          this.exchange.fetchWithdrawals(undefined, effectiveSince, 500).catch(err => {
            console.warn('[Bitget] Could not fetch withdrawals:', err.message);
            return [];
          })
        ]);

        deposits.forEach(d => allAssets.add(d.currency));
        withdrawals.forEach(w => allAssets.add(w.currency));
        console.log(`[Bitget] Found ${deposits.length} deposits and ${withdrawals.length} withdrawals`);
      } catch (err) {
        console.warn('[Bitget] Could not fetch deposit/withdrawal history:', err.message);
      }

      const assetsArray = Array.from(allAssets);
      console.log(`[Bitget] Total unique assets to scan: ${assetsArray.length} - ${assetsArray.join(', ')}`);

      // Fetch trades for all identified assets
      for (const asset of assetsArray) {
        const pairs = [`${asset}/USDT`, `${asset}/USDC`, `${asset}/BTC`, `${asset}/ETH`, `${asset}/USDD`];
        for (const pair of pairs) {
          if (markets[pair]) {
            try {
              const trades = await this.exchange.fetchMyTrades(pair, effectiveSince, limit);
              if (trades && trades.length > 0) {
                console.log(`[Bitget] Found ${trades.length} trades for ${pair}`);
                // Deduplicate by trade ID
                const newTrades = trades.filter(t => !allTrades.find(existing => existing.id === t.id));
                if (newTrades.length > 0) {
                  allTrades = allTrades.concat(newTrades);
                }
              }
              await new Promise(resolve => setTimeout(resolve, 150));
            } catch (err) {
              if (!err.message.includes('does not have market symbol') && !err.message.includes('Invalid symbol')) {
                console.warn(`[Bitget] Error fetching ${pair}:`, err.message);
              }
            }
          }
        }
      }

      console.log(`[Bitget] Total unique trades fetched: ${allTrades.length}`);
      const formatted = this.formatTrades(allTrades);
      console.log(`[Bitget] Formatted ${formatted.length} trades`);
      return formatted;
    } catch (error) {
      console.error('Bitget fetchTrades error:', error.message);
      console.log('[Bitget] Returning empty trades array due to error');
      return [];
    }
  }

  formatTrades(trades) {
    return trades.map(trade => {
      const [baseAsset, quoteAsset] = trade.symbol.split('/');
      return {
        type: trade.side === 'buy' ? 'buy' : 'sell',
        asset: baseAsset,
        assetId: baseAsset,
        symbol: baseAsset,
        quoteAsset,
        quantity: trade.amount,
        qty: trade.amount,
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
      // Bitget has a 90-day limit for deposit/withdrawal history
      const now = Date.now();
      const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
      const effectiveSince = since && since < ninetyDaysAgo ? ninetyDaysAgo : (since || ninetyDaysAgo);

      console.log(`[Bitget] Fetching deposits and withdrawals from ${new Date(effectiveSince).toISOString()} to ${new Date(now).toISOString()}`);

      const [deposits, withdrawals] = await Promise.all([
        this.exchange.fetchDeposits(undefined, effectiveSince, limit).catch(err => {
          console.warn('[Bitget] Failed to fetch deposits:', err.message);
          return [];
        }),
        this.exchange.fetchWithdrawals(undefined, effectiveSince, limit).catch(err => {
          console.warn('[Bitget] Failed to fetch withdrawals:', err.message);
          return [];
        })
      ]);

      console.log(`[Bitget] Fetched ${deposits.length} deposits and ${withdrawals.length} withdrawals`);

      const formattedDeposits = deposits.map(d => ({
        type: 'deposit',
        asset: d.currency,
        assetId: d.currency,
        symbol: d.currency,
        quantity: d.amount,
        qty: d.amount,
        price: 0,
        fee: d.fee?.cost || 0,
        feeCurrency: d.fee?.currency || d.currency,
        transactionDate: new Date(d.timestamp),
        tradeId: d.txid,
        txid: d.txid,
        walletAddress: d.address || null,
        addressTag: d.tag || null,
        network: d.network || null,
        status: d.status || 'completed'
      }));

      const formattedWithdrawals = withdrawals.map(w => ({
        type: 'withdraw',
        asset: w.currency,
        assetId: w.currency,
        symbol: w.currency,
        quantity: w.amount,
        qty: w.amount,
        price: 0,
        fee: w.fee?.cost || 0,
        feeCurrency: w.fee?.currency || w.currency,
        transactionDate: new Date(w.timestamp),
        tradeId: w.txid,
        txid: w.txid,
        walletAddress: w.address || null,
        addressTag: w.tag || null,
        network: w.network || null,
        status: w.status || 'completed'
      }));

      const combined = [...formattedDeposits, ...formattedWithdrawals].sort(
        (a, b) => b.transactionDate - a.transactionDate
      );

      console.log(`[Bitget] Returning ${combined.length} deposits/withdrawals`);
      return combined;
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
      console.log(`[Bitget] fetchAllTransactions called with since=${since ? new Date(since).toISOString() : 'null'}`);

      const [trades, depositsWithdrawals, conversions] = await Promise.all([
        this.fetchTrades(null, since).catch(err => {
          console.error('[Bitget] Error fetching trades:', err.message);
          return [];
        }),
        this.fetchDepositsWithdrawalsEnhanced(since).catch(err => {
          console.error('[Bitget] Error fetching deposits/withdrawals:', err.message);
          return [];
        }),
        this.fetchConversions(since).catch(err => {
          console.error('[Bitget] Error fetching conversions:', err.message);
          return [];
        })
      ]);

      console.log(`[Bitget] Fetched ${trades.length} trades, ${depositsWithdrawals.length} deposits/withdrawals, ${conversions.length} conversions`);

      const allTransactions = [...trades, ...depositsWithdrawals, ...conversions].sort((a, b) => {
        const dateA = a.transactionDate || a.date;
        const dateB = b.transactionDate || b.date;
        return dateB - dateA;
      });

      console.log(`[Bitget] Returning ${allTransactions.length} total transactions`);
      return allTransactions;
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
