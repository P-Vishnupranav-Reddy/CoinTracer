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

  describe('addTransaction', () => {
    it('should add a new transaction', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.body = {
        type: 'buy',
        symbol: 'BTC',
        quantity: '1',
        price: '50000',
        date: '2025-01-01'
      };

      const mockTransaction = {
        id: 'txn-123',
        portfolio_id: 'portfolio-123',
        type: 'buy',
        symbol: 'BTC',
        quantity: 1,
        price: 50000
      };

      Transaction.create = jest.fn().mockResolvedValue(mockTransaction);
      Holding.recalculateFromTransactions = jest.fn().mockResolvedValue();

      await PortfolioController.addTransaction(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        transaction: mockTransaction,
        message: 'Transaction added successfully'
      });
    });

    it('should return 400 when required fields missing', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.body = { type: 'buy' }; // Missing symbol, quantity, price, date

      await PortfolioController.addTransaction(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getTransactions', () => {
    it('should retrieve transactions with pagination', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.query = { limit: '10', offset: '0' };

      const mockTransactions = [
        { id: 'txn-1', type: 'buy', asset_id: 'BTC', qty: '1' },
        { id: 'txn-2', type: 'sell', asset_id: 'ETH', qty: '10' }
      ];

      Transaction.findByPortfolioId = jest.fn().mockResolvedValue(mockTransactions);

      await PortfolioController.getTransactions(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        transactions: mockTransactions,
        count: 2
      });
    });
  });

  describe('getAllocation', () => {
    it('should return portfolio allocation', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      const mockHoldings = [
        { asset_symbol: 'BTC', total_quantity: '1', current_price: 50000, average_cost: 45000 },
        { asset_symbol: 'ETH', total_quantity: '20', current_price: 2500, average_cost: 2000 }
      ];

      Holding.findByPortfolioId = jest.fn().mockResolvedValue(mockHoldings);
      PortfolioService.fetchLivePrices = jest.fn().mockResolvedValue({ BTC: 50000, ETH: 2500 });

      await PortfolioController.getAllocation(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        allocation: expect.any(Array),
        totalValue: expect.any(String),
        pricesLive: true
      });
    });
  });

  describe('getPortfolioWithPnL', () => {
    it('should return portfolio with P&L calculations', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      const mockPortfolio = { id: 'portfolio-123', name: 'Test Portfolio' };
      const mockHoldings = [
        { asset_symbol: 'BTC', total_quantity: '1', total_invested: '50000' }
      ];
      const mockResult = {
        holdings: [
          { asset_symbol: 'BTC', unrealized_pnl: '5000.00', pnl_percentage: '10.00' }
        ],
        summary: {
          totalCurrentValue: '55000.00',
          totalInvested: '50000.00',
          totalUnrealizedPnL: '5000.00',
          totalPnLPercentage: '10.00'
        }
      };

      Portfolio.findById = jest.fn().mockResolvedValue(mockPortfolio);
      Holding.findByPortfolioId = jest.fn().mockResolvedValue(mockHoldings);
      PortfolioService.fetchLivePrices = jest.fn().mockResolvedValue({ BTC: 55000 });
      PortfolioService.calculatePortfolioWithPnL = jest.fn().mockResolvedValue(mockResult);

      await PortfolioController.getPortfolioWithPnL(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        portfolio: mockPortfolio,
        holdings: mockResult.holdings,
        summary: expect.objectContaining({
          totalCurrentValue: '55000.00',
          pricesLive: true
        })
      });
    });

    it('should return 404 when portfolio not found', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      Portfolio.findById = jest.fn().mockResolvedValue(null);

      await PortfolioController.getPortfolioWithPnL(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateTransaction', () => {
    it('should update transaction successfully', async () => {
      mockReq.params = { portfolioId: 1, transactionId: 100 };
      mockReq.body = {
        quantity: '2',
        price: '55000',
        date: '2024-01-01'
      };

      const mockTransaction = {
        id: 100,
        portfolio_id: 1,
        quantity: 2,
        price: 55000
      };

      Transaction.update.mockResolvedValue(mockTransaction);
      Holding.recalculateFromTransactions.mockResolvedValue(null);

      await PortfolioController.updateTransaction(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        transaction: mockTransaction,
        message: 'Transaction updated successfully'
      });
    });

    it('should handle database errors', async () => {
      mockReq.params = { portfolioId: 1, transactionId: 999 };
      mockReq.body = {
        quantity: '2',
        price: '55000',
        date: '2024-01-01'
      };

      Transaction.update.mockRejectedValue(new Error('Transaction not found'));

      await PortfolioController.updateTransaction(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to update transaction',
        details: 'Transaction not found'
      });
    });
  });

  describe('deleteTransaction', () => {
    it('should delete transaction successfully', async () => {
      mockReq.params = { transactionId: 'txn-123' };

      const mockTransaction = {
        id: 'txn-123',
        portfolio_id: 'portfolio-123'
      };

      Transaction.findById = jest.fn().mockResolvedValue(mockTransaction);
      Portfolio.findById = jest.fn().mockResolvedValue({ id: 'portfolio-123', user_id: 'user-123' });
      Transaction.delete = jest.fn().mockResolvedValue();
      Holding.recalculateFromTransactions = jest.fn().mockResolvedValue();

      await PortfolioController.deleteTransaction(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        message: expect.any(String)
      });
    });
  });

  describe('updatePortfolio', () => {
    it('should update portfolio details', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.body = {
        name: 'Updated Portfolio',
        description: 'Updated description'
      };

      const mockPortfolio = {
        id: 'portfolio-123',
        user_id: 'user-123',
        name: 'Updated Portfolio',
        description: 'Updated description'
      };

      Portfolio.findById = jest.fn().mockResolvedValue({ id: 'portfolio-123', user_id: 'user-123' });
      Portfolio.update = jest.fn().mockResolvedValue(mockPortfolio);

      await PortfolioController.updatePortfolio(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        portfolio: mockPortfolio,
        message: expect.any(String)
      });
    });
  });

  describe('exportCSV', () => {
    it('should export transactions as CSV', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      const mockTransactions = [
        { type: 'buy', asset_id: 'BTC', qty: '1', price: '50000', date: '2025-01-01' }
      ];

      Portfolio.findById = jest.fn().mockResolvedValue({ id: 'portfolio-123', user_id: 'user-123', name: 'Test Portfolio' });
      Transaction.findByPortfolioId = jest.fn().mockResolvedValue(mockTransactions);

      mockRes.setHeader = jest.fn();
      mockRes.send = jest.fn();

      await PortfolioController.exportCSV(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.send).toHaveBeenCalled();
    });
  });

  describe('getTransactionsByType', () => {
    it('should filter transactions by type', async () => {
      mockReq.params = { portfolioId: 1 };
      mockReq.query = { type: 'buy' };

      const mockTransactions = [
        { id: 1, type: 'buy', asset_id: 'BTC' }
      ];

      Transaction.findByType.mockResolvedValue(mockTransactions);

      await PortfolioController.getTransactionsByType(mockReq, mockRes);

      expect(Transaction.findByType).toHaveBeenCalledWith(1, ['buy']);
      expect(mockRes.json).toHaveBeenCalledWith({
        portfolioId: 1,
        types: ['buy'],
        count: 1,
        transactions: mockTransactions
      });
    });
  });

  describe('updatePortfolio', () => {
    it('should successfully update portfolio', async () => {
      mockReq.params = { portfolioId: 'port-123' };
      mockReq.body = { name: 'Updated Portfolio', description: 'New description' };

      const mockPortfolio = { id: 'port-123', name: 'Updated Portfolio', description: 'New description' };
      Portfolio.update = jest.fn().mockResolvedValue(mockPortfolio);

      await PortfolioController.updatePortfolio(mockReq, mockRes);

      expect(Portfolio.update).toHaveBeenCalledWith('port-123', 'Updated Portfolio', 'New description');
      expect(mockRes.json).toHaveBeenCalledWith({
        portfolio: mockPortfolio,
        message: 'Portfolio updated successfully'
      });
    });

    it('should return 400 when name is missing', async () => {
      mockReq.params = { portfolioId: 'port-123' };
      mockReq.body = { description: 'Desc only' };

      await PortfolioController.updatePortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Portfolio name is required and must be a string.'
      });
    });

    it('should return 400 when name is empty string', async () => {
      mockReq.params = { portfolioId: 'port-123' };
      mockReq.body = { name: '   ' };

      await PortfolioController.updatePortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Portfolio name is required and must be a string.'
      });
    });

    it('should handle update errors gracefully', async () => {
      mockReq.params = { portfolioId: 'port-123' };
      mockReq.body = { name: 'Updated Name' };

      Portfolio.update = jest.fn().mockRejectedValue(new Error('Update failed'));

      await PortfolioController.updatePortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to update portfolio',
        details: 'Update failed'
      });
    });
  });

  describe('getConversionHistory', () => {
    it('should return conversion transactions', async () => {
      mockReq.params = { portfolioId: 'port-123' };

      const mockConversions = [
        { id: 1, type: 'convert', asset_id: 'BTC', symbol: 'BTC/ETH', quantity: 0.1 }
      ];

      Transaction.findByType = jest.fn().mockResolvedValue(mockConversions);

      await PortfolioController.getConversionHistory(mockReq, mockRes);

      expect(Transaction.findByType).toHaveBeenCalledWith('port-123', ['convert']);
      expect(mockRes.json).toHaveBeenCalledWith({
        portfolioId: 'port-123',
        count: 1,
        conversions: mockConversions
      });
    });

    it('should handle conversion history errors', async () => {
      mockReq.params = { portfolioId: 'port-123' };

      Transaction.findByType = jest.fn().mockRejectedValue(new Error('DB error'));

      await PortfolioController.getConversionHistory(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch conversion history',
        details: 'DB error'
      });
    });
  });

  describe('getSpotTradingHistory', () => {
    it('should return buy and sell transactions', async () => {
      mockReq.params = { portfolioId: 'port-123' };

      const mockTrades = [
        { id: 1, type: 'buy', asset_id: 'BTC', quantity: 0.5 },
        { id: 2, type: 'sell', asset_id: 'ETH', quantity: 5 }
      ];

      Transaction.findByType = jest.fn().mockResolvedValue(mockTrades);

      await PortfolioController.getSpotTradingHistory(mockReq, mockRes);

      expect(Transaction.findByType).toHaveBeenCalledWith('port-123', ['buy', 'sell']);
      expect(mockRes.json).toHaveBeenCalledWith({
        portfolioId: 'port-123',
        count: 2,
        spotTrades: mockTrades
      });
    });

    it('should handle spot trading history errors', async () => {
      mockReq.params = { portfolioId: 'port-123' };

      Transaction.findByType = jest.fn().mockRejectedValue(new Error('Query failed'));

      await PortfolioController.getSpotTradingHistory(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch spot trades',
        details: 'Query failed'
      });
    });
  });

  describe('getPortfolio - live price handling', () => {
    it('should update holding prices when live prices differ from stored', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      const mockPortfolio = { id: 'portfolio-123', name: 'Test Portfolio', user_id: 'user-123' };
      const mockHoldings = [
        { 
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC', 
          symbol: 'BTC',
          total_quantity: '1', 
          current_price: 45000, // Stored price
          average_cost: 40000,
          total_invested: 40000
        }
      ];

      Portfolio.findById = jest.fn().mockResolvedValue(mockPortfolio);
      Holding.findByPortfolioId = jest.fn().mockResolvedValue(mockHoldings);
      PortfolioService.fetchLivePrices = jest.fn().mockResolvedValue({ 
        BTC: 50000 // Live price differs - just the number, not an object
      });
      Holding.upsert = jest.fn().mockResolvedValue(true);
      Holding.recalculateFromTransactions = jest.fn().mockResolvedValue(true);

      await PortfolioController.getPortfolio(mockReq, mockRes);

      expect(Holding.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPrice: 50000,
          assetId: 'BTC'
        })
      );
    });

    it('should handle getPortfolio errors gracefully', async () => {
      mockReq.params = { portfolioId: 'port-123' };

      Portfolio.findById = jest.fn().mockRejectedValue(new Error('Database connection lost'));

      await PortfolioController.getPortfolio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch portfolio',
        details: 'Database connection lost'
      });
    });
  });

  describe('getAllocation - edge cases', () => {
    it('should handle allocation errors gracefully', async () => {
      mockReq.params = { portfolioId: 'port-123' };

      Holding.findByPortfolioId = jest.fn().mockRejectedValue(new Error('Query timeout'));

      await PortfolioController.getAllocation(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch allocation',
        details: 'Query timeout'
      });
    });
  });

  describe('exportCSV', () => {
    it('should handle export errors', async () => {
      mockReq.params = { portfolioId: 'port-123' };

      Transaction.findByPortfolioId = jest.fn().mockRejectedValue(new Error('Too many rows'));

      await PortfolioController.exportCSV(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to export CSV',
        details: 'Too many rows'
      });
    });
  });

  describe('getTransactions - error handling', () => {
    it('should handle transaction fetch errors', async () => {
      mockReq.params = { portfolioId: 'port-123' };
      mockReq.query = { limit: 50, offset: 0 }; // Add query params

      Transaction.findByPortfolioId = jest.fn().mockRejectedValue(new Error('Fetch failed'));

      await PortfolioController.getTransactions(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch transactions',
        details: 'Fetch failed'
      });
    });
  });

  describe('updateTransaction - error handling', () => {
    it('should handle update transaction errors', async () => {
      mockReq.params = { portfolioId: 'port-123', transactionId: 'txn-1' };
      mockReq.body = { quantity: 1.5, price: 50000 };

      Transaction.update = jest.fn().mockRejectedValue(new Error('Constraint violation'));

      await PortfolioController.updateTransaction(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to update transaction',
        details: 'Constraint violation'
      });
    });
  });

  describe('deleteTransaction - error handling', () => {
    it('should handle delete transaction errors', async () => {
      mockReq.params = { portfolioId: 'port-123', transactionId: 'txn-1' };

      Transaction.delete = jest.fn().mockRejectedValue(new Error('Foreign key violation'));

      await PortfolioController.deleteTransaction(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to delete transaction',
        details: 'Foreign key violation'
      });
    });
  });

  describe('addTransaction - error handling', () => {
    it('should handle add transaction errors', async () => {
      mockReq.params = { portfolioId: 'port-123' };
      mockReq.body = { 
        type: 'buy', 
        assetId: 'BTC', 
        symbol: 'BTC',
        quantity: 1, 
        price: 50000,
        date: '2025-01-01' // Add required date field
      };

      Transaction.create = jest.fn().mockRejectedValue(new Error('Insert failed'));

      await PortfolioController.addTransaction(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to add transaction',
        details: 'Insert failed'
      });
    });
  });

  describe('getTransactionsByType - error handling', () => {
    it('should handle transaction type fetch errors', async () => {
      mockReq.params = { portfolioId: 'port-123' };
      mockReq.query = { type: 'buy' };

      Transaction.findByType = jest.fn().mockRejectedValue(new Error('Type not valid'));

      await PortfolioController.getTransactionsByType(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch transactions',
        details: 'Type not valid'
      });
    });
  });

  describe('syncPortfolio', () => {
    it('should sync portfolio from exchange connection', async () => {
      mockReq.params = { portfolioId: 'portfolio-123', connectionId: 'conn-123' };

      Portfolio.findById = jest.fn().mockResolvedValue({ id: 'portfolio-123', user_id: 'user-123' });

      await PortfolioController.syncPortfolio(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
    });
  });
});
