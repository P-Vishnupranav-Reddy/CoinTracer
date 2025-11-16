const ccxt = require('ccxt');

class KuCoinService {
  constructor(apiKey, apiSecret, passphrase) {
    this.exchange = new ccxt.kucoin({
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
   * Test connection to KuCoin
   */
  async testConnection() {
    try {
      await this.exchange.fetchBalance();
      return { success: true, message: 'KuCoin connection successful' };
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

      console.log(`[KuCoin] Found ${assets.length} assets with balance`);
      return assets;
    } catch (error) {
      console.error('KuCoin fetchBalance error:', error);
      throw new Error(`Failed to fetch KuCoin balance: ${error.message}`);
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
        const markets = await this.exchange.loadMarkets();
        const symbols = Object.keys(markets).slice(0, 10); // Limit to avoid rate limits

        for (const sym of symbols) {
          try {
            const trades = await this.exchange.fetchMyTrades(sym, since, 100);
            allTrades = allTrades.concat(trades);
          } catch (err) {
            console.warn(`Failed to fetch trades for ${sym}:`, err.message);
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
      console.error('KuCoin fetchTrades error:', error);
      throw new Error(`Failed to fetch KuCoin trades: ${error.message}`);
    }
  }

  /**
   * Fetch deposit history
   */
  async fetchDeposits(code = null, since = null, limit = 500) {
    try {
      // KuCoin requires a currency code, skip if not provided
      if (!code) {
        console.log('[KuCoin] Skipping deposits fetch - currency code required');
        return [];
      }

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
      console.error(`KuCoin fetchDeposits error for ${code}:`, error.message);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Fetch withdrawal history
   */
  async fetchWithdrawals(code = null, since = null, limit = 500) {
    try {
      // KuCoin requires a currency code, skip if not provided
      if (!code) {
        console.log('[KuCoin] Skipping withdrawals fetch - currency code required');
        return [];
      }

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
      console.error(`KuCoin fetchWithdrawals error for ${code}:`, error.message);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Fetch all data at once
   */
  async fetchAllData() {
    try {
      const [balance, trades, deposits, withdrawals] = await Promise.all([
        this.fetchBalance(),
        this.fetchTrades(),
        this.fetchDeposits(),
        this.fetchWithdrawals()
      ]);

      return {
        balance,
        trades,
        deposits,
        withdrawals
      };
    } catch (error) {
      console.error('KuCoin fetchAllData error:', error);
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
        exchange: 'kucoin',
        accountType: balance.info?.type || 'main',
        canTrade: true,
        canWithdraw: true,
        canDeposit: true,
        totalBalance: this.calculateTotalBalance(balance),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('KuCoin getAccountInfo error:', error);
      throw error;
    }
  }

  /**
   * Helper: Map deposit status
   */
  mapDepositStatus(status) {
    const statusMap = {
      ok: 'completed',
      SUCCESS: 'completed',
      PROCESSING: 'processing',
      PENDING: 'pending',
      FAILED: 'failed'
    };
    return statusMap[status] || status;
  }

  /**
   * Helper: Map withdrawal status
   */
  mapWithdrawalStatus(status) {
    const statusMap = {
      ok: 'completed',
      SUCCESS: 'completed',
      PROCESSING: 'processing',
      PENDING: 'pending',
      FAILED: 'failed'
    };
    return statusMap[status] || status;
  }

  /**
   * Helper: Calculate total balance in USD
   */
  calculateTotalBalance(balance) {
    let total = 0;
    if (balance.info?.accounts) {
      balance.info.accounts.forEach((account) => {
        total += parseFloat(account.balance) || 0;
      });
    }
    return total;
  }

  /**
   * Fetch all transactions (trades + deposits + withdrawals) for sync
   * KuCoin typically provides up to 1 year of history via API
   */
  async fetchAllTransactions(since = null) {
    try {
      const sinceDate = since ? new Date(since) : null;
      console.log(`[KuCoin] Fetching all transactions since ${sinceDate?.toISOString() || 'beginning'}`);

      // First, fetch current balances to get all coins (including airdrops)
      const balances = await this.fetchBalance();
      const coinsWithBalance = balances.map(b => b.asset);

      console.log(`[KuCoin] Found ${coinsWithBalance.length} coins with balance:`, coinsWithBalance);

      // Fetch trades (works without currency code)
      const tradesPromise = this.fetchTrades(null, sinceDate?.getTime()).catch(err => {
        console.error('[KuCoin] Trades fetch failed:', err.message);
        return [];
      });

      // Fetch deposits and withdrawals for each coin with balance
      const depositsPromises = coinsWithBalance.map(coin =>
        this.fetchDeposits(coin, sinceDate?.getTime()).catch(err => {
          console.error(`[KuCoin] Deposits fetch failed for ${coin}:`, err.message);
          return [];
        })
      );

      const withdrawalsPromises = coinsWithBalance.map(coin =>
        this.fetchWithdrawals(coin, sinceDate?.getTime()).catch(err => {
          console.error(`[KuCoin] Withdrawals fetch failed for ${coin}:`, err.message);
          return [];
        })
      );

      // Wait for all fetches
      const [allTrades, ...depositsResults] = await Promise.all([
        tradesPromise,
        ...depositsPromises
      ]);

      const withdrawalsResults = await Promise.all(withdrawalsPromises);

      const allDeposits = depositsResults.flat();
      const allWithdrawals = withdrawalsResults.flat();

      console.log(`[KuCoin] Fetched ${allTrades.length} trades, ${allDeposits.length} deposits, ${allWithdrawals.length} withdrawals`);

      // For coins with balance but no transaction history, create synthetic deposit transactions
      // This handles airdrops and other external credits
      const transactionCoins = new Set([
        ...allTrades.map(t => t.baseAsset),
        ...allDeposits.map(d => d.coin),
        ...allWithdrawals.map(w => w.coin)
      ]);

      const syntheticDeposits = balances
        .filter(balance => !transactionCoins.has(balance.asset))
        .map(balance => ({
          id: `airdrop-${balance.asset}-${Date.now()}`,
          coin: balance.asset,
          amount: balance.total,
          address: '',
          addressTag: '',
          network: '',
          txid: `airdrop-${balance.asset}`,
          status: 'SUCCESS',
          timestamp: Date.now(),
          datetime: new Date().toISOString()
        }));

      if (syntheticDeposits.length > 0) {
        console.log(`[KuCoin] Created ${syntheticDeposits.length} synthetic deposits for coins without history:`,
          syntheticDeposits.map(d => `${d.coin} (${d.amount})`));
        allDeposits.push(...syntheticDeposits);
      }

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
        exchange: 'kucoin'
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
        exchange: 'kucoin'
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
        exchange: 'kucoin'
      }));

      return [...tradeTransactions, ...depositTransactions, ...withdrawalTransactions]
        .sort((a, b) => b.transactionDate - a.transactionDate);
    } catch (error) {
      console.error('[KuCoin] fetchAllTransactions error:', error);
      throw error;
    }
  }
}

module.exports = KuCoinService;
