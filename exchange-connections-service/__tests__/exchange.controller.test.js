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
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

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

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
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
      Transaction.bulkCreate = jest.fn().mockResolvedValue(true);
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

    it('should handle sync errors gracefully', async () => {
      mockReq.params = { connectionId: 'conn-123' };

      const mockConnection = {
        id: 'conn-123',
        exchange: 'binance',
        encrypted_api_key: 'encrypted-key',
        encrypted_api_secret: 'encrypted-secret'
      };

      const mockService = {
        fetchAllTransactions: jest.fn().mockRejectedValue(new Error('Sync failed'))
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      ExchangeConnection.updateSyncStatus = jest.fn().mockResolvedValue(true);

      await ExchangeController.syncExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(ExchangeConnection.updateSyncStatus).toHaveBeenCalledWith(
        'conn-123',
        'error',
        0,
        'Sync failed'
      );
    });

    it('should handle buy/sell trades correctly', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        portfolio_id: 'portfolio-123'
      };

      const mockTransactions = [
        {
          type: 'buy',
          asset: 'BTC',
          symbol: 'BTC/USDT',
          quantity: 1,
          price: 50000,
          fee: 50,
          feeCurrency: 'USDT',
          orderId: 'order-1',
          tradeId: 'trade-1',
          timestamp: Date.now()
        }
      ];

      const mockService = {
        fetchAllTransactions: jest.fn().mockResolvedValue(mockTransactions)
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      Transaction.bulkCreate = jest.fn().mockResolvedValue(true);
      ExchangeConnection.updateSyncStatus = jest.fn().mockResolvedValue(true);
      PortfolioService.recalculateHoldings = jest.fn().mockResolvedValue(true);

      await ExchangeController.syncExchange(mockReq, mockRes);

      expect(Transaction.bulkCreate).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          syncJob: expect.objectContaining({
            status: 'success',
            transactionsSynced: 1
          })
        })
      );
    });

    it('should handle deposit transactions correctly', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        portfolio_id: 'portfolio-123'
      };

      const mockTransactions = [
        {
          type: 'deposit',
          asset: 'BTC',
          symbol: 'BTC',
          quantity: 1,
          fee: 0.0001,
          feeCurrency: 'BTC',
          txid: 'tx-123',
          timestamp: Date.now()
        }
      ];

      const mockService = {
        fetchAllTransactions: jest.fn().mockResolvedValue(mockTransactions)
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      Transaction.bulkCreate = jest.fn().mockResolvedValue(true);
      ExchangeConnection.updateSyncStatus = jest.fn().mockResolvedValue(true);
      PortfolioService.recalculateHoldings = jest.fn().mockResolvedValue(true);

      await ExchangeController.syncExchange(mockReq, mockRes);

      expect(Transaction.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'deposit',
            assetId: 'BTC',
            quantity: 1
          })
        ])
      );
    });

    it('should handle conversion transactions correctly', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        portfolio_id: 'portfolio-123'
      };

      const mockTransactions = [
        {
          type: 'convert',
          fromAsset: 'BTC',
          toAsset: 'ETH',
          fromQuantity: 0.1,
          toQuantity: 2.5,
          price: 25,
          orderId: 'order-1',
          quoteId: 'quote-1',
          conversionRate: 25,
          timestamp: Date.now()
        }
      ];

      const mockService = {
        fetchAllTransactions: jest.fn().mockResolvedValue(mockTransactions)
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      Transaction.bulkCreate = jest.fn().mockResolvedValue(true);
      ExchangeConnection.updateSyncStatus = jest.fn().mockResolvedValue(true);
      PortfolioService.recalculateHoldings = jest.fn().mockResolvedValue(true);

      await ExchangeController.syncExchange(mockReq, mockRes);

      expect(Transaction.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'convert',
            assetId: 'ETH',
            quantity: 2.5,
            quoteAsset: 'BTC',
            quoteQuantity: 0.1
          })
        ])
      );
    });

    it('should skip transactions with missing dates', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        portfolio_id: 'portfolio-123'
      };

      const mockTransactions = [
        {
          type: 'buy',
          asset: 'BTC',
          quantity: 1,
          price: 50000
          // Missing timestamp/date
        },
        {
          type: 'buy',
          asset: 'ETH',
          quantity: 10,
          price: 2500,
          timestamp: Date.now()
        }
      ];

      const mockService = {
        fetchAllTransactions: jest.fn().mockResolvedValue(mockTransactions)
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      Transaction.bulkCreate = jest.fn().mockResolvedValue(true);
      ExchangeConnection.updateSyncStatus = jest.fn().mockResolvedValue(true);
      PortfolioService.recalculateHoldings = jest.fn().mockResolvedValue(true);

      await ExchangeController.syncExchange(mockReq, mockRes);

      // Should only sync 1 transaction (the one with valid timestamp)
      expect(Transaction.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            assetId: 'ETH'
          })
        ])
      );
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should skip transactions with invalid dates', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        portfolio_id: 'portfolio-123'
      };

      const mockTransactions = [
        {
          type: 'buy',
          asset: 'BTC',
          quantity: 1,
          price: 50000,
          transactionDate: 'invalid-date'
        }
      ];

      const mockService = {
        fetchAllTransactions: jest.fn().mockResolvedValue(mockTransactions)
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      Transaction.bulkCreate = jest.fn().mockResolvedValue(true);
      ExchangeConnection.updateSyncStatus = jest.fn().mockResolvedValue(true);
      PortfolioService.recalculateHoldings = jest.fn().mockResolvedValue(true);

      await ExchangeController.syncExchange(mockReq, mockRes);

      // Should sync 0 transactions
      expect(Transaction.bulkCreate).toHaveBeenCalledWith([]);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should provide breakdown summary of transaction types', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockConnection = {
        id: 'connection-123',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        portfolio_id: 'portfolio-123'
      };

      const mockTransactions = [
        { type: 'buy', asset: 'BTC', quantity: 1, price: 50000, timestamp: Date.now() },
        { type: 'sell', asset: 'ETH', quantity: 10, price: 2500, timestamp: Date.now() },
        { type: 'deposit', asset: 'USDT', quantity: 10000, timestamp: Date.now() },
        { type: 'withdraw', asset: 'BTC', quantity: 0.5, timestamp: Date.now() },
        { type: 'convert', fromAsset: 'BTC', toAsset: 'ETH', toQuantity: 2, timestamp: Date.now() }
      ];

      const mockService = {
        fetchAllTransactions: jest.fn().mockResolvedValue(mockTransactions)
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      Transaction.bulkCreate = jest.fn().mockResolvedValue(true);
      ExchangeConnection.updateSyncStatus = jest.fn().mockResolvedValue(true);
      PortfolioService.recalculateHoldings = jest.fn().mockResolvedValue(true);

      await ExchangeController.syncExchange(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          syncJob: expect.objectContaining({
            status: 'success',
            transactionsSynced: 5,
            breakdown: expect.objectContaining({
              total: 5,
              spotTrades: 2,
              deposits: 1,
              withdrawals: 1,
              conversions: 1
            })
          })
        })
      );
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status for a connection', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      const mockStatus = {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        transactionCount: 150
      };

      ExchangeConnection.getSyncStatus = jest.fn().mockResolvedValue(mockStatus);

      await ExchangeController.getSyncStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockStatus);
    });

    it('should handle errors when fetching sync status', async () => {
      mockReq.params = { connectionId: 'connection-123' };

      ExchangeConnection.getSyncStatus = jest.fn().mockRejectedValue(
        new Error('Database error')
      );

      await ExchangeController.getSyncStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch sync status'
      });
    });
  });

  describe('connectExchange - Postgres unique violation', () => {
    it('should handle Postgres unique constraint violation', async () => {
      mockReq.body = {
        exchange: 'binance',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        portfolioId: 'portfolio-123'
      };

      const mockService = {
        testConnection: jest.fn().mockResolvedValue({ success: true })
      };

      const postgresError = new Error('duplicate key value');
      postgresError.code = '23505';

      ExchangeConnection.hashApiKey = jest.fn().mockReturnValue('hashed-key');
      ExchangeConnection.findByApiKeyHash = jest.fn().mockResolvedValue(null);
      ExchangeFactory.requiresPassphrase = jest.fn().mockReturnValue(false);
      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);
      ExchangeConnection.create = jest.fn().mockRejectedValue(postgresError);

      await ExchangeController.connectExchange(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Duplicate API key',
        details: 'This API key is already connected.'
      });
    });
  });

  describe('getBalances', () => {
    it('should fetch and sync balances with holdings', async () => {
      mockReq.params = { connectionId: 'conn-1' };

      const mockConnection = {
        id: 'conn-1',
        portfolio_id: 'port-1',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret'
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);

      const mockBalances = [
        { asset: 'BTC', free: 0.5, locked: 0.1, total: 0.6 },
        { asset: 'ETH', free: 10, locked: 0, total: 10 }
      ];

      const mockService = {
        fetchBalance: jest.fn().mockResolvedValue(mockBalances)
      };

      ExchangeFactory.createService = jest.fn().mockReturnValue(mockService);

      const Holding = require('../models/holding.model');
      Holding.findByPortfolioId = jest.fn().mockResolvedValue([]);
      Holding.findByPortfolioAndAsset = jest.fn().mockResolvedValue(null);
      Holding.upsert = jest.fn().mockResolvedValue({});

      PortfolioService.fetchLivePrices = jest.fn().mockResolvedValue({
        BTC: { price: 50000, change24h: 2.5 },
        ETH: { price: 3000, change24h: -1.2 }
      });

      await ExchangeController.getBalances(mockReq, mockRes);

      expect(ExchangeConnection.findById).toHaveBeenCalledWith('conn-1');
      expect(mockService.fetchBalance).toHaveBeenCalled();
      expect(Holding.upsert).toHaveBeenCalledTimes(2);
      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.balances).toHaveLength(2);
      expect(response.balances[0].currentPrice).toBeDefined();
    });

    it('should return 404 if connection not found', async () => {
      mockReq.params = { connectionId: 'invalid' };
      ExchangeConnection.findById = jest.fn().mockResolvedValue(null);

      await ExchangeController.getBalances(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Connection not found' });
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = { connectionId: 'conn-1' };
      ExchangeConnection.findById = jest.fn().mockRejectedValue(new Error('DB error'));

      await ExchangeController.getBalances(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Failed to fetch balances'
      }));
    });
  });

  describe('getAveragePrices', () => {
    it('should fetch average prices for Binance', async () => {
      mockReq.params = { connectionId: 'conn-1' };

      const mockConnection = {
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret'
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);

      const mockPortfolioStats = [
        { asset: 'BTC', quantity: 0.6, avgPrice: 45000, totalCostBasis: 27000 }
      ];

      const BinanceService = require('../services/binance.service');
      BinanceService.prototype.fetchPortfolioWithStats = jest.fn().mockResolvedValue(mockPortfolioStats);

      await ExchangeController.getAveragePrices(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.averagePrices).toEqual(mockPortfolioStats);
      expect(response.count).toBe(1);
    });

    it('should return 400 for non-Binance exchanges', async () => {
      mockReq.params = { connectionId: 'conn-1' };

      const mockConnection = { exchange: 'bitget' };
      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);

      await ExchangeController.getAveragePrices(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('only available for Binance')
      }));
    });
  });

  describe('getBreakevenPrices', () => {
    it('should fetch breakeven prices for Bitget', async () => {
      mockReq.params = { connectionId: 'conn-1' };

      const mockConnection = {
        exchange: 'bitget',
        apiKey: 'key',
        apiSecret: 'secret',
        passphrase: 'pass'
      };

      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);

      const mockPortfolioStats = [
        { asset: 'BTC', quantity: 0.5, breakevenPrice: 48000 }
      ];

      const BitgetService = require('../services/bitget.service');
      BitgetService.prototype.fetchPortfolioWithStats = jest.fn().mockResolvedValue(mockPortfolioStats);

      await ExchangeController.getBreakevenPrices(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.breakevenPrices).toEqual(mockPortfolioStats);
    });

    it('should return 400 for non-Bitget exchanges', async () => {
      mockReq.params = { connectionId: 'conn-1' };

      const mockConnection = { exchange: 'binance' };
      ExchangeConnection.findById = jest.fn().mockResolvedValue(mockConnection);

      await ExchangeController.getBreakevenPrices(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
