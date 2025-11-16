const PortfolioController = require('../controllers/portfolio.controller');
const Portfolio = require('../models/portfolio.model');
const Transaction = require('../models/transaction.model');
const Holding = require('../models/holding.model');
const User = require('../models/user.model');
const PortfolioService = require('../services/portfolio.service');

// Mock dependencies
jest.mock('../models/portfolio.model');
jest.mock('../models/transaction.model');
jest.mock('../models/holding.model');
jest.mock('../models/user.model');
jest.mock('../services/portfolio.service');

describe('Portfolio Controller Tests', () => {
  let mockReq;
  let mockRes;
  let consoleErrorSpy;
  let consoleLogSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockReq = {
      body: {},
      params: {},
      user: { id: 'user-123', email: 'test@example.com', name: 'Test User' }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('createPortfolio', () => {
    it('should successfully create a new portfolio', async () => {
      mockReq.body = {
        name: 'My Crypto Portfolio',
        description: 'Test portfolio'
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com'
      };

      const mockPortfolio = {
        id: 'portfolio-123',
        user_id: 'user-123',
        name: 'My Crypto Portfolio',
        description: 'Test portfolio'
      };

      User.findById = jest.fn().mockResolvedValue(mockUser);
      Portfolio.create = jest.fn().mockResolvedValue(mockPortfolio);

      await PortfolioController.createPortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        portfolio: mockPortfolio,
        message: 'Portfolio created successfully'
      });
      expect(Portfolio.create).toHaveBeenCalledWith('user-123', 'My Crypto Portfolio', 'Test portfolio');
    });

    it('should return 400 when portfolio name is missing', async () => {
      mockReq.body = {
        description: 'Test portfolio'
      };

      await PortfolioController.createPortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Portfolio name is required and must be a string.'
      });
    });

    it('should return 400 when portfolio name is empty', async () => {
      mockReq.body = {
        name: '   ',
        description: 'Test portfolio'
      };

      await PortfolioController.createPortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Portfolio name is required and must be a string.'
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockReq.user = null;

      await PortfolioController.createPortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not authenticated'
      });
    });

    it('should create user if not exists', async () => {
      mockReq.body = {
        name: 'My Crypto Portfolio'
      };

      const mockNewUser = {
        id: 'user-123',
        email: 'test@example.com'
      };

      const mockPortfolio = {
        id: 'portfolio-123',
        user_id: 'user-123',
        name: 'My Crypto Portfolio'
      };

      User.findById = jest.fn().mockResolvedValue(null);
      User.findOrCreate = jest.fn().mockResolvedValue(mockNewUser);
      Portfolio.create = jest.fn().mockResolvedValue(mockPortfolio);

      await PortfolioController.createPortfolio(mockReq, mockRes);

      expect(User.findOrCreate).toHaveBeenCalledWith('test@example.com', 'Test User');
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should handle errors gracefully', async () => {
      mockReq.body = {
        name: 'My Portfolio'
      };

      User.findById = jest.fn().mockResolvedValue({ id: 'user-123' });
      Portfolio.create = jest.fn().mockRejectedValue(new Error('Database error'));

      await PortfolioController.createPortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to create portfolio',
        details: 'Database error'
      });
    });
  });

  describe('getPortfolios', () => {
    it('should return all user portfolios', async () => {
      const mockPortfolios = [
        {
          id: 'portfolio-1',
          user_id: 'user-123',
          name: 'Portfolio 1'
        },
        {
          id: 'portfolio-2',
          user_id: 'user-123',
          name: 'Portfolio 2'
        }
      ];

      Portfolio.findByUserId = jest.fn().mockResolvedValue(mockPortfolios);

      await PortfolioController.getPortfolios(mockReq, mockRes);

      expect(Portfolio.findByUserId).toHaveBeenCalledWith('user-123');
      expect(mockRes.json).toHaveBeenCalledWith({
        portfolios: mockPortfolios,
        message: 'Retrieved all portfolios'
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockReq.user = null;

      await PortfolioController.getPortfolios(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not authenticated'
      });
    });

    it('should handle errors gracefully', async () => {
      Portfolio.findByUserId = jest.fn().mockRejectedValue(new Error('Database error'));

      await PortfolioController.getPortfolios(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch portfolios',
        details: 'Database error'
      });
    });
  });

  describe('getPortfolio', () => {
    it('should return portfolio with holdings and summary', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      const mockPortfolio = {
        id: 'portfolio-123',
        name: 'My Portfolio'
      };

      const mockHoldings = [
        {
          asset_symbol: 'BTC',
          total_quantity: 1.5,
          current_price: 50000
        }
      ];

      Portfolio.findById = jest.fn().mockResolvedValue(mockPortfolio);
      Holding.findByPortfolioId = jest.fn().mockResolvedValue(mockHoldings);
      PortfolioService.fetchLivePrices = jest.fn().mockResolvedValue({
        BTC: 50000
      });

      await PortfolioController.getPortfolio(mockReq, mockRes);

      expect(Portfolio.findById).toHaveBeenCalledWith('portfolio-123');
      expect(Holding.findByPortfolioId).toHaveBeenCalledWith('portfolio-123');
    });

    it('should handle portfolio not found', async () => {
      mockReq.params = { portfolioId: 'non-existent' };

      Portfolio.findById = jest.fn().mockResolvedValue(null);

      await PortfolioController.getPortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deletePortfolio', () => {
    it('should successfully delete a portfolio', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      const mockPortfolio = {
        id: 'portfolio-123',
        user_id: 'user-123',
        name: 'My Portfolio'
      };

      Portfolio.findById = jest.fn().mockResolvedValue(mockPortfolio);
      Portfolio.delete = jest.fn().mockResolvedValue(true);

      await PortfolioController.deletePortfolio(mockReq, mockRes);

      expect(Portfolio.delete).toHaveBeenCalledWith('portfolio-123');
    });

    it('should return 404 when portfolio not found', async () => {
      mockReq.params = { portfolioId: 'non-existent' };

      Portfolio.findById = jest.fn().mockResolvedValue(null);

      await PortfolioController.deletePortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(Portfolio.delete).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      const mockPortfolio = {
        id: 'portfolio-123',
        user_id: 'user-123'
      };

      Portfolio.findById = jest.fn().mockResolvedValue(mockPortfolio);
      Portfolio.delete = jest.fn().mockRejectedValue(new Error('Delete failed'));

      await PortfolioController.deletePortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
