const manualHoldingController = require('../controllers/manualHolding.controller');
const ManualHolding = require('../models/manualHolding.model');
const PortfolioService = require('../services/portfolio.service');

// Mock dependencies
jest.mock('../models/manualHolding.model');
jest.mock('../services/portfolio.service');

describe('Manual Holding Controller Tests', () => {
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
      params: {}
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

  describe('getManualHoldings', () => {
    it('should return empty array when no holdings', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      ManualHolding.getByPortfolioId.mockResolvedValue([]);

      await manualHoldingController.getManualHoldings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        holdings: []
      });
    });

    it('should reject missing portfolio id', async () => {
      mockReq.params = {};

      await manualHoldingController.getManualHoldings(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return manual holdings with live prices', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          quantity: 1.5,
          average_cost: 40000
        },
        {
          id: 'holding-2',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'ETH',
          quantity: 10,
          average_cost: 3000
        }
      ];

      const mockPrices = {
        BTC: 50000,
        ETH: 3500
      };

      ManualHolding.getByPortfolioId = jest.fn().mockResolvedValue(mockHoldings);
      PortfolioService.fetchLivePrices = jest.fn().mockResolvedValue(mockPrices);

      await manualHoldingController.getManualHoldings(mockReq, mockRes);

      expect(ManualHolding.getByPortfolioId).toHaveBeenCalledWith('portfolio-123');
      expect(PortfolioService.fetchLivePrices).toHaveBeenCalledWith(['BTC', 'ETH'], 'usd');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        holdings: expect.arrayContaining([
          expect.objectContaining({
            asset_symbol: 'BTC',
            current_price: 50000
          }),
          expect.objectContaining({
            asset_symbol: 'ETH',
            current_price: 3500
          })
        ])
      });
    });

    it('should return 400 when portfolio ID is missing', async () => {
      mockReq.params = {};

      await manualHoldingController.getManualHoldings(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Portfolio ID is required'
      });
    });

    it('should return empty array when no holdings exist', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      ManualHolding.getByPortfolioId = jest.fn().mockResolvedValue([]);

      await manualHoldingController.getManualHoldings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        holdings: []
      });
      expect(PortfolioService.fetchLivePrices).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };

      ManualHolding.getByPortfolioId = jest.fn().mockRejectedValue(
        new Error('Database error')
      );

      await manualHoldingController.getManualHoldings(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database error'
      });
    });
  });

  describe('upsertManualHolding', () => {
    it('should successfully create a new manual holding', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.body = {
        assetSymbol: 'BTC',
        quantity: 1.5,
        averageCost: 40000,
        notes: 'Initial purchase'
      };

      const mockHolding = {
        id: 'holding-1',
        portfolio_id: 'portfolio-123',
        asset_symbol: 'BTC',
        quantity: 1.5,
        average_cost: 40000,
        notes: 'Initial purchase'
      };

      ManualHolding.upsert = jest.fn().mockResolvedValue(mockHolding);

      await manualHoldingController.upsertManualHolding(mockReq, mockRes);

      expect(ManualHolding.upsert).toHaveBeenCalledWith(
        'portfolio-123',
        'BTC',
        1.5,
        40000,
        'Initial purchase'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        holding: mockHolding
      });
    });

    it('should return 400 when required fields are missing', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.body = {
        assetSymbol: 'BTC'
        // Missing quantity
      };

      await manualHoldingController.upsertManualHolding(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Portfolio ID, asset symbol, and quantity are required'
      });
    });

    it('should return 400 when quantity is negative', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.body = {
        assetSymbol: 'BTC',
        quantity: -1.5
      };

      await manualHoldingController.upsertManualHolding(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Quantity must be non-negative'
      });
    });

    it('should allow quantity of zero', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.body = {
        assetSymbol: 'BTC',
        quantity: 0
      };

      const mockHolding = {
        id: 'holding-1',
        portfolio_id: 'portfolio-123',
        asset_symbol: 'BTC',
        quantity: 0
      };

      ManualHolding.upsert = jest.fn().mockResolvedValue(mockHolding);

      await manualHoldingController.upsertManualHolding(mockReq, mockRes);

      expect(ManualHolding.upsert).toHaveBeenCalledWith(
        'portfolio-123',
        'BTC',
        0,
        undefined,
        undefined
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        holding: mockHolding
      });
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = { portfolioId: 'portfolio-123' };
      mockReq.body = {
        assetSymbol: 'BTC',
        quantity: 1.5
      };

      ManualHolding.upsert = jest.fn().mockRejectedValue(
        new Error('Database error')
      );

      await manualHoldingController.upsertManualHolding(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database error'
      });
    });
  });

  describe('deleteManualHolding', () => {
    it('should successfully delete a manual holding', async () => {
      mockReq.params = {
        portfolioId: 'portfolio-123',
        assetSymbol: 'BTC'
      };

      ManualHolding.delete = jest.fn().mockResolvedValue(true);

      await manualHoldingController.deleteManualHolding(mockReq, mockRes);

      expect(ManualHolding.delete).toHaveBeenCalledWith('portfolio-123', 'BTC');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Manual holding deleted successfully'
      });
    });

    it('should return 404 when holding not found', async () => {
      mockReq.params = {
        portfolioId: 'portfolio-123',
        assetSymbol: 'BTC'
      };

      ManualHolding.delete = jest.fn().mockResolvedValue(false);

      await manualHoldingController.deleteManualHolding(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Manual holding not found'
      });
    });

    it('should return 400 when parameters are missing', async () => {
      mockReq.params = {
        portfolioId: 'portfolio-123'
        // Missing assetSymbol
      };

      await manualHoldingController.deleteManualHolding(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Portfolio ID and asset symbol are required'
      });
    });

    it('should handle errors gracefully', async () => {
      mockReq.params = {
        portfolioId: 'portfolio-123',
        assetSymbol: 'BTC'
      };

      ManualHolding.delete = jest.fn().mockRejectedValue(
        new Error('Database error')
      );

      await manualHoldingController.deleteManualHolding(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Database error'
      });
    });
  });
});
