const request = require('supertest');
const express = require('express');
const marketRoutes = require('../routes/market');

// Mock the services
jest.mock('../services/coinmarketcap');
jest.mock('../services/binance');

const cmcService = require('../services/coinmarketcap');
const binanceService = require('../services/binance');

const app = express();
app.use(express.json());
app.use('/api/v1/market', marketRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

describe('Market Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/market/prices/:assetId', () => {
    it('should get price for a single asset', async () => {
      cmcService.getLatestQuote.mockResolvedValue({
        symbol: 'BTC',
        price: 50000,
        percent_change_24h: 2.5
      });

      const response = await request(app)
        .get('/api/v1/market/prices/BTC')
        .expect(200);

      expect(response.body.price).toBe(50000);
    });

    it('should return 404 for unknown asset', async () => {
      cmcService.getLatestQuote.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/market/prices/UNKNOWN')
        .expect(404);

      expect(response.body.message).toBeDefined();
    });

    it('should handle vs parameter', async () => {
      cmcService.getLatestQuote.mockResolvedValue({
        symbol: 'BTC',
        price: 45000
      });

      await request(app)
        .get('/api/v1/market/prices/BTC?vs=EUR')
        .expect(200);

      expect(cmcService.getLatestQuote).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/market/prices/batch', () => {
    it('should get prices for multiple assets', async () => {
      cmcService.getLatestQuotes.mockResolvedValue({
        BTC: { symbol: 'BTC', price: 50000, slug: 'bitcoin', name: 'Bitcoin' },
        ETH: { symbol: 'ETH', price: 3000, slug: 'ethereum', name: 'Ethereum' }
      });

      const response = await request(app)
        .get('/api/v1/market/prices/batch?assets=BTC,ETH')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return 400 for missing assets parameter', async () => {
      const response = await request(app)
        .get('/api/v1/market/prices/batch')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should handle empty assets list', async () => {
      cmcService.getLatestQuotes.mockResolvedValue({});

      const response = await request(app)
        .get('/api/v1/market/prices/batch?assets=BTC')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/market/assets/search', () => {
    it('should search for cryptocurrencies', async () => {
      cmcService.searchCryptos.mockResolvedValue([
        { id: 1, symbol: 'BTC', name: 'Bitcoin', slug: 'bitcoin' },
        { id: 1027, symbol: 'ETH', name: 'Ethereum', slug: 'ethereum' }
      ]);

      const response = await request(app)
        .get('/api/v1/market/assets/search?q=bit')
        .expect(200);

      expect(response.body.assets).toBeDefined();
      expect(Array.isArray(response.body.assets)).toBe(true);
    });

    it('should return 400 for missing query', async () => {
      const response = await request(app)
        .get('/api/v1/market/assets/search')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      cmcService.searchCryptos.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/market/assets/search?q=coin&limit=10')
        .expect(200);

      expect(cmcService.searchCryptos).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/market/assets/:symbol/details', () => {
    it('should get detailed asset info', async () => {
      cmcService.getCryptoInfo.mockResolvedValue({
        symbol: 'BTC',
        name: 'Bitcoin',
        description: 'Bitcoin is a cryptocurrency'
      });
      cmcService.getLatestQuote.mockResolvedValue({
        symbol: 'BTC',
        price: 50000
      });

      const response = await request(app)
        .get('/api/v1/market/assets/BTC/details')
        .expect(200);

      expect(response.body.symbol).toBe('BTC');
    });

    it('should return 404 for unknown symbol', async () => {
      cmcService.getLatestQuote.mockResolvedValue(null);
      cmcService.getCryptoInfo.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/market/assets/UNKNOWN/details')
        .expect(404);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('GET /api/v1/market/assets/:symbol/chart', () => {
    it('should get chart data for asset', async () => {
      binanceService.getAssetChartData.mockResolvedValue([
        { time: 1640000000000, open: 50000, high: 51000, low: 49000, close: 50500, volume: 1000 }
      ]);

      const response = await request(app)
        .get('/api/v1/market/assets/BTC/chart')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle interval and limit parameters', async () => {
      binanceService.getAssetChartData.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/market/assets/BTC/chart?interval=1w&limit=52')
        .expect(200);

      expect(binanceService.getAssetChartData).toHaveBeenCalled();
    });

    it('should return 404 when chart data unavailable', async () => {
      binanceService.getAssetChartData.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/market/assets/UNKNOWN/chart')
        .expect(404);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      cmcService.getLatestQuote.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/v1/market/prices/BTC')
        .expect(500);

      expect(response.body.error).toBeDefined();
      consoleErrorSpy.mockRestore();
    });

    it('should handle invalid symbol formats', async () => {
      cmcService.getLatestQuote.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/market/prices/@#$%')
        .expect(404);

      expect(response.body.message).toBeDefined();
    });
  });
});
