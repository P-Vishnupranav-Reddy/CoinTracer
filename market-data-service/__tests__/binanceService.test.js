const axios = require('axios');

// Mock axios before importing binanceService
jest.mock('axios');

const mockAxiosInstance = {
  get: jest.fn()
};

axios.create = jest.fn(() => mockAxiosInstance);

// Mock NodeCache to allow cache control in tests
jest.mock('node-cache');
const NodeCache = require('node-cache');
let mockCacheData = {};
NodeCache.mockImplementation(() => ({
  get: jest.fn((key) => mockCacheData[key]),
  set: jest.fn((key, value) => { mockCacheData[key] = value; }),
  flushAll: jest.fn(() => { mockCacheData = {}; })
}));

// Now import binanceService after mocking
const binanceService = require('../services/binance');

describe('Binance Service', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear cache between tests
    mockCacheData = {};
  });

  describe('getExchangeInfo', () => {
    
    it('should fetch and cache exchange info', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCUSDT',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            status: 'TRADING'
          }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockExchangeInfo });

      const result = await binanceService.getExchangeInfo();

      expect(result).toEqual(mockExchangeInfo);
      expect(result.symbols).toHaveLength(1);
    });
  });

  describe('resolveSymbols', () => {
    
    it('should resolve bitcoin alias to BTC', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCUSDT',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            status: 'TRADING'
          }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockExchangeInfo });

      const result = await binanceService.resolveSymbols(['bitcoin'], 'usd');

      expect(result).toHaveLength(1);
      expect(result[0]).toBeTruthy();
      expect(result[0].baseAsset).toBe('BTC');
    });

    it('should resolve multiple assets', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCUSDT',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            status: 'TRADING'
          },
          {
            symbol: 'ETHUSDT',
            baseAsset: 'ETH',
            quoteAsset: 'USDT',
            status: 'TRADING'
          }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockExchangeInfo });

      const result = await binanceService.resolveSymbols(['bitcoin', 'ethereum'], 'usd');

      expect(result).toHaveLength(2);
      expect(result[0].baseAsset).toBe('BTC');
      expect(result[1].baseAsset).toBe('ETH');
    });

    it('should return null for unknown assets', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCUSDT',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            status: 'TRADING'
          }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockExchangeInfo });

      const result = await binanceService.resolveSymbols(['unknownasset'], 'usd');

      expect(result).toHaveLength(1);
      expect(result[0]).toBeNull();
    });

    it('should prefer USDT over other quote currencies for USD', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCBUSD',
            baseAsset: 'BTC',
            quoteAsset: 'BUSD',
            status: 'TRADING'
          },
          {
            symbol: 'BTCUSDT',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            status: 'TRADING'
          }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockExchangeInfo });

      const result = await binanceService.resolveSymbols(['btc'], 'usd');

      expect(result[0].quoteAsset).toBe('USDT');
    });
  });

  describe('pickQuotesForVs', () => {
    
    it('should return USDT for USD currency', () => {
      const quotes = binanceService.pickQuotesForVs('usd');
      
      expect(quotes).toContain('USDT');
      expect(quotes[0]).toBe('USDT');
    });

    it('should handle case insensitivity', () => {
      const quotes = binanceService.pickQuotesForVs('USD');
      
      expect(quotes).toContain('USDT');
    });
  });

  describe('getTicker24', () => {
    
    it('should fetch 24h ticker data', async () => {
      const mockTicker = {
        symbol: 'BTCUSDT',
        lastPrice: '50000',
        priceChange: '1000',
        priceChangePercent: '2.04',
        volume: '12345.67',
        quoteVolume: '617283500'
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockTicker });

      const result = await binanceService.getTicker24('BTCUSDT');

      expect(result.symbol).toBe('BTCUSDT');
      expect(parseFloat(result.lastPrice)).toBe(50000);
    });

    it('should throw error on network failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(binanceService.getTicker24('INVALID')).rejects.toThrow('Network error');
    });
  });

  describe('getKlines', () => {
    
    it('should fetch kline/candlestick data', async () => {
      const mockKlines = [
        [
          1640000000000, // Open time
          '50000',       // Open
          '51000',       // High
          '49000',       // Low
          '50500',       // Close
          '1234.56',     // Volume
          1640003599999, // Close time
          '62172800',    // Quote asset volume
          1000,          // Number of trades
          '617.28',      // Taker buy base volume
          '30858400',    // Taker buy quote volume
          '0'            // Ignore
        ]
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockKlines });

      const result = await binanceService.getKlines('BTCUSDT', '1h', 100);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle custom start and end times', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      const startTime = 1640000000000;
      const endTime = 1640100000000;

      await binanceService.getKlines('BTCUSDT', '1d', 30, startTime, endTime);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('klines'),
        expect.objectContaining({
          params: expect.objectContaining({
            startTime,
            endTime
          })
        })
      );
    });

    it('should return empty array on error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

      const result = await binanceService.getKlines('INVALID', '1h');

      expect(result).toEqual([]);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getAssetChartData', () => {
    
    it('should get formatted chart data for asset', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCUSDT',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            status: 'TRADING'
          }
        ]
      };

      const mockKlines = [
        [
          1640000000000,
          '50000',
          '51000',
          '49000',
          '50500',
          '1234.56',
          1640003599999,
          '62172800',
          1000,
          '617.28',
          '30858400',
          '0'
        ]
      ];

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockExchangeInfo })
        .mockResolvedValueOnce({ data: mockKlines });

      const result = await binanceService.getAssetChartData('BTC', '1h', 100);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('time');
      expect(result[0]).toHaveProperty('open');
      expect(result[0]).toHaveProperty('high');
      expect(result[0]).toHaveProperty('low');
      expect(result[0]).toHaveProperty('close');
      expect(result[0]).toHaveProperty('volume');
      expect(result[0].time).toBe(1640000000000);
      expect(result[0].open).toBe(50000);
    });

    it('should return null when symbol cannot be resolved', async () => {
      const mockExchangeInfo = {
        symbols: []
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockExchangeInfo });

      const result = await binanceService.getAssetChartData('UNKNOWN', '1h');

      expect(result).toBeNull();
    });

    it('should handle different intervals', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'ETHUSDT',
            baseAsset: 'ETH',
            quoteAsset: 'USDT',
            status: 'TRADING'
          }
        ]
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockExchangeInfo })
        .mockResolvedValueOnce({ data: [] });

      await binanceService.getAssetChartData('ETH', '1w', 52);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('klines'),
        expect.objectContaining({
          params: expect.objectContaining({
            interval: '1w',
            limit: 52
          })
        })
      );
    });

    it('should return empty array when klines fetch fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCUSDT',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            status: 'TRADING'
          }
        ]
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockExchangeInfo })
        .mockRejectedValueOnce(new Error('Klines error'));

      const result = await binanceService.getAssetChartData('BTC', '1h');

      expect(result).toEqual([]);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    
    it('should throw error on network failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network failure'));

      await expect(binanceService.getExchangeInfo()).rejects.toThrow('Network failure');
    });

    it('should handle malformed API responses', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { symbols: [] } });

      const result = await binanceService.resolveSymbols(['BTC'], 'USD');

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
