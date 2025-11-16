const request = require('supertest');
const express = require('express');
const newsRoutes = require('../routes/news');
const newsService = require('../services/news');

// Mock the news service
jest.mock('../services/news');

// Create an express app for testing
const app = express();
app.use(express.json());
app.use('/api/v1/news', newsRoutes);

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: err
  });
});

describe('News Controller', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ======================================
  // GET /api/v1/news
  // ======================================
  describe('GET /api/v1/news', () => {

    it('should return aggregated news articles', async () => {
      const mockArticles = [
        {
          id: 1,
          title: 'Bitcoin Reaches New High',
          link: 'https://example.com/news/1',
          pubDate: '2024-01-01T12:00:00.000Z',
          description: 'Bitcoin has reached a new all-time high.',
          source: 'CoinMarketCap',
          category: 'general'
        },
        {
          id: 2,
          title: 'Ethereum Network Upgrade',
          link: 'https://example.com/news/2',
          pubDate: '2024-01-02T12:00:00.000Z',
          description: 'Ethereum announces major network upgrade.',
          source: 'CoinDesk',
          category: 'general'
        }
      ];

      newsService.getAggregatedNews.mockResolvedValue(mockArticles);

      const res = await request(app)
        .get('/api/v1/news')
        .query({ limit: 50 });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('articles');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body.articles).toHaveLength(2);
      expect(res.body.count).toBe(2);
      expect(newsService.getAggregatedNews).toHaveBeenCalledWith({
        limit: 50,
        category: null,
        source: null
      });
    });

    it('should use default limit of 50 when not specified', async () => {
      newsService.getAggregatedNews.mockResolvedValue([]);

      const res = await request(app).get('/api/v1/news');

      expect(res.statusCode).toBe(200);
      expect(newsService.getAggregatedNews).toHaveBeenCalledWith({
        limit: 50,
        category: null,
        source: null
      });
    });

    it('should filter by category when provided', async () => {
      const mockArticles = [
        {
          id: 1,
          title: 'Bitcoin News',
          link: 'https://example.com/news/1',
          pubDate: '2024-01-01T12:00:00.000Z',
          description: 'Bitcoin news',
          source: 'Bitcoin Magazine',
          category: 'bitcoin'
        }
      ];

      newsService.getAggregatedNews.mockResolvedValue(mockArticles);

      const res = await request(app)
        .get('/api/v1/news')
        .query({ category: 'bitcoin', limit: 50 });

      expect(res.statusCode).toBe(200);
      expect(newsService.getAggregatedNews).toHaveBeenCalledWith({
        limit: 50,
        category: 'bitcoin',
        source: null
      });
    });

    it('should filter by source when provided', async () => {
      const mockArticles = [
        {
          id: 1,
          title: 'CoinDesk News',
          link: 'https://example.com/news/1',
          pubDate: '2024-01-01T12:00:00.000Z',
          description: 'CoinDesk news',
          source: 'CoinDesk',
          category: 'general'
        }
      ];

      newsService.getAggregatedNews.mockResolvedValue(mockArticles);

      const res = await request(app)
        .get('/api/v1/news')
        .query({ source: 'CoinDesk', limit: 50 });

      expect(res.statusCode).toBe(200);
      expect(newsService.getAggregatedNews).toHaveBeenCalledWith({
        limit: 50,
        category: null,
        source: 'CoinDesk'
      });
    });

    it('should cap limit at 100', async () => {
      newsService.getAggregatedNews.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/news')
        .query({ limit: 200 });

      expect(res.statusCode).toBe(200);
      expect(newsService.getAggregatedNews).toHaveBeenCalledWith({
        limit: 100,
        category: null,
        source: null
      });
    });

    it('should handle service errors', async () => {
      newsService.getAggregatedNews.mockRejectedValue(new Error('Service error'));

      const res = await request(app).get('/api/v1/news');

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message');
    });

    it('should handle empty results', async () => {
      newsService.getAggregatedNews.mockResolvedValue([]);

      const res = await request(app).get('/api/v1/news');

      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.articles).toHaveLength(0);
    });
  });

  // ======================================
  // GET /api/v1/news/asset/:symbol
  // ======================================
  describe('GET /api/v1/news/asset/:symbol', () => {

    it('should return news for a specific cryptocurrency', async () => {
      const mockArticles = [
        {
          id: 1,
          title: 'Bitcoin Price Surges',
          link: 'https://example.com/news/1',
          pubDate: '2024-01-01T12:00:00.000Z',
          description: 'Bitcoin has reached new highs',
          source: 'CoinMarketCap',
          category: 'general',
          tags: ['bitcoin', 'btc']
        }
      ];

      newsService.getNewsForAsset.mockResolvedValue(mockArticles);

      const res = await request(app)
        .get('/api/v1/news/asset/BTC')
        .query({ limit: 20 });

      expect(res.statusCode).toBe(200);
      expect(res.body.symbol).toBe('BTC');
      expect(res.body.articles).toHaveLength(1);
      expect(newsService.getNewsForAsset).toHaveBeenCalledWith('BTC', 20);
    });

    it('should use default limit of 20 when not specified', async () => {
      newsService.getNewsForAsset.mockResolvedValue([]);

      const res = await request(app).get('/api/v1/news/asset/ETH');

      expect(newsService.getNewsForAsset).toHaveBeenCalledWith('ETH', 20);
      expect(res.statusCode).toBe(200);
    });

    it('should handle uppercase and lowercase symbols', async () => {
      newsService.getNewsForAsset.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/news/asset/btc');

      expect(res.body.symbol).toBe('BTC');
      expect(newsService.getNewsForAsset).toHaveBeenCalledWith('btc', 20);
    });

    it('should cap limit at 50', async () => {
      newsService.getNewsForAsset.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/news/asset/BTC')
        .query({ limit: 100 });

      expect(newsService.getNewsForAsset).toHaveBeenCalledWith('BTC', 50);
      expect(res.statusCode).toBe(200);
    });

    it('should handle service errors', async () => {
      newsService.getNewsForAsset.mockRejectedValue(new Error('Service error'));

      const res = await request(app).get('/api/v1/news/asset/BTC');

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message');
    });

    it('should handle empty results for asset', async () => {
      newsService.getNewsForAsset.mockResolvedValue([]);

      const res = await request(app).get('/api/v1/news/asset/SOL');

      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.symbol).toBe('SOL');
    });

    it('should handle various cryptocurrency symbols', async () => {
      newsService.getNewsForAsset.mockResolvedValue([]);

      const symbols = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT'];

      for (const symbol of symbols) {
        const res = await request(app)
          .get(`/api/v1/news/asset/${symbol}`);  // FIXED

        expect(res.statusCode).toBe(200);
        expect(res.body.symbol).toBe(symbol);
      }
    });
  });

  // ======================================
  // GET /api/v1/news/sources
  // ======================================
  describe('GET /api/v1/news/sources', () => {

    it('should return list of available news sources', async () => {
      const originalKey = process.env.CMC_API_KEY;
      process.env.CMC_API_KEY = 'TEST_API_KEY';

      const res = await request(app).get('/api/v1/news/sources');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('sources');
      expect(res.body).toHaveProperty('timestamp');
      expect(Array.isArray(res.body.sources)).toBe(true);

      res.body.sources.forEach(src => {
        expect(src).toHaveProperty('name');
        expect(src).toHaveProperty('type');
        expect(src).toHaveProperty('category');
        expect(src).toHaveProperty('available');
      });

      process.env.CMC_API_KEY = originalKey;
    });

    it('should indicate CMC availability based on API key', async () => {
      const originalKey = process.env.CMC_API_KEY;
      process.env.CMC_API_KEY = 'VALID_API_KEY';

      const res1 = await request(app).get('/api/v1/news/sources');
      const cmcSource1 = res1.body.sources.find(s => s.name === 'CoinMarketCap');
      expect(cmcSource1.available).toBe(true);

      process.env.CMC_API_KEY = 'DEMO_KEY';

      const res2 = await request(app).get('/api/v1/news/sources');
      const cmcSource2 = res2.body.sources.find(s => s.name === 'CoinMarketCap');
      expect(typeof cmcSource2.available).toBe('boolean');

      process.env.CMC_API_KEY = originalKey;
    });

    it('should include all expected news sources', async () => {
      const res = await request(app).get('/api/v1/news/sources');

      const names = res.body.sources.map(s => s.name);

      expect(names).toContain('CoinMarketCap');
      expect(names).toContain('CoinDesk');
      expect(names).toContain('Cointelegraph');
      expect(names).toContain('Bitcoin Magazine');
    });

    it('should return correct source types', async () => {
      const res = await request(app).get('/api/v1/news/sources');

      const cmc = res.body.sources.find(s => s.name === 'CoinMarketCap');
      const rss = res.body.sources.filter(s => s.name !== 'CoinMarketCap');

      expect(cmc.type).toBe('API');
      rss.forEach(src => expect(src.type).toBe('RSS'));
    });

    it('should always return valid structure', async () => {
      const res = await request(app).get('/api/v1/news/sources');

      expect(res.statusCode).toBe(200);
      expect(res.body.count).toBe(res.body.sources.length);
    });
  });
});
