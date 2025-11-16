/**
 * BinanceService
 * Fetches portfolio balances and calculates weighted average cost basis.
 * * CRITICAL: This script requires the host system's clock to be
 * set to the correct, real-world time. API calls will fail
 * if the system clock is in the future or severely desynced.
 */
const ccxt = require('ccxt');

// Common quote currencies to scan when fetching trades
const COMMON_QUOTES = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB'];
// Stablecoins to treat as "Cash" for cost basis calculation
const STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'USDP'];

class BinanceService {
  constructor(apiKey, apiSecret, { region = 'global', recvWindow = 60000, timeout = 30000 } = {}) {
    const ExchangeClass = region === 'us' ? ccxt.binanceus : ccxt.binance;
    const safeRecvWindow = Math.max(Number(recvWindow) || 60000, 60000);
    const safeTimeout = Math.max(Number(timeout) || 30000, 45000);

    this.exchange = new ExchangeClass({
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      timeout: safeTimeout,
      options: { adjustForTimeDifference: true },
      recvWindow: safeRecvWindow
    });

    this._sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    this.recvWindow = safeRecvWindow;
  }

  /**
   * MAIN FUNCTION: Fetches Balance + Calculates Average Price
   * Call this one function to get the data for your table.
   */
  async fetchPortfolioWithStats() {
    try {
      // 1. Get current Balances
      const balances = await this.fetchBalance();
      const activeAssets = balances.map(b => b.asset);

      console.log(`[Binance] Found ${activeAssets.length} active assets. Fetching history...`);

      // 2. Fetch History (Trades & Conversions) specifically for these assets
      // We go back to 2017 to catch old trades
      const since = new Date('2017-01-01').getTime();
      // Use new Date() for the end time, which relies on a correct system clock
      const now = new Date();

      console.log(`[Binance] Fetching history from ${new Date(since).toISOString()} up to ${now.toISOString()}`);

      const [trades, conversions] = await Promise.all([
        this.fetchTradesForAssets(activeAssets, since),
        this.fetchAllConversions(new Date(since), now)
      ]);

      console.log(`[Binance] Found ${trades.length} trades and ${conversions.length} conversions.`);

      // 3. Calculate Statistics (Weighted Average Price)
      const stats = this.calculateAssetStats(trades, conversions);

      // 4. Merge Stats into Balances
      const portfolio = balances.map(balance => {
        const stat = stats[balance.asset] || { avgPrice: 0, costBasis: 0 };

        console.log(`[Binance] Stats for ${balance.asset}: AvgPrice ${stat.avgPrice}, TotalQty ${balance.total}`);

        return {
          ...balance,
          symbol: balance.asset, // Ensure 'symbol' field exists
          quantity: balance.total,
          avgPrice: stat.avgPrice,
          totalCostBasis: stat.costBasis, // This is the "Breakeven" total value
          breakEvenPrice: stat.avgPrice // Alias for clarity
        };
      });

      return portfolio;
    } catch (error) {
      console.error('Error in fetchPortfolioWithStats:', error);
      // Check for timestamp-related errors
      if (error.message && error.message.includes('-1021')) {
        console.error('CRITICAL: Timestamp error. Check your system clock!');
        throw new Error(`Timestamp for this request is outside of the recvWindow. Please sync your system clock. ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Test connection to Binance
   */
  async testConnection() {
    try {
      await this.exchange.fetchBalance({ recvWindow: this.recvWindow });
      return { success: true, message: 'Binance connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Basic Balance Fetcher
  async fetchBalance() {
    try {
      const balance = await this.exchange.fetchBalance({ recvWindow: this.recvWindow });
      const formatted = [];
      const MIN_BALANCE = 0.00000001; // Filter out dust balances

      for (const [asset, data] of Object.entries(balance)) {
        // Filter out non-assets and negligible balances
        if (!['info', 'free', 'used', 'total'].includes(asset) && data.total && parseFloat(data.total) > MIN_BALANCE) {
          formatted.push({
            asset,
            free: parseFloat(data.free) || 0,
            locked: parseFloat(data.used) || 0,
            total: parseFloat(data.total) || 0
          });
        }
      }
      return formatted;
    } catch (error) {
      throw new Error(`Balance fetch failed: ${error.message}`);
    }
  }

  /**
   * Optimized Trade Fetcher: Only scans assets user actually owns
   */
  async fetchTradesForAssets(assets, since) {
    let allTrades = [];
    // Get all markets once to map assets to symbols (e.g. ETH -> ETH/USDT)
    const markets = await this.exchange.loadMarkets();

    for (const asset of assets) {
      // Find pairs for this asset (e.g. PLUME/USDT, PLUME/ETH)
      const symbols = Object.values(markets)
        .filter(m => m.base === asset && m.spot && COMMON_QUOTES.includes(m.quote)) // Only vs common quotes
        .map(m => m.symbol);

      for (const symbol of symbols) {
        try {
          // fetchMyTrades(symbol, since, limit, params)
          const trades = await this.exchange.fetchMyTrades(symbol, since, undefined, { recvWindow: this.recvWindow });
          if (trades.length > 0) {
            allTrades = allTrades.concat(trades);
          }
          await this._sleep(100); // Rate limit protection
        } catch (e) {
          // Suppress errors for inactive pairs
          if (!e.message.includes('Invalid symbol')) {
            console.warn(`[Binance] Warning fetching trades for ${symbol}: ${e.message}`);
          }
        }
      }
    }
    return this.formatTrades(allTrades);
  }

  formatTrades(trades) {
    return trades.map(trade => {
      const [base, quote] = trade.symbol.split('/');

      // FIX: Ensure timestamp is valid before creating Date
      const date = trade.timestamp ? new Date(trade.timestamp) : null;

      return {
        type: trade.side, // 'buy' or 'sell'
        asset: base,
        quoteAsset: quote,
        qty: parseFloat(trade.amount),
        price: parseFloat(trade.price),
        cost: parseFloat(trade.cost), // total value in quote currency
        // Use raw timestamp for sorting, and a valid Date object
        timestamp: trade.timestamp,
        date: date && !isNaN(date.getTime()) ? date : null
      };
    }).filter(t => t.date); // Filter out any trades that had invalid timestamps
  }

  /**
   * Fetch Deposits
   */
  async fetchDeposits(since) {
    try {
      const deposits = await this.exchange.fetchDeposits(undefined, since, undefined, {
        recvWindow: this.recvWindow
      });

      return deposits.map(deposit => {
        const date = deposit.timestamp ? new Date(deposit.timestamp) : new Date();
        return {
          type: 'deposit',
          exchangeType: 'deposit',
          transactionDate: date,
          date,
          asset: deposit.currency,
          quantity: parseFloat(deposit.amount),
          fee: parseFloat(deposit.fee?.cost || 0),
          feeCurrency: deposit.fee?.currency,
          status: deposit.status,
          txId: deposit.txid,
          network: deposit.network,
          address: deposit.address,
          addressTag: deposit.tag
        };
      });
    } catch (error) {
      console.error('[Binance] fetchDeposits error:', error.message);
      return [];
    }
  }

  /**
   * Fetch Withdrawals
   */
  async fetchWithdrawals(since) {
    try {
      const withdrawals = await this.exchange.fetchWithdrawals(undefined, since, undefined, {
        recvWindow: this.recvWindow
      });

      return withdrawals.map(withdrawal => {
        const date = withdrawal.timestamp ? new Date(withdrawal.timestamp) : new Date();
        return {
          type: 'withdraw',
          exchangeType: 'withdraw',
          transactionDate: date,
          date,
          asset: withdrawal.currency,
          quantity: parseFloat(withdrawal.amount),
          fee: parseFloat(withdrawal.fee?.cost || 0),
          feeCurrency: withdrawal.fee?.currency,
          status: withdrawal.status,
          txId: withdrawal.txid,
          network: withdrawal.network,
          address: withdrawal.address,
          addressTag: withdrawal.tag
        };
      });
    } catch (error) {
      console.error('[Binance] fetchWithdrawals error:', error.message);
      return [];
    }
  }

  /**
   * Fetch Conversions with Pagination loop
   */
  async fetchAllConversions(startDate, endDate) {
    const allConversions = [];
    let currentStart = startDate.getTime();
    const finalEnd = endDate.getTime();

    // Safety break to prevent infinite loops
    let loops = 0;
    // Binance only allows fetching conversions within the last 30 days.
    // Let's adjust our start time to be realistic.
    const maxHistoryStart = finalEnd - (90 * 24 * 60 * 60 * 1000); // 90 days ago

    currentStart = Math.max(currentStart, maxHistoryStart);
    console.log(`[Binance] Fetching conversions from ${new Date(currentStart).toISOString()}`);

    while (currentStart < finalEnd && loops < 50) { // Max 50 loops
      // 29 day chunks to be safe
      const chunkEnd = Math.min(currentStart + (29 * 24 * 60 * 60 * 1000), finalEnd);
      try {
        const data = await this.exchange.sapiGetConvertTradeFlow({
          startTime: currentStart,
          endTime: chunkEnd,
          limit: 1000,
          recvWindow: this.recvWindow
        });

        if (data && data.list) {
          // Transform each conversion to have proper date and structure
          const formatted = data.list.map(conv => {
            // Binance createTime is in milliseconds (13 digits)
            const timestamp = parseInt(conv.createTime);
            const date = new Date(timestamp);

            const fromAmount = parseFloat(conv.fromAmount);
            const toAmount = parseFloat(conv.toAmount);

            // Calculate price based on conversion direction
            // If converting FROM a stablecoin, price = fromAmount / toAmount (cost per unit in stablecoin)
            // If converting TO a stablecoin, price = toAmount / fromAmount (value per unit in stablecoin)
            const isFromStable = STABLECOINS.includes(conv.fromAsset);
            const isToStable = STABLECOINS.includes(conv.toAsset);

            let price = 0;
            if (isFromStable && toAmount > 0) {
              // Buying crypto with stablecoin: price = USDT spent / crypto received
              price = fromAmount / toAmount;
            } else if (isToStable && fromAmount > 0) {
              // Selling crypto for stablecoin: price = USDT received / crypto sold
              price = toAmount / fromAmount;
            }

            console.log(`[Binance Conversion] ${conv.toAsset}: date=${date.toISOString()}, price=${price.toFixed(6)}`);

            return {
              type: 'convert',
              exchangeType: 'convert',
              transactionDate: date,
              date,
              fromAsset: conv.fromAsset,
              fromQuantity: fromAmount,
              toAsset: conv.toAsset,
              toQuantity: toAmount,
              conversionRate: parseFloat(conv.ratio),
              price, // Add calculated price per unit
              orderId: conv.orderId,
              quoteId: conv.quoteId,
              symbol: conv.toAsset // The asset we're receiving
            };
          });
          allConversions.push(...formatted);
        }
        // Move to the next chunk
        currentStart = chunkEnd + 1; // +1 ms to avoid overlap
        loops++;
        await this._sleep(200); // Rate limit
      } catch (error) {
        console.warn(`[Binance] Conversion fetch warning: ${error.message}. (This may be normal if API permissions are not set)`);
        break; // Stop if API not enabled or other error
      }
    }
    return allConversions;
  }

  /**
   * CORE LOGIC: Weighted Average Cost Calculation
   */
  calculateAssetStats(trades, conversions) {
    const assets = {};

    // Helper to init asset stats
    const getAsset = (symbol) => {
      if (!assets[symbol]) {
        assets[symbol] = {
          totalQty: 0, // Current holding quantity
          totalCost: 0 // Current total cost basis
        };
      }
      return assets[symbol];
    };

    // 1. Merge and Sort by Date (Oldest First is critical for cost basis)
    const history = [
      ...trades.map(t => ({
        ...t,
        category: 'trade',
        timestamp: t.timestamp
      })),
      ...conversions.map(c => {
        // Estimate cost: Only works if source was a stablecoin
        const cost = STABLECOINS.includes(c.fromAsset) ? parseFloat(c.fromAmount) : 0;
        return {
          category: 'convert',
          timestamp: c.createTime,
          asset: c.toAsset, // The asset we received
          qty: parseFloat(c.toAmount),
          cost,
          // Handle the "sell" side (the asset we gave up)
          fromAsset: c.fromAsset,
          fromQty: parseFloat(c.fromAmount)
        };
      })
    ].sort((a, b) => a.timestamp - b.timestamp); // Sort by raw timestamp

    // 2. Replay History
    for (const tx of history) {
      // --- Handle Trades ---
      if (tx.category === 'trade') {
        const record = getAsset(tx.asset);

        if (tx.type === 'buy') {
          // Weighted Average Formula:
          // New Avg = (Old Total Cost + New Cost) / (Old Qty + New Qty)
          record.totalCost += tx.cost;
          record.totalQty += tx.qty;
        } else if (tx.type === 'sell') {
          // Selling removes quantity and proportional cost.
          // The Average Price of the remaining tokens does NOT change.
          const avgPrice = record.totalQty > 0 ? (record.totalCost / record.totalQty) : 0;

          const costOfSold = tx.qty * avgPrice; // Cost basis of the tokens being sold
          record.totalQty -= tx.qty;
          record.totalCost -= costOfSold; // Reduce total cost
        }
      } else if (tx.category === 'convert') {
        // --- Handle Conversions ---
        // A) Handle the "Buy" side (the asset we received)
        const record = getAsset(tx.asset);
        record.totalCost += tx.cost; // cost is 0 if not from stablecoin
        record.totalQty += tx.qty;

        // B) Handle the "Sell" side (the asset we gave up)
        if (!STABLECOINS.includes(tx.fromAsset)) {
          const fromRecord = getAsset(tx.fromAsset);
          if (fromRecord.totalQty > 0) { // Only process if we have a record
            const fromAvgPrice = fromRecord.totalCost / fromRecord.totalQty;
            const costOfSold = tx.fromQty * fromAvgPrice;

            fromRecord.totalQty -= tx.fromQty;
            fromRecord.totalCost -= costOfSold;
          }
        }
      }

      // Clean up dust: If quantity is near zero, wipe cost basis to prevent errors
      const record = getAsset(tx.asset);
      if (record && record.totalQty < 0.00000001) {
        record.totalQty = 0;
        record.totalCost = 0;
      }
    }

    // 3. Finalize Averages
    const results = {};
    for (const [symbol, data] of Object.entries(assets)) {
      results[symbol] = {
        costBasis: data.totalCost < 0 ? 0 : data.totalCost, // Floor at 0
        avgPrice: data.totalQty > 0 ? (data.totalCost / data.totalQty) : 0
      };
    }
    return results;
  }

  /**
   * Fetch all transactions (trades + conversions + deposits + withdrawals) for sync
   */
  async fetchAllTransactions(since) {
    try {
      const sinceDate = new Date(since);
      const now = new Date();

      // Get current balances to know which assets to fetch trades for
      const balances = await this.fetchBalance();
      const activeAssets = balances.map(b => b.asset);

      console.log(`[Binance] Fetching transactions for ${activeAssets.length} assets since ${sinceDate.toISOString()}`);

      // Fetch all transaction types in parallel
      const [trades, conversions, deposits, withdrawals] = await Promise.all([
        this.fetchTradesForAssets(activeAssets, since),
        this.fetchAllConversions(sinceDate, now),
        this.fetchDeposits(since),
        this.fetchWithdrawals(since)
      ]);

      console.log(`[Binance] Fetched ${trades.length} trades, ${conversions.length} conversions, ${deposits.length} deposits, ${withdrawals.length} withdrawals`);

      // Combine and return all transactions
      return [...trades, ...conversions, ...deposits, ...withdrawals];
    } catch (error) {
      console.error('[Binance] fetchAllTransactions error:', error);
      throw error;
    }
  }
}

module.exports = BinanceService;
