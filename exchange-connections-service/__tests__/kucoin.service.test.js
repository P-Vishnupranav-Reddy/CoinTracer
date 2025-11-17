const KucoinService = require('../services/kucoin.service');
const ccxt = require('ccxt');

jest.mock('ccxt');

describe('KucoinService', () => {
  let mockExchange;
  let service;

  beforeEach(() => {
    mockExchange = {
      fetchBalance: jest.fn(),
      fetchMyTrades: jest.fn(),
      fetchDeposits: jest.fn(),
      fetchWithdrawals: jest.fn(),
      loadMarkets: jest.fn().mockResolvedValue({}),
      markets: {
        'BTC/USDT': { base: 'BTC', quote: 'USDT' }
      }
    };

    ccxt.kucoin = jest.fn().mockReturnValue(mockExchange);
    
    service = new KucoinService({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      passphrase: 'test-pass'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchBalance', () => {
    it('should fetch balance', async () => {
      mockExchange.fetchBalance.mockResolvedValueOnce({
        BTC: { free: 1, used: 0, total: 1 }
      });

      const result = await service.fetchBalance();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('fetchTrades', () => {
    it('should fetch trades', async () => {
      mockExchange.fetchMyTrades.mockResolvedValueOnce([
        { id: 'trade-1', symbol: 'BTC/USDT', amount: 0.5, price: 50000, timestamp: Date.now() }
      ]);

      const result = await service.fetchTrades('BTC/USDT');

      expect(result).toBeDefined();
    });
  });

  describe('fetchAllTransactions', () => {
    it('should fetch all transactions', async () => {
      mockExchange.fetchBalance.mockResolvedValueOnce({ BTC: { total: 1 } });
      mockExchange.fetchMyTrades.mockResolvedValue([]);
      mockExchange.fetchDeposits.mockResolvedValueOnce([]);
      mockExchange.fetchWithdrawals.mockResolvedValueOnce([]);

      const result = await service.fetchAllTransactions();

      expect(result).toBeDefined();
    });
  });

  describe('testConnection', () => {
    it('should test connection successfully', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { total: 1 }
      });

      const result = await service.testConnection();

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
    });

    it('should handle connection failures', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Invalid credentials'));

      const result = await service.testConnection();

      expect(result.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limit errors', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(service.fetchBalance()).rejects.toThrow();
    });

    it('should handle authentication errors', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Invalid API key'));

      await expect(service.fetchBalance()).rejects.toThrow();
    });

    it('should handle network timeouts', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Network timeout'));

      await expect(service.fetchBalance()).rejects.toThrow();
    });
  });

  describe('Asset Discovery', () => {
    it('should discover assets from balance', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { total: 1 },
        ETH: { total: 10 },
        USDT: { total: 1000 }
      });
      mockExchange.fetchMyTrades.mockResolvedValue([]);

      await service.fetchAllTransactions();

      expect(mockExchange.fetchBalance).toHaveBeenCalled();
    });
  });

  describe('fetchTrades - symbol scanning', () => {
    it('should scan multiple symbols when no specific symbol provided', async () => {
      const markets = {
        'BTC/USDT': { id: '1', symbol: 'BTC/USDT' },
        'ETH/USDT': { id: '2', symbol: 'ETH/USDT' },
        'SOL/USDT': { id: '3', symbol: 'SOL/USDT' },
        'DOGE/USDT': { id: '4', symbol: 'DOGE/USDT' },
        'XRP/USDT': { id: '5', symbol: 'XRP/USDT' }
      };

      mockExchange.loadMarkets.mockResolvedValue(markets);
      mockExchange.fetchMyTrades.mockResolvedValue([{ 
        id: 't1', 
        symbol: 'BTC/USDT', 
        side: 'buy',
        amount: 1, 
        price: 50000, 
        cost: 50000, 
        fee: { cost: 10, currency: 'USDT' }, 
        timestamp: Date.now(), 
        datetime: new Date().toISOString() 
      }]);

      const result = await service.fetchTrades();

      expect(mockExchange.loadMarkets).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should continue on individual symbol failures', async () => {
      const markets = {
        'BTC/USDT': { id: '1', symbol: 'BTC/USDT' },
        'ETH/USDT': { id: '2', symbol: 'ETH/USDT' },
        'SOL/USDT': { id: '3', symbol: 'SOL/USDT' }
      };

      mockExchange.loadMarkets.mockResolvedValue(markets);
      mockExchange.fetchMyTrades
        .mockResolvedValueOnce([{ 
          id: 't1', 
          symbol: 'BTC/USDT', 
          side: 'buy',
          amount: 1, 
          price: 50000, 
          cost: 50000, 
          fee: { cost: 10, currency: 'USDT' }, 
          timestamp: Date.now(), 
          datetime: new Date().toISOString() 
        }])
        .mockRejectedValueOnce(new Error('ETH pair error'))
        .mockResolvedValueOnce([{ 
          id: 't3', 
          symbol: 'SOL/USDT', 
          side: 'buy',
          amount: 100, 
          price: 200, 
          cost: 20000, 
          fee: { cost: 2, currency: 'USDT' }, 
          timestamp: Date.now(), 
          datetime: new Date().toISOString() 
        }]);

      const result = await service.fetchTrades();

      expect(result.length).toBe(2); // BTC and SOL trades, ETH failed
    });
  });

  describe('fetchAllData', () => {
    it('should fetch all data types successfully', async () => {
      mockExchange.fetchBalance.mockResolvedValue({ BTC: { free: 1, used: 0, total: 1 } });
      mockExchange.fetchMyTrades.mockResolvedValue([{ id: 't1', symbol: 'BTC/USDT', amount: 1, price: 50000, cost: 50000, fee: { cost: 10, currency: 'USDT' }, timestamp: Date.now(), datetime: new Date().toISOString() }]);
      mockExchange.fetchDeposits.mockResolvedValue([{ id: 'd1', currency: 'BTC', amount: 1, timestamp: Date.now(), status: 'ok' }]);
      mockExchange.fetchWithdrawals.mockResolvedValue([{ id: 'w1', currency: 'ETH', amount: 10, timestamp: Date.now(), status: 'ok' }]);

      const result = await service.fetchAllData();

      expect(result.balance).toBeDefined();
      expect(result.trades).toBeDefined();
      expect(result.deposits).toBeDefined();
      expect(result.withdrawals).toBeDefined();
    });

    it('should propagate errors from fetchAllData', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Balance error'));

      await expect(service.fetchAllData()).rejects.toThrow('Balance error');
    });
  });

  describe('getAccountInfo', () => {
    it('should return account information with balance info', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { total: 1 },
        info: {
          type: 'main',
          accounts: [
            { balance: '1.0' },
            { balance: '10.0' }
          ]
        }
      });

      const result = await service.getAccountInfo();

      expect(result.exchange).toBe('kucoin');
      expect(result.accountType).toBe('main');
      expect(result.canTrade).toBe(true);
      expect(result.canWithdraw).toBe(true);
      expect(result.canDeposit).toBe(true);
      expect(result.totalBalance).toBe(11); // 1.0 + 10.0
      expect(result.timestamp).toBeDefined();
    });

    it('should handle missing account type', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { total: 1 },
        info: {}
      });

      const result = await service.getAccountInfo();

      expect(result.accountType).toBe('main'); // Default fallback
    });

    it('should handle getAccountInfo errors', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('API error'));

      await expect(service.getAccountInfo()).rejects.toThrow('API error');
    });
  });

  describe('status mapping', () => {
    it('should map deposit status correctly', () => {
      expect(service.mapDepositStatus('ok')).toBe('completed');
      expect(service.mapDepositStatus('SUCCESS')).toBe('completed');
      expect(service.mapDepositStatus('PROCESSING')).toBe('processing');
      expect(service.mapDepositStatus('PENDING')).toBe('pending');
      expect(service.mapDepositStatus('FAILED')).toBe('failed');
      expect(service.mapDepositStatus('UNKNOWN')).toBe('UNKNOWN');
    });

    it('should map withdrawal status correctly', () => {
      expect(service.mapWithdrawalStatus('ok')).toBe('completed');
      expect(service.mapWithdrawalStatus('SUCCESS')).toBe('completed');
      expect(service.mapWithdrawalStatus('PROCESSING')).toBe('processing');
      expect(service.mapWithdrawalStatus('PENDING')).toBe('pending');
      expect(service.mapWithdrawalStatus('FAILED')).toBe('failed');
      expect(service.mapWithdrawalStatus('CANCELLED')).toBe('CANCELLED');
    });
  });

  describe('calculateTotalBalance', () => {
    it('should calculate total balance from accounts', () => {
      const balance = {
        info: {
          accounts: [
            { balance: '100.5' },
            { balance: '250.75' },
            { balance: '49.25' }
          ]
        }
      };

      const total = service.calculateTotalBalance(balance);
      expect(total).toBe(400.5); // 100.5 + 250.75 + 49.25
    });

    it('should handle missing accounts array', () => {
      const balance = { info: {} };

      const total = service.calculateTotalBalance(balance);
      expect(total).toBe(0);
    });

    it('should handle invalid balance values', () => {
      const balance = {
        info: {
          accounts: [
            { balance: 'invalid' },
            { balance: '100' },
            { balance: null }
          ]
        }
      };

      const total = service.calculateTotalBalance(balance);
      expect(total).toBe(100); // Only valid value
    });
  });

  describe('fetchAllTransactions - comprehensive', () => {
    it('should fetch and combine all transaction types', async () => {
      mockExchange.fetchBalance.mockResolvedValue({ BTC: { total: 1 } });
      mockExchange.loadMarkets.mockResolvedValue({});
      mockExchange.fetchMyTrades.mockResolvedValue([
        { id: 't1', symbol: 'BTC/USDT', amount: 0.5, price: 50000, cost: 25000, fee: { cost: 5, currency: 'USDT' }, timestamp: Date.now(), datetime: new Date().toISOString() }
      ]);
      mockExchange.fetchDeposits.mockResolvedValue([
        { id: 'd1', currency: 'BTC', amount: 1, timestamp: Date.now(), status: 'ok', txid: 'tx-d1', network: 'BTC' }
      ]);
      mockExchange.fetchWithdrawals.mockResolvedValue([
        { id: 'w1', currency: 'ETH', amount: 10, timestamp: Date.now(), status: 'ok', txid: 'tx-w1', network: 'ETH', fee: { cost: 0.001, currency: 'ETH' } }
      ]);

      const result = await service.fetchAllTransactions();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle fetchAllTransactions with date filtering', async () => {
      const since = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago

      mockExchange.fetchBalance.mockResolvedValue({ BTC: { total: 1 } });
      mockExchange.loadMarkets.mockResolvedValue({
        'BTC/USDT': { id: '1', symbol: 'BTC/USDT' }
      });
      mockExchange.fetchMyTrades.mockResolvedValue([{ 
        id: 't1', 
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1, 
        price: 50000, 
        cost: 50000, 
        fee: { cost: 10, currency: 'USDT' }, 
        timestamp: Date.now(), 
        datetime: new Date().toISOString() 
      }]);
      mockExchange.fetchDeposits.mockResolvedValue([]);
      mockExchange.fetchWithdrawals.mockResolvedValue([]);

      const result = await service.fetchAllTransactions(since);

      // fetchAllTransactions internally calls fetchTrades, not fetchMyTrades directly
      expect(mockExchange.fetchBalance).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

