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
});
