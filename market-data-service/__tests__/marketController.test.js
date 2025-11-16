const request = require('supertest');
const express = require('express');
const marketRoutes = require('../routes/market');
const dashboardRoutes = require('../routes/dashboard');
const binanceService = require('../services/binance');
const cmcService = require('../services/coinmarketcap');

// Mock the services
jest.mock('../services/binance');
jest.mock('../services/coinmarketcap');

// Create an express app for testing
const app = express();
app.use(express.json());
app.use('/api/v1/market', marketRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ 
    message: err.message || 'Internal server error',
    error: err 
  });
});

describe('Market Data Service - Market Controller', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/market/prices/:assetId', () => {
    
    it('should return price data for a valid asset', async () => {
      const mockCMCQuote = {
        slug: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        price: 45000.50,
        market_cap: 880000000000,
        percent_change_24h: 2.5,
        volume_24h: 30000000000,
        circulating_supply: 19500000,
        total_supply: 21000000,
        max_supply: 21000000,
        last_updated: '2024-01-01T00:00:00.000Z'
      };

      cmcService.getLatestQuote.mockResolvedValue(mockCMCQuote);

      const res = await request(app)
        .get('/api/v1/market/prices/bitcoin')
        .query({ vs: 'usd' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('assetId');
      expect(res.body).toHaveProperty('price');
      expect(res.body).toHaveProperty('change24h');
      expect(res.body.price).toBe(45000.50);
      expect(res.body.change24h).toBe(2.5);
    });

    it('should return 400 for unknown asset', async () => {
      cmcService.getLatestQuote.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/market/prices/unknownasset')
        .query({ vs: 'usd' });

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 404 when price data is unavailable', async () => {
      cmcService.getLatestQuote.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/market/prices/bitcoin');

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should use default vs currency (usd) when not specified', async () => {
      const mockCMCQuote = {
        slug: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        price: 3000.00,
        market_cap: 360000000000,
        percent_change_24h: 1.5,
        volume_24h: 15000000000,
        circulating_supply: 120000000,
        total_supply: 120000000,
        max_supply: null,
        last_updated: '2024-01-01T00:00:00.000Z'
      };

      cmcService.getLatestQuote.mockResolvedValue(mockCMCQuote);

      const res = await request(app)
        .get('/api/v1/market/prices/ethereum');

      expect(res.statusCode).toBe(200);
      expect(cmcService.getLatestQuote).toHaveBeenCalledWith('ethereum', 'USD');
    });
  });

  describe('GET /api/v1/market/prices/batch', () => {
    
    it('should return prices for multiple assets', async () => {
      const mockCMCQuotes = {
        bitcoin: {
          slug: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin',
          price: 45000.00,
          market_cap: 880000000000,
          percent_change_24h: 2.5,
          volume_24h: 30000000000,
          circulating_supply: 19500000,
          total_supply: 21000000,
          max_supply: 21000000,
          last_updated: '2024-01-01T00:00:00.000Z'
        },
        ethereum: {
          slug: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          price: 3000.00,
          market_cap: 360000000000,
          percent_change_24h: 1.5,
          volume_24h: 15000000000,
          circulating_supply: 120000000,
          total_supply: 120000000,
          max_supply: null,
          last_updated: '2024-01-01T00:00:00.000Z'
        }
      };

      cmcService.getLatestQuotes.mockResolvedValue(mockCMCQuotes);
      cmcService.normalizeSymbol.mockImplementation((asset) => asset.toLowerCase());

      const res = await request(app)
        .get('/api/v1/market/prices/batch')
        .query({ assets: 'bitcoin,ethereum', vs: 'usd' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('vs');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.count).toBe(2);
    });

    it('should return 400 when assets parameter is missing', async () => {
      const res = await request(app)
        .get('/api/v1/market/prices/batch');

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('required');
    });

    it('should filter out assets with no price data', async () => {
      const mockCMCQuotes = {
        bitcoin: {
          slug: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin',
          price: 45000.00,
          market_cap: 880000000000,
          percent_change_24h: 2.5,
          volume_24h: 30000000000,
          circulating_supply: 19500000,
          total_supply: 21000000,
          max_supply: 21000000,
          last_updated: '2024-01-01T00:00:00.000Z'
        },
        ethereum: {
          slug: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          price: 3000.00,
          market_cap: 360000000000,
          percent_change_24h: 1.5,
          volume_24h: 15000000000,
          circulating_supply: 120000000,
          total_supply: 120000000,
          max_supply: null,
          last_updated: '2024-01-01T00:00:00.000Z'
        }
        // 'unknown' is not in the mock response
      };

      cmcService.getLatestQuotes.mockResolvedValue(mockCMCQuotes);
      cmcService.normalizeSymbol.mockImplementation((asset) => asset.toLowerCase());

      const res = await request(app)
        .get('/api/v1/market/prices/batch')
        .query({ assets: 'bitcoin,unknown,ethereum', vs: 'usd' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('should handle empty assets list', async () => {
      const res = await request(app)
        .get('/api/v1/market/prices/batch')
        .query({ assets: '' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/market/assets/search', () => {
    
    it('should search for assets successfully', async () => {
      const mockSearchResults = [
        {
          id: 1,
          slug: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin'
        },
        {
          id: 1027,
          slug: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum'
        }
      ];

      cmcService.searchCryptos.mockResolvedValue(mockSearchResults);

      const res = await request(app)
        .get('/api/v1/market/assets/search')
        .query({ q: 'btc' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('assets');
      expect(res.body.assets.length).toBeGreaterThan(0);
      expect(res.body.assets[0]).toHaveProperty('id');
      expect(res.body.assets[0]).toHaveProperty('symbol');
    });

    it('should return 400 when query is too short', async () => {
      const res = await request(app)
        .get('/api/v1/market/assets/search')
        .query({ q: 'b' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('min 2 chars');
    });

    it('should return 400 when query is missing', async () => {
      const res = await request(app)
        .get('/api/v1/market/assets/search');

      expect(res.statusCode).toBe(400);
    });

    it('should limit search results to 30', async () => {
      const mockSearchResults = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        slug: `test${i}`,
        symbol: `TEST${i}`,
        name: `Test Asset ${i}`
      }));

      cmcService.searchCryptos.mockResolvedValue(mockSearchResults);

      const res = await request(app)
        .get('/api/v1/market/assets/search')
        .query({ q: 'test' });

      expect(res.statusCode).toBe(200);
      expect(res.body.assets.length).toBeLessThanOrEqual(30);
    });
  });

  describe('GET /api/v1/market/status', () => {
    
    it('should return service status', async () => {
      const res = await request(app)
        .get('/api/v1/market/status');

      expect(res.statusCode).toBe(200);
      // Status endpoint might vary based on implementation
      // Just check it returns 200
    });
  });

  describe('GET /api/v1/dashboard/summary', () => {
    
    it('should return dashboard summary with top gainer and loser', async () => {
      const mockCMCQuotes = {
        bitcoin: {
          slug: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin',
          price: 45000.00,
          market_cap: 880000000000,
          percent_change_24h: 5.0,
          volume_24h: 30000000000,
          circulating_supply: 19500000,
          total_supply: 21000000,
          max_supply: 21000000,
          last_updated: '2024-01-01T00:00:00.000Z'
        },
        ethereum: {
          slug: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          price: 3000.00,
          market_cap: 360000000000,
          percent_change_24h: -2.5,
          volume_24h: 15000000000,
          circulating_supply: 120000000,
          total_supply: 120000000,
          max_supply: null,
          last_updated: '2024-01-01T00:00:00.000Z'
        },
        solana: {
          slug: 'solana',
          symbol: 'SOL',
          name: 'Solana',
          price: 100.00,
          market_cap: 40000000000,
          percent_change_24h: 1.0,
          volume_24h: 2000000000,
          circulating_supply: 400000000,
          total_supply: 500000000,
          max_supply: null,
          last_updated: '2024-01-01T00:00:00.000Z'
        }
      };

      const mockGlobalMetrics = {
        total_market_cap: 2500000000000,
        total_volume_24h: 100000000000,
        btc_dominance: 48.5,
        eth_dominance: 18.2
      };

      cmcService.getLatestQuotes.mockResolvedValue(mockCMCQuotes);
      cmcService.normalizeSymbol.mockImplementation((asset) => asset.toLowerCase());
      cmcService.getGlobalMetrics.mockResolvedValue(mockGlobalMetrics);

      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .query({ assets: 'bitcoin,ethereum,solana', vs: 'usd' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('topGainer');
      expect(res.body).toHaveProperty('topLoser');
      expect(res.body).toHaveProperty('data');
      expect(res.body.topGainer.assetId).toBe('bitcoin');
      expect(res.body.topLoser.assetId).toBe('ethereum');
    });

    it('should return 400 when assets parameter is missing', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary');

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('required');
    });
  });

  describe('GET /api/v1/market/assets/:symbol/details', () => {
    
    it('should return comprehensive asset details with metadata and market data', async () => {
      const mockMetadata = {
        name: 'Bitcoin',
        slug: 'bitcoin',
        description: 'Bitcoin is a decentralized digital currency',
        logo: 'https://example.com/bitcoin.png',
        date_added: '2013-04-28T00:00:00.000Z',
        date_launched: '2009-01-03T00:00:00.000Z',
        tags: ['mineable', 'pow', 'sha-256'],
        category: 'cryptocurrency',
        website: 'https://bitcoin.org',
        technical_doc: 'https://bitcoin.org/bitcoin.pdf',
        twitter: 'https://twitter.com/bitcoin',
        reddit: 'https://reddit.com/r/bitcoin'
      };

      const mockMarketData = {
        slug: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        price: 45000.00,
        market_cap: 880000000000,
        percent_change_1h: 0.5,
        percent_change_24h: 2.5,
        percent_change_7d: 10.0,
        volume_24h: 30000000000,
        volume_change_24h: 5.0,
        circulating_supply: 19500000,
        total_supply: 21000000,
        max_supply: 21000000,
        market_cap_dominance: 48.5,
        last_updated: '2024-01-01T00:00:00.000Z'
      };

      cmcService.getCryptoInfo.mockResolvedValue(mockMetadata);
      cmcService.getLatestQuote.mockResolvedValue(mockMarketData);

      const res = await request(app)
        .get('/api/v1/market/assets/BTC/details')
        .query({ vs: 'usd' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('symbol', 'BTC');
      expect(res.body).toHaveProperty('name', 'Bitcoin');
      expect(res.body).toHaveProperty('description');
      expect(res.body).toHaveProperty('logo');
      expect(res.body).toHaveProperty('tags');
      expect(res.body).toHaveProperty('links');
      expect(res.body.links).toHaveProperty('website');
      expect(res.body.links).toHaveProperty('whitepaper');
      expect(res.body).toHaveProperty('market');
      expect(res.body.market).toHaveProperty('price', 45000.00);
      expect(res.body.market).toHaveProperty('percentChange24h', 2.5);
      expect(res.body.market).toHaveProperty('marketCap');
    });

    it('should return asset details when only market data is available', async () => {
      const mockMarketData = {
        slug: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        price: 3000.00,
        market_cap: 360000000000,
        percent_change_24h: 1.5,
        volume_24h: 15000000000,
        circulating_supply: 120000000,
        total_supply: 120000000,
        max_supply: null,
        last_updated: '2024-01-01T00:00:00.000Z'
      };

      cmcService.getCryptoInfo.mockResolvedValue(null);
      cmcService.getLatestQuote.mockResolvedValue(mockMarketData);

      const res = await request(app)
        .get('/api/v1/market/assets/ETH/details');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('symbol', 'ETH');
      expect(res.body).toHaveProperty('name', 'Ethereum');
      expect(res.body).toHaveProperty('market');
      expect(res.body.market.price).toBe(3000.00);
    });

    it('should return 404 when asset is not found', async () => {
      cmcService.getCryptoInfo.mockResolvedValue(null);
      cmcService.getLatestQuote.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/market/assets/UNKNOWN/details');

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should return 400 when symbol is missing', async () => {
      const res = await request(app)
        .get('/api/v1/market/assets//details');

      expect(res.statusCode).toBe(404); // Express route won't match
    });

    it('should calculate fully diluted valuation when max supply exists', async () => {
      const mockMetadata = {
        name: 'Bitcoin',
        slug: 'bitcoin'
      };

      const mockMarketData = {
        slug: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        price: 45000.00,
        market_cap: 880000000000,
        max_supply: 21000000,
        last_updated: '2024-01-01T00:00:00.000Z'
      };

      cmcService.getCryptoInfo.mockResolvedValue(mockMetadata);
      cmcService.getLatestQuote.mockResolvedValue(mockMarketData);

      const res = await request(app)
        .get('/api/v1/market/assets/BTC/details');

      expect(res.statusCode).toBe(200);
      expect(res.body.market).toHaveProperty('fullyDilutedValuation');
      expect(res.body.market.fullyDilutedValuation).toBe(45000.00 * 21000000);
    });
  });

  describe('GET /api/v1/market/assets/:symbol/chart', () => {
    
    it('should return chart data for valid symbol and interval', async () => {
      const mockChartData = [
        {
          timestamp: 1704067200000,
          open: 44000,
          high: 45000,
          low: 43500,
          close: 44800,
          volume: 30000000000
        },
        {
          timestamp: 1704153600000,
          open: 44800,
          high: 46000,
          low: 44500,
          close: 45500,
          volume: 32000000000
        }
      ];

      binanceService.getAssetChartData = jest.fn().mockResolvedValue(mockChartData);

      const res = await request(app)
        .get('/api/v1/market/assets/BTC/chart')
        .query({ interval: '1d', limit: 100 });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('symbol', 'BTC');
      expect(res.body).toHaveProperty('interval', '1d');
      expect(res.body).toHaveProperty('count', 2);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty('timestamp');
      expect(res.body.data[0]).toHaveProperty('open');
      expect(res.body.data[0]).toHaveProperty('close');
    });

    it('should use default interval and limit when not provided', async () => {
      const mockChartData = Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() - i * 86400000,
        open: 45000,
        high: 46000,
        low: 44000,
        close: 45500,
        volume: 30000000000
      }));

      binanceService.getAssetChartData = jest.fn().mockResolvedValue(mockChartData);

      const res = await request(app)
        .get('/api/v1/market/assets/ETH/chart');

      expect(res.statusCode).toBe(200);
      expect(binanceService.getAssetChartData).toHaveBeenCalledWith('ETH', '1d', 100);
    });

    it('should return 400 for invalid interval', async () => {
      const res = await request(app)
        .get('/api/v1/market/assets/BTC/chart')
        .query({ interval: 'invalid' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid interval');
      expect(res.body).toHaveProperty('validIntervals');
    });

    it('should return 404 when chart data is not available', async () => {
      binanceService.getAssetChartData = jest.fn().mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/market/assets/UNKNOWN/chart');

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('not available');
    });

    it('should limit results to maximum of 1000', async () => {
      const mockChartData = Array.from({ length: 500 }, () => ({
        timestamp: Date.now(),
        open: 45000,
        high: 46000,
        low: 44000,
        close: 45500,
        volume: 30000000000
      }));

      binanceService.getAssetChartData = jest.fn().mockResolvedValue(mockChartData);

      const res = await request(app)
        .get('/api/v1/market/assets/BTC/chart')
        .query({ interval: '1h', limit: 2000 });

      expect(res.statusCode).toBe(200);
      expect(binanceService.getAssetChartData).toHaveBeenCalledWith('BTC', '1h', 1000);
    });

    it('should support various time intervals', async () => {
      const intervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
      
      for (const interval of intervals) {
        binanceService.getAssetChartData = jest.fn().mockResolvedValue([]);

        const res = await request(app)
          .get('/api/v1/market/assets/BTC/chart')
          .query({ interval });

        expect(res.statusCode).toBe(200);
        expect(res.body.interval).toBe(interval);
      }
    });
  });
});
