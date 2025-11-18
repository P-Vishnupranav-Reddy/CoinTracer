jest.mock('axios');
jest.mock('node-cache');

const axios = require('axios');

// Setup axios mock
const mockAxiosInstance = {
  get: jest.fn()
};
axios.create = jest.fn(() => mockAxiosInstance);

const cmcService = require('../services/coinmarketcap');

describe('CoinMarketCap Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance.get.mockReset();
  });

  describe('normalizeSymbol', () => {
    it('should normalize symbol to uppercase', () => {
      expect(cmcService.normalizeSymbol('btc')).toBe('BTC');
      expect(cmcService.normalizeSymbol('eth')).toBe('ETH');
    });

    it('should handle common name aliases', () => {
      expect(cmcService.normalizeSymbol('bitcoin')).toBe('BTC');
      expect(cmcService.normalizeSymbol('ethereum')).toBe('ETH');
      expect(cmcService.normalizeSymbol('dogecoin')).toBe('DOGE');
    });

    it('should return null for invalid input', () => {
      expect(cmcService.normalizeSymbol(null)).toBeNull();
      expect(cmcService.normalizeSymbol(undefined)).toBeNull();
      expect(cmcService.normalizeSymbol('')).toBeNull();
    });

    it('should handle mixed case', () => {
      expect(cmcService.normalizeSymbol('BtC')).toBe('BTC');
      expect(cmcService.normalizeSymbol('Bitcoin')).toBe('BTC');
    });
  });

  describe('getLatestQuote', () => {
    it('should fetch and return quote data for a symbol', async () => {
      const mockQuoteData = {
        data: {
          BTC: [{
            id: 1,
            name: 'Bitcoin',
            symbol: 'BTC',
            slug: 'bitcoin',
            quote: {
              USD: {
                price: 50000,
                volume_24h: 1000000000,
                percent_change_24h: 2.5,
                market_cap: 950000000000,
                last_updated: '2024-01-01T00:00:00.000Z'
              }
            },
            circulating_supply: 19000000,
            total_supply: 21000000,
            max_supply: 21000000
          }]
        }
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockQuoteData });

      const result = await cmcService.getLatestQuote('BTC', 'USD');
      
      expect(result).toBeDefined();
      expect(result.symbol).toBe('BTC');
      expect(result.price).toBe(50000);
    });

    it('should return null for invalid symbol', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { data: {} } });

      const result = await cmcService.getLatestQuote('INVALID');
      expect(result).toBeNull();
    });

    it('should handle API errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const result = await cmcService.getLatestQuote('BTC');
      expect(result).toBeNull();
    });
  });

  describe('getLatestQuotes', () => {
    it('should fetch multiple quotes', async () => {
      const mockData = {
        data: {
          BTC: [{
            id: 1,
            name: 'Bitcoin',
            symbol: 'BTC',
            slug: 'bitcoin',
            quote: {
              USD: {
                price: 50000,
                volume_24h: 1000000000,
                percent_change_24h: 2.5,
                market_cap: 950000000000,
                last_updated: '2024-01-01T00:00:00.000Z'
              }
            },
            circulating_supply: 19000000
          }],
          ETH: [{
            id: 1027,
            name: 'Ethereum',
            symbol: 'ETH',
            slug: 'ethereum',
            quote: {
              USD: {
                price: 3000,
                volume_24h: 500000000,
                percent_change_24h: 1.5,
                market_cap: 360000000000,
                last_updated: '2024-01-01T00:00:00.000Z'
              }
            },
            circulating_supply: 120000000
          }]
        }
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      const result = await cmcService.getLatestQuotes(['BTC', 'ETH']);
      
      expect(Object.keys(result).length).toBe(2);
      expect(result.BTC.price).toBe(50000);
      expect(result.ETH.price).toBe(3000);
    });

    it('should return empty object for empty array', async () => {
      const result = await cmcService.getLatestQuotes([]);
      expect(result).toEqual({});
    });

    it('should filter out null symbols', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { data: {} } });

      const result = await cmcService.getLatestQuotes([null, '', undefined]);
      expect(result).toEqual({});
    });
  });

  describe('searchCryptos', () => {
    it('should return empty array for short queries', async () => {
      const result = await cmcService.searchCryptos('a');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty query', async () => {
      const result = await cmcService.searchCryptos('');
      expect(result).toEqual([]);
    });

    it('should search by symbol and name', async () => {
      const mockMap = new Map([
        ['BTC', { id: 1, symbol: 'BTC', name: 'Bitcoin', slug: 'bitcoin' }],
        ['ETH', { id: 1027, symbol: 'ETH', name: 'Ethereum', slug: 'ethereum' }]
      ]);

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [
            { id: 1, symbol: 'BTC', name: 'Bitcoin', slug: 'bitcoin' },
            { id: 1027, symbol: 'ETH', name: 'Ethereum', slug: 'ethereum' }
          ]
        }
      });

      const result = await cmcService.searchCryptos('bit', 10);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: Array.from({ length: 50 }, (_, i) => ({
            id: i,
            symbol: `SYM${i}`,
            name: `Coin ${i}`,
            slug: `coin-${i}`
          }))
        }
      });

      const result = await cmcService.searchCryptos('coin', 5);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getGlobalMetrics', () => {
    it('should fetch global market metrics', async () => {
      const mockMetrics = {
        data: {
          active_cryptocurrencies: 10000,
          total_cryptocurrencies: 12000,
          active_exchanges: 500,
          btc_dominance: 45.5,
          eth_dominance: 18.3,
          quote: {
            USD: {
              total_market_cap: 2000000000000,
              total_volume_24h: 100000000000
            }
          },
          last_updated: '2024-01-01T00:00:00.000Z'
        }
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMetrics });

      const result = await cmcService.getGlobalMetrics('USD');
      
      expect(result).toBeDefined();
      expect(result.active_cryptocurrencies).toBe(10000);
      expect(result.btc_dominance).toBe(45.5);
      expect(result.total_market_cap).toBe(2000000000000);
    });

    it('should return null on API error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const result = await cmcService.getGlobalMetrics();
      expect(result).toBeNull();
    });
  });

  describe('getCryptoInfo', () => {
    it('should fetch detailed crypto information', async () => {
      const mockMapData = {
        data: [
          { id: 1, symbol: 'BTC', name: 'Bitcoin', slug: 'bitcoin' }
        ]
      };

      const mockInfoData = {
        data: {
          1: {
            id: 1,
            name: 'Bitcoin',
            symbol: 'BTC',
            slug: 'bitcoin',
            description: 'Bitcoin is a cryptocurrency',
            logo: 'https://example.com/btc.png',
            urls: {
              website: ['https://bitcoin.org'],
              technical_doc: ['https://bitcoin.org/bitcoin.pdf'],
              twitter: ['https://twitter.com/bitcoin'],
              reddit: ['https://reddit.com/r/bitcoin']
            },
            date_added: '2013-04-28T00:00:00.000Z',
            tags: ['mineable', 'pow'],
            category: 'coin'
          }
        }
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockMapData })
        .mockResolvedValueOnce({ data: mockInfoData });

      const result = await cmcService.getCryptoInfo('BTC');
      
      expect(result).toBeDefined();
      expect(result.symbol).toBe('BTC');
      expect(result.description).toBe('Bitcoin is a cryptocurrency');
      expect(result.website).toBe('https://bitcoin.org');
    });

    it('should return null for unknown symbol', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { data: [] } });

      const result = await cmcService.getCryptoInfo('UNKNOWN');
      expect(result).toBeNull();
    });
  });

  describe('isConfigured', () => {
    it('should check if API key is configured', () => {
      // Just verify function exists and returns a boolean
      const result = cmcService.isConfigured();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getCryptoMap', () => {
    it('should fetch and cache crypto map', async () => {
      const mockData = {
        data: [
          { id: 1, symbol: 'BTC', name: 'Bitcoin', slug: 'bitcoin' },
          { id: 1027, symbol: 'ETH', name: 'Ethereum', slug: 'ethereum' }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockData });

      const result = await cmcService.getCryptoMap();
      
      expect(result instanceof Map).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should return empty map on error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const result = await cmcService.getCryptoMap();
      
      expect(result instanceof Map).toBe(true);
      expect(result.size).toBe(0);
    });
  });
});
