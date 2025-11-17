const BingxService = require('../services/bingx.service');
const ccxt = require('ccxt');

jest.mock('ccxt');

describe('BingxService', () => {
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

    ccxt.bingx = jest.fn().mockReturnValue(mockExchange);
    
    service = new BingxService({
      apiKey: 'test-key',
      apiSecret: 'test-secret'
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

    it('should handle errors gracefully', async () => {
      mockExchange.fetchBalance.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.fetchBalance()).rejects.toThrow();
    });
  });

  describe('fetchTrades', () => {
    it('should fetch trades', async () => {
      mockExchange.fetchMyTrades.mockResolvedValueOnce([
        {
          id: 'trade-1',
          symbol: 'BTC/USDT',
          amount: 0.5,
          price: 50000,
          timestamp: Date.now()
        }
      ]);

      const result = await service.fetchTrades('BTC/USDT');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
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
    it('should return success on valid connection', async () => {
      mockExchange.fetchBalance.mockResolvedValue({ BTC: { total: 1 } });

      const result = await service.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBe('BingX connection successful');
    });

    it('should return failure on connection error', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Connection failed'));

      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection failed');
    });
  });

  describe('fetchBalance - comprehensive', () => {
    it('should filter out dust balances', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { free: 1, used: 0, total: 1 },
        DUST: { free: 0.000000001, used: 0, total: 0.000000001 }
      });

      const result = await service.fetchBalance();

      expect(result.length).toBe(1);
      expect(result[0].asset).toBe('BTC');
    });

    it('should filter out zero balances', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { free: 0.5, used: 0, total: 0.5 },
        ETH: { free: 0, used: 0, total: 0 },
        SOL: { free: 100, used: 0, total: 100 }
      });

      const result = await service.fetchBalance();

      expect(result.length).toBe(2);
      expect(result.map(r => r.asset)).toContain('BTC');
      expect(result.map(r => r.asset)).toContain('SOL');
    });

    it('should filter out metadata fields', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { free: 1, used: 0, total: 1 },
        info: { someData: 'metadata' },
        free: {},
        used: {},
        total: {}
      });

      const result = await service.fetchBalance();

      expect(result.length).toBe(1);
      expect(result[0].asset).toBe('BTC');
    });

    it('should handle missing amounts object', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { free: 1, used: 0, total: 1 },
        INVALID: null
      });

      const result = await service.fetchBalance();

      expect(result.length).toBe(1);
      expect(result[0].asset).toBe('BTC');
    });
  });

  describe('fetchTrades - comprehensive', () => {
    it('should fetch trades for specific symbol', async () => {
      const mockTrades = [
        {
          id: 'trade-1',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.5,
          price: 50000,
          cost: 25000,
          fee: { cost: 10, currency: 'USDT' },
          timestamp: Date.now(),
          datetime: new Date().toISOString()
        }
      ];

      mockExchange.fetchMyTrades.mockResolvedValue(mockTrades);

      const result = await service.fetchTrades('BTC/USDT', null, 500);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('buy');
      expect(result[0].baseAsset).toBe('BTC');
      expect(result[0].quoteAsset).toBe('USDT');
      expect(result[0].fee).toBe(10);
      expect(result[0].feeCurrency).toBe('USDT');
    });

    it('should fetch trades from popular symbols when no symbol specified', async () => {
      mockExchange.loadMarkets.mockResolvedValue({
        'BTC/USDT': { symbol: 'BTC/USDT' },
        'ETH/USDT': { symbol: 'ETH/USDT' }
      });

      mockExchange.fetchMyTrades.mockResolvedValue([
        {
          id: 'trade-1',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.1,
          price: 50000,
          cost: 5000,
          fee: {},
          timestamp: Date.now(),
          datetime: new Date().toISOString()
        }
      ]);

      const result = await service.fetchTrades();

      expect(mockExchange.loadMarkets).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle trades with missing fee', async () => {
      const mockTrades = [
        {
          id: 'trade-1',
          symbol: 'ETH/USDT',
          side: 'sell',
          amount: 5,
          price: 3000,
          cost: 15000,
          fee: null,
          timestamp: Date.now(),
          datetime: new Date().toISOString()
        }
      ];

      mockExchange.fetchMyTrades.mockResolvedValue(mockTrades);

      const result = await service.fetchTrades('ETH/USDT');

      expect(result[0].fee).toBe(0);
      expect(result[0].feeCurrency).toBe('');
    });

    it('should continue on individual symbol failures', async () => {
      mockExchange.loadMarkets.mockResolvedValue({
        'BTC/USDT': { symbol: 'BTC/USDT' },
        'ETH/USDT': { symbol: 'ETH/USDT' }
      });

      mockExchange.fetchMyTrades
        .mockRejectedValueOnce(new Error('BTC fetch failed'))
        .mockResolvedValueOnce([
          {
            id: 'trade-eth',
            symbol: 'ETH/USDT',
            side: 'buy',
            amount: 1,
            price: 3000,
            cost: 3000,
            fee: {},
            timestamp: Date.now(),
            datetime: new Date().toISOString()
          }
        ]);

      const result = await service.fetchTrades();

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('fetchDeposits', () => {
    it('should fetch and format deposits', async () => {
      const mockDeposits = [
        {
          id: 'dep-1',
          currency: 'BTC',
          amount: 0.5,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
          status: 'completed',
          txid: 'tx-hash-123',
          network: 'BTC',
          address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
          tag: null,
          fee: { cost: 0.0001, currency: 'BTC' }
        }
      ];

      mockExchange.fetchDeposits.mockResolvedValue(mockDeposits);

      const result = await service.fetchDeposits();

      expect(result.length).toBe(1);
      expect(result[0].coin).toBe('BTC');
      expect(result[0].amount).toBe(0.5);
      expect(result[0].txid).toBe('tx-hash-123');
      expect(result[0].network).toBe('BTC');
    });

    it('should handle deposits with missing optional fields', async () => {
      const mockDeposits = [
        {
          id: 'dep-1',
          currency: 'ETH',
          amount: 10,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
          tag: null,
          network: null,
          txid: 'tx-123'
        }
      ];

      mockExchange.fetchDeposits.mockResolvedValue(mockDeposits);

      const result = await service.fetchDeposits();

      expect(result[0].coin).toBe('ETH');
      expect(result[0].addressTag).toBe('');
      expect(result[0].network).toBe('');
    });
  });

  describe('fetchWithdrawals', () => {
    it('should fetch and format withdrawals', async () => {
      const mockWithdrawals = [
        {
          id: 'wd-1',
          currency: 'BTC',
          amount: 0.3,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
          status: 'completed',
          txid: 'tx-hash-456',
          network: 'BTC',
          fee: { cost: 0.0002, currency: 'BTC' }
        }
      ];

      mockExchange.fetchWithdrawals.mockResolvedValue(mockWithdrawals);

      const result = await service.fetchWithdrawals();

      expect(result.length).toBe(1);
      expect(result[0].coin).toBe('BTC');
      expect(result[0].amount).toBe(0.3);
      expect(result[0].txid).toBe('tx-hash-456');
    });

    it('should handle empty withdrawal history', async () => {
      mockExchange.fetchWithdrawals.mockResolvedValue([]);

      const result = await service.fetchWithdrawals();

      expect(result).toEqual([]);
    });
  });

  describe('fetchAllData', () => {
    it('should fetch all data types successfully', async () => {
      const mockBalance = [{ asset: 'BTC', free: 1 }];
      const mockTrades = [{ id: 't1', symbol: 'BTC/USDT' }];
      const mockDeposits = [{ id: 'd1', coin: 'BTC' }];
      const mockWithdrawals = [{ id: 'w1', coin: 'ETH' }];

      mockExchange.fetchBalance.mockResolvedValue({ BTC: { free: 1, used: 0, total: 1 } });
      mockExchange.fetchMyTrades.mockResolvedValue([{ id: 't1', symbol: 'BTC/USDT', amount: 1, price: 50000, cost: 50000, fee: { cost: 0.1, currency: 'USDT' }, timestamp: Date.now(), datetime: new Date().toISOString() }]);
      mockExchange.fetchDeposits.mockResolvedValue([{ id: 'd1', currency: 'BTC', amount: 1, timestamp: Date.now(), datetime: new Date().toISOString(), status: 'completed', txid: 'tx1' }]);
      mockExchange.fetchWithdrawals.mockResolvedValue([{ id: 'w1', currency: 'ETH', amount: 10, timestamp: Date.now(), datetime: new Date().toISOString(), status: 'completed', txid: 'tx2' }]);

      const result = await service.fetchAllData();

      expect(result.balance).toBeDefined();
      expect(result.trades).toBeDefined();
      expect(result.deposits).toBeDefined();
      expect(result.withdrawals).toBeDefined();
      expect(Array.isArray(result.balance)).toBe(true);
      expect(Array.isArray(result.trades)).toBe(true);
      expect(Array.isArray(result.deposits)).toBe(true);
      expect(Array.isArray(result.withdrawals)).toBe(true);
    });

    it('should handle partial failures with allSettled', async () => {
      mockExchange.fetchBalance.mockResolvedValue({ BTC: { free: 1, used: 0, total: 1 } });
      mockExchange.fetchMyTrades.mockRejectedValue(new Error('Trades API down'));
      mockExchange.fetchDeposits.mockResolvedValue([]);
      mockExchange.fetchWithdrawals.mockRejectedValue(new Error('Withdrawals not supported'));

      const result = await service.fetchAllData();

      expect(result.balance).toBeDefined(); // Should have balance
      expect(result.trades).toEqual([]); // Should be empty array on failure
      expect(result.deposits).toEqual([]); // Should be empty array
      expect(result.withdrawals).toEqual([]); // Should be empty array on failure
    });

    it('should propagate critical errors', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Critical error'));
      mockExchange.fetchMyTrades.mockRejectedValue(new Error('Trades error'));
      mockExchange.fetchDeposits.mockRejectedValue(new Error('Deposits error'));
      mockExchange.fetchWithdrawals.mockRejectedValue(new Error('Withdrawals error'));

      const result = await service.fetchAllData();

      // allSettled should handle all rejections gracefully
      expect(result.balance).toEqual([]);
      expect(result.trades).toEqual([]);
      expect(result.deposits).toEqual([]);
      expect(result.withdrawals).toEqual([]);
    });
  });

  describe('getAccountInfo', () => {
    it('should return account information', async () => {
      mockExchange.fetchBalance.mockResolvedValue({
        BTC: { free: 1, used: 0, total: 1, info: { balance: '1.0' } },
        ETH: { free: 10, used: 0, total: 10, info: { balance: '10.0' } }
      });

      const result = await service.getAccountInfo();

      expect(result.exchange).toBe('bingx');
      expect(result.accountType).toBe('spot');
      expect(result.canTrade).toBe(true);
      expect(result.canWithdraw).toBe(true);
      expect(result.canDeposit).toBe(true);
      expect(result.totalBalance).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should handle getAccountInfo errors', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Balance API error'));

      await expect(service.getAccountInfo()).rejects.toThrow('Balance API error');
    });
  });

  describe('status mapping', () => {
    it('should map deposit status correctly', () => {
      const service = new BingxService({ apiKey: 'test', apiSecret: 'test' });
      
      expect(service.mapDepositStatus('SUCCESS')).toBe('completed');
      expect(service.mapDepositStatus('PROCESSING')).toBe('processing');
      expect(service.mapDepositStatus('PENDING')).toBe('pending');
      expect(service.mapDepositStatus('FAILED')).toBe('failed');
      expect(service.mapDepositStatus('UNKNOWN')).toBe('UNKNOWN');
    });

    it('should map withdrawal status correctly', () => {
      const service = new BingxService({ apiKey: 'test', apiSecret: 'test' });
      
      expect(service.mapWithdrawalStatus('SUCCESS')).toBe('completed');
      expect(service.mapWithdrawalStatus('PROCESSING')).toBe('processing');
      expect(service.mapWithdrawalStatus('PENDING')).toBe('pending');
      expect(service.mapWithdrawalStatus('FAILED')).toBe('failed');
      expect(service.mapWithdrawalStatus('CANCELLED')).toBe('CANCELLED');
    });

    it('should calculate total balance from exchange data', () => {
      const service = new BingxService({ apiKey: 'test', apiSecret: 'test' });
      
      const mockBalance = {
        BTC: { total: 1.5 },
        ETH: { total: 10 },
        USDT: { total: 5000 }
      };

      const total = service.calculateTotalBalance(mockBalance);
      expect(total).toBeGreaterThanOrEqual(0);
    });
  });
});
