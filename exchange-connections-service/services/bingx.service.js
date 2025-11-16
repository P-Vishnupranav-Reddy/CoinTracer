const ccxt = require('ccxt');

class BingXService {
  constructor(apiKey, apiSecret) {
    this.exchange = new ccxt.bingx({
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: 'spot' // 'spot', 'swap', 'future'
      }
    });
  }

  /**
   * Test connection to BingX
   */
  async testConnection() {
    try {
      await this.exchange.fetchBalance();
      return { success: true, message: 'BingX connection successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Fetch account balance
   */
  async fetchBalance() {
    try {
      const balance = await this.exchange.fetchBalance();
      const assets = [];
      const MIN_BALANCE = 0.00000001; // Filter out dust balances

      for (const [asset, amounts] of Object.entries(balance)) {
        // Skip metadata fields and check if amounts object exists
        if (asset !== 'info' && asset !== 'free' && asset !== 'used' && asset !== 'total' && amounts && typeof amounts === 'object') {
          const totalBalance = parseFloat(amounts.total) || 0;

          if (totalBalance > MIN_BALANCE) {
            assets.push({
              asset,
              free: parseFloat(amounts.free) || 0,
              locked: parseFloat(amounts.used) || 0,
              total: totalBalance
            });
          }
        }
      }

      console.log(`[BingX] Found ${assets.length} assets with balance`);
      return assets;
    } catch (error) {
      console.error('BingX fetchBalance error:', error);
      throw new Error(`Failed to fetch BingX balance: ${error.message}`);
    }
  }

  /**
   * Fetch trade history
   */
  async fetchTrades(symbol = null, since = null, limit = 500) {
    try {
      let allTrades = [];

      if (symbol) {
        const trades = await this.exchange.fetchMyTrades(symbol, since, limit);
        allTrades = trades;
      } else {
        // Fetch recent trades from multiple markets
        const markets = await this.exchange.loadMarkets();
        const popularSymbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'];

        for (const sym of popularSymbols) {
          try {
            if (markets[sym]) {
              const trades = await this.exchange.fetchMyTrades(sym, since, 100);
              allTrades = allTrades.concat(trades);
            }
          } catch (err) {
            console.warn(`Failed to fetch BingX trades for ${sym}:`, err.message);
          }
        }
      }

      return allTrades.map((trade) => ({
        id: trade.id,
        symbol: trade.symbol,
        type: trade.side, // 'buy' or 'sell'
        baseAsset: trade.symbol.split('/')[0],
        quoteAsset: trade.symbol.split('/')[1],
        price: trade.price,
        quantity: trade.amount,
        totalValue: trade.cost,
        fee: trade.fee?.cost || 0,
        feeCurrency: trade.fee?.currency || '',
        timestamp: trade.timestamp,
        datetime: trade.datetime
      }));
    } catch (error) {
      console.error('BingX fetchTrades error:', error);
      throw new Error(`Failed to fetch BingX trades: ${error.message}`);
    }
  }

  /**
   * Fetch deposit history
   */
  async fetchDeposits(code = null, since = null, limit = 500) {
    try {
      const deposits = await this.exchange.fetchDeposits(code, since, limit);

      return deposits.map((deposit) => ({
        id: deposit.id,
        coin: deposit.currency,
        amount: deposit.amount,
        address: deposit.address,
        addressTag: deposit.tag || '',
        network: deposit.network || '',
        txid: deposit.txid,
        status: this.mapDepositStatus(deposit.status),
        timestamp: deposit.timestamp,
        datetime: deposit.datetime
      }));
    } catch (error) {
      console.error('BingX fetchDeposits error:', error);
      return []; // BingX might not support deposits API
    }
  }

  /**
   * Fetch withdrawal history
   */
  async fetchWithdrawals(code = null, since = null, limit = 500) {
    try {
      const withdrawals = await this.exchange.fetchWithdrawals(code, since, limit);

      return withdrawals.map((withdrawal) => ({
        id: withdrawal.id,
        coin: withdrawal.currency,
        amount: withdrawal.amount,
        address: withdrawal.address,
        addressTag: withdrawal.tag || '',
        network: withdrawal.network || '',
        txid: withdrawal.txid,
        fee: withdrawal.fee?.cost || 0,
        status: this.mapWithdrawalStatus(withdrawal.status),
        timestamp: withdrawal.timestamp,
        datetime: withdrawal.datetime
      }));
    } catch (error) {
      console.error('BingX fetchWithdrawals error:', error);
      return []; // BingX might not support withdrawals API
    }
  }

  /**
   * Fetch all data at once
   */
  async fetchAllData() {
    try {
      const [balance, trades, deposits, withdrawals] = await Promise.allSettled([
        this.fetchBalance(),
        this.fetchTrades(),
        this.fetchDeposits(),
        this.fetchWithdrawals()
      ]);

      return {
        balance: balance.status === 'fulfilled' ? balance.value : [],
        trades: trades.status === 'fulfilled' ? trades.value : [],
        deposits: deposits.status === 'fulfilled' ? deposits.value : [],
        withdrawals: withdrawals.status === 'fulfilled' ? withdrawals.value : []
      };
    } catch (error) {
      console.error('BingX fetchAllData error:', error);
      throw error;
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    try {
      const balance = await this.exchange.fetchBalance();

      return {
        exchange: 'bingx',
        accountType: 'spot',
        canTrade: true,
        canWithdraw: true,
        canDeposit: true,
        totalBalance: this.calculateTotalBalance(balance),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('BingX getAccountInfo error:', error);
      throw error;
    }
  }

  /**
   * Helper: Map deposit status
   */
  mapDepositStatus(status) {
    const statusMap = {
      SUCCESS: 'completed',
      PROCESSING: 'processing',
      PENDING: 'pending',
      FAILED: 'failed'
    };
    return statusMap[status?.toUpperCase()] || status;
  }

  /**
   * Helper: Map withdrawal status
   */
  mapWithdrawalStatus(status) {
    const statusMap = {
      SUCCESS: 'completed',
      PROCESSING: 'processing',
      PENDING: 'pending',
      FAILED: 'failed'
    };
    return statusMap[status?.toUpperCase()] || status;
  }

  /**
   * Helper: Calculate total balance
   */
  calculateTotalBalance(balance) {
    let total = 0;
    for (const [asset, amounts] of Object.entries(balance)) {
      if (asset !== 'info' && asset !== 'free' && asset !== 'used' && asset !== 'total') {
        total += amounts.total || 0;
      }
    }
    return total;
  }

  /**
   * Fetch all transactions (trades + deposits + withdrawals) for sync
   * BingX typically provides 90 days of history via API
   */
  async fetchAllTransactions(since = null) {
    try {
      const sinceDate = since ? new Date(since) : null;
      console.log(`[BingX] Fetching all transactions since ${sinceDate?.toISOString() || 'beginning'}`);

      // Fetch trades, deposits, and withdrawals in parallel
      const [trades, deposits, withdrawals] = await Promise.allSettled([
        this.fetchTrades(null, sinceDate?.getTime()),
        this.fetchDeposits(null, sinceDate?.getTime()),
        this.fetchWithdrawals(null, sinceDate?.getTime())
      ]);

      const allTrades = trades.status === 'fulfilled' ? trades.value : [];
      const allDeposits = deposits.status === 'fulfilled' ? deposits.value : [];
      const allWithdrawals = withdrawals.status === 'fulfilled' ? withdrawals.value : [];

      console.log(`[BingX] Fetched ${allTrades.length} trades, ${allDeposits.length} deposits, ${allWithdrawals.length} withdrawals`);

      // Map to unified transaction format
      const tradeTransactions = allTrades.map(t => ({
        type: t.type === 'buy' ? 'BUY' : 'SELL',
        asset: t.baseAsset,
        amount: t.quantity,
        price: t.price,
        total: t.totalValue,
        fee: t.fee,
        feeCurrency: t.feeCurrency,
        quoteAsset: t.quoteAsset,
        transactionDate: new Date(t.timestamp),
        transactionId: t.id,
        exchange: 'bingx'
      }));

      const depositTransactions = allDeposits.map(d => ({
        type: 'DEPOSIT',
        asset: d.coin,
        amount: d.amount,
        address: d.address,
        txid: d.txid,
        network: d.network,
        status: d.status,
        transactionDate: new Date(d.timestamp),
        transactionId: d.id,
        exchange: 'bingx'
      }));

      const withdrawalTransactions = allWithdrawals.map(w => ({
        type: 'WITHDRAWAL',
        asset: w.coin,
        amount: w.amount,
        address: w.address,
        txid: w.txid,
        network: w.network,
        fee: w.fee,
        status: w.status,
        transactionDate: new Date(w.timestamp),
        transactionId: w.id,
        exchange: 'bingx'
      }));

      return [...tradeTransactions, ...depositTransactions, ...withdrawalTransactions]
        .sort((a, b) => b.transactionDate - a.transactionDate);
    } catch (error) {
      console.error('[BingX] fetchAllTransactions error:', error);
      throw error;
    }
  }
}

module.exports = BingXService;
