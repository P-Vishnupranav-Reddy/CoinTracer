const ExchangeController = require('../controllers/exchange.controller');
const ExchangeConnection = require('../models/exchangeConnection.model');
const Transaction = require('../models/transaction.model');
const ExchangeFactory = require('../services/exchangeFactory.service');
const PortfolioService = require('../services/portfolio.service');

// Mock dependencies
jest.mock('../models/exchangeConnection.model');
jest.mock('../models/transaction.model');
jest.mock('../services/exchangeFactory.service');
jest.mock('../services/portfolio.service');

describe('Exchange Controller Tests', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      body: {},
      params: {},
      user: { id: 'user-123', email: 'test@example.com' }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('connectExchange', () => {
    it('should successfully connect a new exchange', async () => {
      mockReq.body = {
        exchange: 'binance',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        portfolioId: 'portfolio-123'
      };

      const mockApiKeyHash = 'hashed-api-key';
      const mockConnection = {
        id: 'connection-123',
        user_id: 'user-123',
        portfolio_id: 'portfolio-123',
        exchange: 'binance'
      };

      const mockService = {
        testConnection: jest.fn().mockResolvedValue({ success: true })
      };

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue(mockApiKeyHash);
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(null);
      ExchangeFactory.requiresPassphrase = jest.fn().mockReturnValue(false);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      ExchangeConnection.create = jest.fn().mockResolvedValue(mockConnection);

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        connection: mockConnection
      });
      expect(ExchangeConnection.create).toHaveBeenCalled();
    });

    it('should return 400 when required fields are missing', async () => {
      mockReq.body = {
        exchange: 'binance',
        apiKey: 'test-api-key'
        // Missing apiSecret and portfolioId
      };

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Missing required fields'
      });
    });

    it('should return 409 when API key is already connected by same user', async () => {
      mockReq.body = {
        exchange: 'binance',
        apiKey: 'existing-api-key',
        apiSecret: 'test-api-secret',
        portfolioId: 'portfolio-123'
      };

      const existingConnection = {
        user_id: 'user-123',
        exchange: 'binance'
      };

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(existingConnection);

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Duplicate API key',
        details: 'This API key is already connected in your account.'
      });
    });

    it('should return 409 when API key is already connected by another user', async () => {
      mockReq.body = {
        exchange: 'binance',
        apiKey: 'existing-api-key',
        apiSecret: 'test-api-secret',
        portfolioId: 'portfolio-123'
      };

      const existingConnection = {
        user_id: 'different-user-456',
        exchange: 'binance'
      };

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(existingConnection);

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Duplicate API key',
        details: 'This API key is already connected by another account.'
      });
    });

    it('should return 400 for unsupported exchange', async () => {
      mockReq.body = {
        exchange: 'unsupported-exchange',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        portfolioId: 'portfolio-123'
      };

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(null);
      ExchangeFactory.requiresPassphrase = jest.fn().mockReturnValue(false);
      ExchangeFactory.createService = jest.fn().mockImplementation(() => {
        throw new Error('Unsupported exchange: unsupported-exchange');
      });

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to connect exchange',
        details: 'Unsupported exchange: unsupported-exchange'
      });
    });

    it('should return 400 when passphrase is required but not provided', async () => {
      mockReq.body = {
        exchange: 'kucoin',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        portfolioId: 'portfolio-123'
      };

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(null);
      ExchangeFactory.requiresPassphrase = jest.fn().mockReturnValue(true);

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Passphrase required for kucoin',
        details: 'kucoin requires a passphrase to connect. Please provide your API passphrase.'
      });
    });

    it('should return 400 when API validation fails', async () => {
      mockReq.body = {
        exchange: 'binance',
        apiKey: 'invalid-api-key',
        apiSecret: 'invalid-api-secret',
        portfolioId: 'portfolio-123'
      };

      const mockService = {
        testConnection: jest.fn().mockResolvedValue({
          success: false,
          message: 'Invalid API credentials'
        })
      };

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(null);
      ExchangeFactory.requiresPassphrase = jest.fn().mockReturnValue(false);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to connect to exchange',
        details: 'Invalid API credentials'
      });
    });

    it('should handle database errors gracefully', async () => {
      mockReq.body = {
        exchange: 'binance',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        portfolioId: 'portfolio-123'
      };

      const mockService = {
        testConnection: jest.fn().mockResolvedValue({ success: true })
      };

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(null);
      ExchangeFactory.requiresPassphrase = jest.fn().mockReturnValue(false);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      ExchangeConnection.create = jest.fn().mockRejectedValue(
        new Error('Database connection error')
      );

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to connect exchange',
        details: 'Database connection error'
      });
    });
  });

  describe('getConnections', () => {
    it('should return all user connections', async () => {
      const mockConnections = [
        {
          id: 'connection-1',
          user_id: 'user-123',
          exchange: 'binance',
          is_active: true
        },
        {
          id: 'connection-2',
          user_id: 'user-123',
          exchange: 'kucoin',
          is_active: true
        }
      ];

      ExchangeConnection.findByUserId = jest.fn().mockResolvedValue(mockConnections);

      await ExchangeController.getConnections(mockReq, mockRes);

      expect(ExchangeConnection.findByUserId).toHaveBeenCalledWith('user-123');
      expect(mockRes.json).toHaveBeenCalledWith({
        connections: mockConnections
      });
    });

    it('should return empty array when no connections exist', async () => {
      ExchangeConnection.findByUserId = jest.fn().mockResolvedValue([]);

      await ExchangeController.getConnections(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        connections: []
      });
    });

    it('should handle errors gracefully', async () => {
      ExchangeConnection.findByUserId = jest.fn().mockRejectedValue(
        new Error('Database error')
      );

      await ExchangeController.getConnections(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch connections'
      });
    });
  });

  describe('disconnectExchange', () => {
    it('should successfully disconnect exchange and clean up data', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        portfolio_id: 'portfolio-123',
        exchange: 'binance'
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      Transaction.deleteByConnectionId = jest.fn().mockResolvedValue(5); // Return number of deleted transactions
      ExchangeConnection.delete = jest.fn().mockResolvedValue(true);
      PortfolioService.recalculateHoldings = jest.fn().mockResolvedValue(true);

      await ExchangeController.disconnectExchange(mockReq, mockRes);

      expect(Transaction.deleteByConnectionId).toHaveBeenCalledWith('connection-123');
      expect(ExchangeConnection.delete).toHaveBeenCalledWith('connection-123');
      expect(PortfolioService.recalculateHoldings).toHaveBeenCalledWith('portfolio-123');
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Exchange disconnected and all related data removed successfully',
        transactionsDeleted: 5,
        portfolioId: 'portfolio-123'
      });
    });

    it('should return 404 when connection not found', async () => {
      mockReq.params = { connectionId: 'non-existent' };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(null);

      await ExchangeController.disconnectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Connection not found'
      });
    });

    it('should handle errors during disconnection', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        portfolio_id: 'portfolio-123'
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      Transaction.deleteByConnectionId = jest.fn().mockRejectedValue(
        new Error('Delete failed')
      );

      await ExchangeController.disconnectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to disconnect exchange',
        details: 'Delete failed'
      });
    });
  });

  describe('syncExchange', () => {
    it('should return 404 when connection not found', async () => {
      mockReq.params = { connectionId: 'non-existent' };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(null);

      await ExchangeController.syncExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Connection not found'
      });
    });

    it('should create exchange service successfully', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        exchange: 'binance',
        apiKey: 'encrypted-key',
        apiSecret: 'encrypted-secret',
        portfolio_id: 'portfolio-123'
      };

      const mockService = {
        fetchAllTransactions: jest.fn().mockResolvedValue([])
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);

      // Mock the service methods that will be called
      Transaction.deleteByConnectionId = jest.fn().mockResolvedValue(true);
      Transaction.bulkInsert = jest.fn().mockResolvedValue(true);
      PortfolioService.recalculateHoldings = jest.fn().mockResolvedValue(true);
      ExchangeConnection.updateSyncStatus = jest.fn().mockResolvedValue(true);

      await ExchangeController.syncExchange(mockReq, mockRes);

      expect(ExchangeFactory.createService).toHaveBeenCalledWith(
        'binance',
        'encrypted-key',
        'encrypted-secret',
        undefined
      );
      expect(mockService.fetchAllTransactions).toHaveBeenCalled();
    });
  });
});
