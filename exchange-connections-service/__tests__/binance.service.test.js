const BinanceService = require('../services/binance.service');
const ccxt = require('ccxt');

jest.mock('ccxt');

describe('BinanceService', () => {
  let mockExchange;
  let service;

  beforeEach(() => {
    mockExchange = {
      fetchBalance: jest.fn(),
      fetchMyTrades: jest.fn(),
      fetchDeposits: jest.fn(),
      fetchWithdrawals: jest.fn(),
      fetchTickers: jest.fn(),
      loadMarkets: jest.fn().mockResolvedValue({}),
      markets: {
        'BTC/USDT': { id: 'BTCUSDT', symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT' },
        'ETH/USDT': { id: 'ETHUSDT', symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT' }
      }
    };

    ccxt.binance = jest.fn().mockReturnValue(mockExchange);
    
    service = new BinanceService({
      apiKey: 'test-key',
      apiSecret: 'test-secret'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchBalance', () => {
    it('should fetch and format balance', async () => {
      mockExchange.fetchBalance.mockResolvedValueOnce({
        BTC: { free: 1.5, used: 0.5, total: 2.0 },
        ETH: { free: 10, used: 2, total: 12 }
      });

      const result = await service.fetchBalance();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle errors', async () => {
      mockExchange.fetchBalance.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.fetchBalance()).rejects.toThrow();
    });
  });



  describe('fetchAllTransactions', () => {
    it('should fetch all transaction types', async () => {
      mockExchange.fetchBalance.mockResolvedValueOnce({
        BTC: { total: 1 }
      });

      mockExchange.fetchMyTrades.mockResolvedValue([]);
      mockExchange.fetchDeposits.mockResolvedValueOnce([]);
      mockExchange.fetchWithdrawals.mockResolvedValueOnce([]);

      const result = await service.fetchAllTransactions(Date.now());

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockExchange.fetchBalance.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.fetchAllTransactions()).rejects.toThrow();
    });
  });

  describe('formatTrades', () => {
    it('should format trades correctly', () => {
      const trades = [
        {
          id: 'trade-1',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.5,
          price: 50000,
          timestamp: Date.now()
        }
      ];

      const result = service.formatTrades(trades);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should handle empty trades array', () => {
      const result = service.formatTrades([]);

      expect(result).toEqual([]);
    });

    it('should extract asset from symbol', () => {
      const trades = [
        {
          id: 'trade-1',
          symbol: 'ETH/USDT',
          side: 'sell',
          amount: 10,
          price: 3000,
          timestamp: Date.now()
        }
      ];

      const result = service.formatTrades(trades);

      expect(result[0].asset).toBe('ETH');
      expect(result[0].type).toBe('sell');
    });
  });

  describe('fetchDeposits', () => {
    it('should fetch deposit history', async () => {
      mockExchange.fetchDeposits.mockResolvedValue([
        { currency: 'BTC', amount: 1, timestamp: Date.now(), status: 'ok' }
      ]);

      const result = await service.fetchDeposits();

      expect(Array.isArray(result)).toBe(true);
      expect(mockExchange.fetchDeposits).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockExchange.fetchDeposits.mockRejectedValue(new Error('API Error'));

      const result = await service.fetchDeposits().catch(e => []);

      expect(result).toEqual([]);
    });
  });

  describe('fetchWithdrawals', () => {
    it('should fetch withdrawal history', async () => {
      mockExchange.fetchWithdrawals.mockResolvedValue([
        { currency: 'ETH', amount: 5, timestamp: Date.now() }
      ]);

      const result = await service.fetchWithdrawals();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rate limiting', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(service.fetchBalance()).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Network error'));

      await expect(service.fetchBalance()).rejects.toThrow();
    });

    it('should handle invalid credentials', async () => {
      mockExchange.fetchBalance.mockRejectedValue(new Error('Invalid API key'));

      await expect(service.fetchBalance()).rejects.toThrow();
    });
  });

  describe('testConnection', () => {
    it('should successfully test connection', async () => {
      mockExchange.fetchBalance.mockResolvedValueOnce({
        BTC: { total: 1 }
      });

      const result = await service.testConnection();

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
    });

    it('should handle connection failures', async () => {
      mockExchange.fetchBalance.mockRejectedValueOnce(new Error('Invalid API key'));

      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid API key');
    });
  });

  describe('fetchTradesForAssets', () => {
    it('should fetch trades for multiple assets', async () => {
      mockExchange.fetchMyTrades.mockResolvedValue([
        { symbol: 'BTC/USDT', side: 'buy', amount: 1 },
        { symbol: 'ETH/USDT', side: 'sell', amount: 10 }
      ]);

      const result = await service.fetchTradesForAssets(['BTC', 'ETH'], Date.now());

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty asset list', async () => {
      const result = await service.fetchTradesForAssets([], Date.now());

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle API errors per asset', async () => {
      mockExchange.fetchMyTrades
        .mockResolvedValueOnce([{ symbol: 'BTC/USDT' }])
        .mockRejectedValueOnce(new Error('Symbol not found'));

      const result = await service.fetchTradesForAssets(['BTC', 'ETH'], Date.now());

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Currency Mapping', () => {
    it('should map asset symbols to trading pairs', () => {
      const trades = [
        { symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000, timestamp: Date.now() },
        { symbol: 'ETH/USDT', side: 'sell', amount: 10, price: 2500, timestamp: Date.now() }
      ];

      const result = service.formatTrades(trades);

      expect(result.some(t => t.asset === 'BTC')).toBe(true);
      expect(result.some(t => t.asset === 'ETH')).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should continue after partial failures in deposits', async () => {
      mockExchange.fetchDeposits.mockResolvedValueOnce([
        { currency: 'BTC', amount: 1, status: 'ok' }
      ]);

      const result = await service.fetchDeposits();

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array on complete deposit failure', async () => {
      mockExchange.fetchDeposits.mockRejectedValueOnce(new Error('API Error'));

      const result = await service.fetchDeposits();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('fetchPortfolioWithStats', () => {
    it('should fetch portfolio with calculated statistics', async () => {
      mockExchange.fetchBalance.mockResolvedValueOnce({
        BTC: { free: 1.5, used: 0.5, total: 2.0 },
        ETH: { free: 10, used: 2, total: 12 }
      });

      mockExchange.fetchMyTrades.mockResolvedValue([
        {
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 1,
          price: 45000,
          cost: 45000,
          timestamp: Date.now()
        },
        {
          symbol: 'ETH/USDT',
          side: 'buy',
          amount: 10,
          price: 2000,
          cost: 20000,
          timestamp: Date.now()
        }
      ]);

      const result = await service.fetchPortfolioWithStats();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('avgPrice');
      expect(result[0]).toHaveProperty('totalCostBasis');
    });

    it('should handle timestamp errors (-1021)', async () => {
      const timestampError = new Error('Timestamp for this request was 1000ms ahead of the server\'s time. -1021');
      
      // Mock fetchBalance to reject with timestamp error
      mockExchange.fetchBalance.mockRejectedValueOnce(timestampError);

      try {
        await service.fetchPortfolioWithStats();
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toMatch(/recvWindow/);
      }
    });

    it('should handle zero balance assets', async () => {
      mockExchange.fetchBalance.mockResolvedValueOnce({
        BTC: { free: 0, used: 0, total: 0 },
        ETH: { free: 10, used: 0, total: 10 }
      });

      mockExchange.fetchMyTrades.mockResolvedValue([]);
      mockExchange.sapiGetConvertTradeFlow = undefined; // No conversion API

      const result = await service.fetchPortfolioWithStats();

      expect(Array.isArray(result)).toBe(true);
      // Should filter out zero balances
    });
  });

  describe('fetchAllConversions', () => {
    it('should fetch conversion history when API is available', async () => {
      const mockConversions = [
        {
          fromAsset: 'BTC',
          toAsset: 'ETH',
          fromAmount: 0.1,
          toAmount: 2.5,
          price: 25,
          time: Date.now()
        }
      ];

      mockExchange.sapiGetConvertTradeFlow = jest.fn().mockResolvedValue({
        list: mockConversions
      });

      const result = await service.fetchAllConversions(new Date('2024-01-01'), new Date());

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when conversion API is not available', async () => {
      // No conversion API method mocked

      const result = await service.fetchAllConversions(new Date('2024-01-01'), new Date());

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle API errors in conversion fetching', async () => {
      mockExchange.sapiGetConvertTradeFlow = jest.fn().mockRejectedValue(
        new Error('Conversion API error')
      );

      const result = await service.fetchAllConversions(new Date('2024-01-01'), new Date());

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('calculateAssetStats', () => {
    it('should calculate weighted average price for buy trades', () => {
      const trades = [
        { asset: 'BTC', type: 'buy', qty: 1, price: 40000, cost: 40000, category: 'trade' },
        { asset: 'BTC', type: 'buy', qty: 1, price: 50000, cost: 50000, category: 'trade' }
      ];

      const stats = service.calculateAssetStats(trades, []);

      expect(stats.BTC).toBeDefined();
      expect(stats.BTC.avgPrice).toBe(45000); // (40000 + 50000) / 2
      expect(stats.BTC.costBasis).toBe(90000);
    });

    it('should handle sell trades correctly', () => {
      const trades = [
        { asset: 'BTC', type: 'buy', qty: 2, price: 50000, cost: 100000, category: 'trade' },
        { asset: 'BTC', type: 'sell', qty: 1, price: 60000, cost: 60000, category: 'trade' }
      ];

      const stats = service.calculateAssetStats(trades, []);

      expect(stats.BTC).toBeDefined();
      // After selling 1 BTC, should still have 1 BTC with original avg price
    });

    it('should include conversion transactions in stats', () => {
      const trades = [];
      const conversions = [
        {
          createTime: Date.now(),
          toAsset: 'ETH',
          toAmount: '10',
          fromAsset: 'USDT',
          fromAmount: '20000',
          ratio: '0.0005'
        }
      ];

      const stats = service.calculateAssetStats(trades, conversions);

      expect(stats.ETH).toBeDefined();
      expect(stats.ETH.avgPrice).toBeGreaterThan(0);
      expect(stats.ETH.costBasis).toBe(20000);
    });

    it('should return empty object for no trades', () => {
      const stats = service.calculateAssetStats([], []);

      expect(typeof stats).toBe('object');
      expect(Object.keys(stats).length).toBe(0);
    });
  });

  describe('fetchWithdrawals', () => {
    it('should format withdrawals correctly', async () => {
      mockExchange.fetchWithdrawals.mockResolvedValue([
        {
          currency: 'BTC',
          amount: 0.5,
          timestamp: Date.now(),
          status: 'ok',
          txid: 'tx-123',
          fee: { cost: 0.0001, currency: 'BTC' }
        }
      ]);

      const result = await service.fetchWithdrawals();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('withdraw');
    });

    it('should handle withdrawals without fees', async () => {
      mockExchange.fetchWithdrawals.mockResolvedValue([
        {
          currency: 'ETH',
          amount: 5,
          timestamp: Date.now(),
          status: 'ok'
        }
      ]);

      const result = await service.fetchWithdrawals();

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array on withdrawal fetch error', async () => {
      mockExchange.fetchWithdrawals.mockRejectedValue(new Error('API Error'));

      const result = await service.fetchWithdrawals();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('Constructor Options', () => {
    it('should use binanceus for US region', () => {
      ccxt.binanceus = jest.fn().mockReturnValue(mockExchange);

      const usService = new BinanceService('key', 'secret', { region: 'us' });

      expect(ccxt.binanceus).toHaveBeenCalled();
    });

    it('should set custom recvWindow', () => {
      const customService = new BinanceService('key', 'secret', {
        recvWindow: 120000,
        timeout: 60000
      });

      expect(customService.recvWindow).toBe(120000);
    });

    it('should enforce minimum recvWindow', () => {
      const minService = new BinanceService('key', 'secret', { recvWindow: 1000 });

      expect(minService.recvWindow).toBeGreaterThanOrEqual(60000);
    });
  });

  describe('formatDeposits', () => {
    it('should format deposits with all fields', async () => {
      mockExchange.fetchDeposits.mockResolvedValue([
        {
          currency: 'USDT',
          amount: 10000,
          timestamp: Date.now(),
          status: 'ok',
          txid: 'deposit-tx-1',
          address: 'wallet-address-123',
          network: 'TRC20'
        }
      ]);

      const result = await service.fetchDeposits();

      expect(result[0]).toMatchObject({
        type: 'deposit',
        asset: 'USDT',
        quantity: 10000
      });
    });

    it('should handle deposits with missing optional fields', async () => {
      mockExchange.fetchDeposits.mockResolvedValue([
        {
          currency: 'BTC',
          amount: 1,
          timestamp: Date.now()
        }
      ]);

      const result = await service.fetchDeposits();

      expect(result[0].type).toBe('deposit');
      expect(result[0].asset).toBe('BTC');
    });
  });
});

