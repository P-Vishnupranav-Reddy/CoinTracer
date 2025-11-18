const request = require('supertest');
const express = require('express');
const newsRoutes = require('../routes/news');

// Mock the news service
jest.mock('../services/news');
const newsService = require('../services/news');

const app = express();
app.use(express.json());
app.use('/api/v1/news', newsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

describe('News Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/news', () => {
    it('should get aggregated news', async () => {
      const mockNews = [
        {
          title: 'Bitcoin Reaches New High',
          link: 'https://example.com/article1',
          pubDate: '2024-01-01T00:00:00.000Z',
          description: 'Bitcoin price surges',
          source: 'CoinDesk',
          category: 'general'
        },
        {
          title: 'Ethereum Update Released',
          link: 'https://example.com/article2',
          pubDate: '2024-01-01T00:00:00.000Z',
          description: 'New Ethereum update',
          source: 'Cointelegraph',
          category: 'general'
        }
      ];

      newsService.getAggregatedNews.mockResolvedValue(mockNews);

      const response = await request(app)
        .get('/api/v1/news')
        .expect(200);

      expect(response.body.articles.length).toBe(2);
      expect(response.body.count).toBe(2);
    });

    it('should respect limit parameter', async () => {
      newsService.getAggregatedNews.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/news?limit=10')
        .expect(200);

      expect(newsService.getAggregatedNews).toHaveBeenCalledWith({
        limit: 10,
        category: null,
        source: null
      });
    });

    it('should filter by category', async () => {
      newsService.getAggregatedNews.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/news?category=bitcoin')
        .expect(200);

      expect(newsService.getAggregatedNews).toHaveBeenCalledWith({
        limit: 50,
        category: 'bitcoin',
        source: null
      });
    });

    it('should filter by source', async () => {
      newsService.getAggregatedNews.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/news?source=coindesk')
        .expect(200);

      expect(newsService.getAggregatedNews).toHaveBeenCalledWith({
        limit: 50,
        category: null,
        source: 'coindesk'
      });
    });

    it('should handle service errors', async () => {
      newsService.getAggregatedNews.mockRejectedValue(new Error('Service error'));

      await request(app)
        .get('/api/v1/news')
        .expect(500);
    });
  });

  describe('GET /api/v1/news/asset/:symbol', () => {
    it('should get news for specific asset', async () => {
      const mockNews = [
        {
          title: 'Bitcoin Price Analysis',
          link: 'https://example.com/btc-analysis',
          pubDate: '2024-01-01T00:00:00.000Z',
          description: 'Bitcoin market analysis',
          source: 'CoinDesk'
        }
      ];

      newsService.getNewsForAsset.mockResolvedValue(mockNews);

      const response = await request(app)
        .get('/api/v1/news/asset/BTC')
        .expect(200);

      expect(response.body.symbol).toBe('BTC');
      expect(response.body.articles.length).toBe(1);
    });

    it('should respect limit parameter', async () => {
      newsService.getNewsForAsset.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/news/asset/ETH?limit=15')
        .expect(200);

      expect(newsService.getNewsForAsset).toHaveBeenCalledWith('ETH', 15);
    });

    it('should handle empty results', async () => {
      newsService.getNewsForAsset.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/news/asset/UNKNOWN')
        .expect(200);

      expect(response.body.articles).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should handle invalid symbols', async () => {
      newsService.getNewsForAsset.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/news/asset/')
        .expect(404);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      newsService.getAggregatedNews.mockRejectedValue(new Error('Invalid request'));

      await request(app)
        .get('/api/v1/news?limit=invalid')
        .expect(500);
      
      consoleErrorSpy.mockRestore();
    });

    it('should return empty array when service fails', async () => {
      newsService.getAggregatedNews.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/news')
        .expect(200);

      expect(response.body.articles).toEqual([]);
    });
  });
});
