// Mock both auth middleware paths before requiring routes
jest.mock('../../shared/authMiddleware', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 'test-user-123', email: 'test@example.com', name: 'Test User' };
    next();
  }
}));

jest.mock('../middleware/auth.middleware', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 'test-user-123', email: 'test@example.com', name: 'Test User' };
    next();
  }
}));

const request = require('supertest');
const express = require('express');
const exchangeRoutes = require('../routes/exchange.routes');
const portfolioRoutes = require('../routes/portfolio.routes');
const manualHoldingRoutes = require('../routes/manualHolding.routes');
const ExchangeConnection = require('../models/exchangeConnection.model');
const Portfolio = require('../models/portfolio.model');
const ExchangeFactory = require('../services/exchangeFactory.service');

// Mock dependencies
jest.mock('../models/exchangeConnection.model');
jest.mock('../models/portfolio.model');
jest.mock('../models/transaction.model');
jest.mock('../models/holding.model');
jest.mock('../models/user.model');
jest.mock('../models/manualHolding.model');
jest.mock('../services/exchangeFactory.service');
jest.mock('../services/portfolio.service');

// Create express app for integration testing
const app = express();
app.use(express.json());

// Mount routes (auth middleware is already mocked)
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/manual-holdings', manualHoldingRoutes);

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

describe('Exchange Connections Service - Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/exchanges/connections', () => {
    it('should connect a new exchange successfully', async () => {
      const mockConnection = {
        id: 'connection-123',
        user_id: 'test-user-123',
        exchange: 'binance',
        is_active: true
      };

      const mockService = {
        testConnection: jest.fn().mockResolvedValue({ success: true })
      };

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(null);
      ExchangeFactory.requiresPassphrase = jest.fn().mockReturnValue(false);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      ExchangeConnection.create = jest.fn().mockResolvedValue(mockConnection);

      const res = await request(app)
        .post('/api/exchanges/connections')
        .send({
          exchange: 'binance',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
          portfolioId: 'portfolio-123'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('connection');
      expect(res.body.connection.exchange).toBe('binance');
    });

    it('should reject duplicate API key', async () => {
      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue({
        user_id: 'test-user-123',
        exchange: 'binance'
      });

      const res = await request(app)
        .post('/api/exchanges/connections')
        .send({
          exchange: 'binance',
          apiKey: 'duplicate-key',
          apiSecret: 'test-api-secret',
          portfolioId: 'portfolio-123'
        });

      expect(res.statusCode).toBe(409);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Duplicate API key');
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/exchanges/connections')
        .send({
          exchange: 'binance',
          apiKey: 'test-key'
          // Missing apiSecret and portfolioId
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Missing required fields');
    });
  });

  describe('GET /api/exchanges/connections', () => {
    it('should return all user connections', async () => {
      const mockConnections = [
        {
          id: 'connection-1',
          exchange: 'binance',
          is_active: true
        },
        {
          id: 'connection-2',
          exchange: 'kucoin',
          is_active: true
        }
      ];

      ExchangeConnection.findByUserId = jest.fn().mockResolvedValue(mockConnections);

      const res = await request(app).get('/api/exchanges/connections');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('connections');
      expect(res.body.connections).toHaveLength(2);
    });

    it('should return empty array when no connections', async () => {
      ExchangeConnection.findByUserId = jest.fn().mockResolvedValue([]);

      const res = await request(app).get('/api/exchanges/connections');

      expect(res.statusCode).toBe(200);
      expect(res.body.connections).toHaveLength(0);
    });
  });

  describe('POST /api/portfolios', () => {
    it('should create a new portfolio', async () => {
      const mockUser = {
        id: 'test-user-123',
        email: 'test@example.com'
      };

      const mockPortfolio = {
        id: 'portfolio-123',
        user_id: 'test-user-123',
        name: 'My Portfolio',
        description: 'Test portfolio'
      };

      const User = require('../models/user.model');
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Portfolio.create = jest.fn().mockResolvedValue(mockPortfolio);

      const res = await request(app)
        .post('/api/portfolios')
        .send({
          name: 'My Portfolio',
          description: 'Test portfolio'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('portfolio');
      expect(res.body.portfolio.name).toBe('My Portfolio');
    });

    it('should reject portfolio without name', async () => {
      const res = await request(app)
        .post('/api/portfolios')
        .send({
          description: 'Test portfolio'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('name is required');
    });
  });

  describe('GET /api/portfolios', () => {
    it('should return all user portfolios', async () => {
      const mockPortfolios = [
        {
          id: 'portfolio-1',
          name: 'Portfolio 1',
          user_id: 'test-user-123'
        },
        {
          id: 'portfolio-2',
          name: 'Portfolio 2',
          user_id: 'test-user-123'
        }
      ];

      Portfolio.findByUserId = jest.fn().mockResolvedValue(mockPortfolios);

      const res = await request(app).get('/api/portfolios');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('portfolios');
      expect(res.body.portfolios).toHaveLength(2);
    });
  });

  describe('Manual Holdings Integration', () => {
    const ManualHolding = require('../models/manualHolding.model');
    const PortfolioService = require('../services/portfolio.service');

    it('should get manual holdings with prices', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          asset_symbol: 'BTC',
          quantity: 1.5,
          average_cost: 40000
        }
      ];

      const mockPrices = {
        BTC: 50000
      };

      ManualHolding.getByPortfolioId = jest.fn().mockResolvedValue(mockHoldings);
      PortfolioService.fetchLivePrices = jest.fn().mockResolvedValue(mockPrices);

      const res = await request(app).get('/api/manual-holdings/portfolio-123');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('holdings');
      expect(res.body.success).toBe(true);
    });

    it('should create manual holding', async () => {
      const mockHolding = {
        id: 'holding-1',
        portfolio_id: 'portfolio-123',
        asset_symbol: 'BTC',
        quantity: 1.5,
        average_cost: 40000
      };

      ManualHolding.upsert = jest.fn().mockResolvedValue(mockHolding);

      const res = await request(app)
        .post('/api/manual-holdings/portfolio-123')
        .send({
          assetSymbol: 'BTC',
          quantity: 1.5,
          averageCost: 40000,
          notes: 'Initial purchase'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('holding');
      expect(res.body.success).toBe(true);
    });

    it('should validate manual holding quantity', async () => {
      const res = await request(app)
        .post('/api/manual-holdings/portfolio-123')
        .send({
          assetSymbol: 'BTC',
          quantity: -1.5
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('non-negative');
    });

    it('should delete manual holding', async () => {
      ManualHolding.delete = jest.fn().mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/manual-holdings/portfolio-123/BTC');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      Portfolio.findByUserId = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      const res = await request(app).get('/api/portfolios');

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle invalid JSON payload', async () => {
      const res = await request(app)
        .post('/api/portfolios')
        .set('Content-Type', 'application/json')
        .send('invalid-json{');

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Authentication', () => {
    it('should have auth middleware mocked', () => {
      // Auth middleware is mocked at the top of the file
      // In actual implementation, auth is handled by authMiddleware from middleware/auth.middleware.js
      const { authMiddleware } = require('../middleware/auth.middleware');
      expect(authMiddleware).toBeDefined();
    });
  });
});
