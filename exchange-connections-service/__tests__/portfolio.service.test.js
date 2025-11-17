const PortfolioService = require('../services/portfolio.service');
const Holding = require('../models/holding.model');
const Transaction = require('../models/transaction.model');
const axios = require('axios');

// Mock dependencies
jest.mock('../models/holding.model');
jest.mock('../models/transaction.model');
jest.mock('axios');

describe('Portfolio Service Tests', () => {
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('recalculateHoldings', () => {
    it('should call database recalculation function', async () => {
      const portfolioId = 'portfolio-123';

      Holding.recalculateFromTransactions = jest.fn().mockResolvedValue(true);

      await PortfolioService.recalculateHoldings(portfolioId);

      expect(Holding.recalculateFromTransactions).toHaveBeenCalledWith(portfolioId);
    });

    it('should handle errors during recalculation', async () => {
      const portfolioId = 'portfolio-123';

      Holding.recalculateFromTransactions = jest.fn().mockRejectedValue(
        new Error('Database error')
      );

      await expect(PortfolioService.recalculateHoldings(portfolioId))
        .rejects.toThrow('Database error');
    });
  });

  describe('fetchLivePrices', () => {
    it('should fetch live prices for multiple assets', async () => {
      const assets = ['BTC', 'ETH', 'BNB'];
      const currency = 'usd';

      const mockResponse = {
        data: {
          data: [
            { symbol: 'BTC', assetId: 'bitcoin', price: 50000 },
            { symbol: 'ETH', assetId: 'ethereum', price: 3500 },
            { symbol: 'BNB', assetId: 'binancecoin', price: 500 }
          ]
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const prices = await PortfolioService.fetchLivePrices(assets, currency);

      expect(prices).toEqual({
        BTC: { price: 50000, change24h: 0 },
        ETH: { price: 3500, change24h: 0 },
        BNB: { price: 500, change24h: 0 }
      });
    });

    it('should handle missing price data', async () => {
      const assets = ['BTC', 'UNKNOWN'];
      const currency = 'usd';

      const mockResponse = {
        data: {
          data: [
            { symbol: 'BTC', assetId: 'bitcoin', price: 50000 }
            // UNKNOWN asset not returned
          ]
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const prices = await PortfolioService.fetchLivePrices(assets, currency);

      expect(prices).toHaveProperty('BTC');
      expect(prices.BTC).toEqual({ price: 50000, change24h: 0 });
      expect(prices).not.toHaveProperty('UNKNOWN');
    });

    it('should return empty object when no assets provided', async () => {
      const prices = await PortfolioService.fetchLivePrices([], 'usd');

      expect(prices).toEqual({});
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const assets = ['BTC', 'ETH'];

      axios.get.mockRejectedValue(new Error('API Error'));

      const prices = await PortfolioService.fetchLivePrices(assets, 'usd');

      expect(prices).toEqual({});
    });

    it('should use default currency when not specified', async () => {
      const assets = ['BTC'];

      const mockResponse = {
        data: {
          data: [
            { symbol: 'BTC', assetId: 'bitcoin', price: 50000 }
          ]
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      await PortfolioService.fetchLivePrices(assets);

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('market/prices/batch'),
        expect.objectContaining({
          params: expect.objectContaining({
            vs: 'usd'
          })
        })
      );
    });

    it('should map asset symbols correctly', async () => {
      const assets = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'];

      const mockResponse = {
        data: {
          data: [
            { symbol: 'BTC', assetId: 'bitcoin', price: 50000 },
            { symbol: 'ETH', assetId: 'ethereum', price: 3500 },
            { symbol: 'USDT', assetId: 'tether', price: 1 },
            { symbol: 'BNB', assetId: 'binancecoin', price: 500 },
            { symbol: 'SOL', assetId: 'solana', price: 100 }
          ]
        }
      };

      axios.get.mockResolvedValue(mockResponse);

      const prices = await PortfolioService.fetchLivePrices(assets, 'usd');

      expect(prices).toEqual({
        BTC: { price: 50000, change24h: 0 },
        ETH: { price: 3500, change24h: 0 },
        USDT: { price: 1, change24h: 0 },
        BNB: { price: 500, change24h: 0 },
        SOL: { price: 100, change24h: 0 }
      });
    });
  });

  describe('calculatePortfolioWithPnL', () => {
    it('should calculate portfolio value with P&L', async () => {
      Holding.findByPortfolioId.mockResolvedValue([
        {
          asset_symbol: 'BTC',
          total_quantity: '1.5',
          total_invested: '60000',
          average_cost: '40000',
          current_price: '50000'
        },
        {
          asset_symbol: 'ETH',
          total_quantity: '10',
          total_invested: '20000',
          average_cost: '2000',
          current_price: '3000'
        }
      ]);

      const currentPrices = {
        BTC: { price: 55000, change24h: 5 },
        ETH: { price: 3200, change24h: 3 }
      };

      const result = await PortfolioService.calculatePortfolioWithPnL('port-1', currentPrices);

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(parseFloat(result.summary.totalCurrentValue)).toBeGreaterThan(0);
      expect(result.summary.totalUnrealizedPnL).toBeDefined();
      expect(result.holdings).toHaveLength(2);
    });

    it('should handle empty portfolio', async () => {
      Holding.findByPortfolioId.mockResolvedValue([]);

      const result = await PortfolioService.calculatePortfolioWithPnL('port-1');

      expect(result.summary.totalCurrentValue).toBe('0.00');
      expect(result.holdings).toEqual([]);
    });

    it('should use fallback prices', async () => {
      Holding.findByPortfolioId.mockResolvedValue([
        {
          asset_symbol: 'BTC',
          total_quantity: '1',
          total_invested: '40000',
          average_cost: '40000',
          current_price: '50000'
        }
      ]);

      const result = await PortfolioService.calculatePortfolioWithPnL('port-1', {});

      expect(result.summary.totalCurrentValue).toBe('50000.00');
    });
  });

  describe('calculatePortfolioMetrics', () => {
    it('should calculate comprehensive portfolio metrics', async () => {
      Holding.findByPortfolioId.mockResolvedValue([
        {
          asset_symbol: 'BTC',
          total_quantity: '2',
          total_invested: '80000',
          average_cost: '40000'
        }
      ]);

      const currentPrices = { BTC: { price: 50000, change24h: 10 } };

      const result = await PortfolioService.calculatePortfolioMetrics('port-1', currentPrices);

      expect(result).toBeDefined();
      expect(result.totalValue).toBe('100000.00');
      expect(result.totalInvested).toBe('80000.00');
      expect(result.totalPnL).toBe('20000.00');
      expect(parseFloat(result.totalPnLPercentage)).toBeCloseTo(25, 1);
    });

    it('should handle zero invested amount', async () => {
      Holding.findByPortfolioId.mockResolvedValue([
        {
          asset_symbol: 'BTC',
          total_quantity: '1',
          total_invested: '0',
          average_cost: '0'
        }
      ]);

      const result = await PortfolioService.calculatePortfolioMetrics('port-1', { BTC: { price: 50000 } });

      expect(result.totalPnLPercentage).toBe('0.00');
    });
  });

  describe('calculateAllocation', () => {
    it('should calculate asset allocation percentages', async () => {
      Holding.findByPortfolioId.mockResolvedValue([
        {
          asset_symbol: 'BTC',
          total_quantity: '1',
          average_cost: '50000'
        },
        {
          asset_symbol: 'ETH',
          total_quantity: '10',
          average_cost: '3000'
        }
      ]);

      const currentPrices = {
        BTC: { price: 50000 },
        ETH: { price: 3000 }
      };

      const result = await PortfolioService.calculateAllocation('port-1', currentPrices);

      expect(result).toHaveProperty('allocation');
      expect(result.allocation).toBeInstanceOf(Array);
      expect(result.allocation.length).toBe(2);
      expect(result.allocation[0]).toHaveProperty('percentage');
      expect(parseFloat(result.allocation[0].percentage) + parseFloat(result.allocation[1].percentage)).toBeCloseTo(100, 1);
    });

    it('should return empty array for empty portfolio', async () => {
      Holding.findByPortfolioId.mockResolvedValue([]);

      const result = await PortfolioService.calculateAllocation('port-1');

      expect(result).toEqual({ allocation: [], totalValue: '0.00' });
    });

    it('should sort by value descending', async () => {
      Holding.findByPortfolioId.mockResolvedValue([
        { asset_id: 'ETH', symbol: 'ETH', asset_symbol: 'ETH', total_quantity: '10', average_cost: '2000', current_price: 2000 },
        { asset_id: 'BTC', symbol: 'BTC', asset_symbol: 'BTC', total_quantity: '1', average_cost: '60000', current_price: 60000 }
      ]);

      const result = await PortfolioService.calculateAllocation('port-1', {
        BTC: { price: 60000 },
        ETH: { price: 2000 }
      });

      expect(result.allocation[0].symbol).toBe('BTC');
    });
  });

  describe('getTransactionBreakdown', () => {
    it('should calculate transaction type breakdown', async () => {
      Transaction.findByPortfolioId.mockResolvedValue([
        { type: 'buy', qty: '1', price: '40000' },
        { type: 'sell', qty: '0.5', price: '50000' },
        { type: 'deposit', qty: '1', price: '0' },
        { type: 'withdraw', qty: '0.5', price: '0' }
      ]);

      const result = await PortfolioService.getTransactionBreakdown('port-1');

      expect(result).toBeDefined();
      expect(result.total).toBe(4);
      expect(result.buy).toBe(1);
      expect(result.sell).toBe(1);
      expect(result.deposit).toBe(1);
      expect(result.withdraw).toBe(1);
    });

    it('should handle empty transaction history', async () => {
      Transaction.findByPortfolioId.mockResolvedValue([]);

      const result = await PortfolioService.getTransactionBreakdown('port-1');

      expect(result.total).toBe(0);
      expect(result.buy).toBe(0);
      expect(result.sell).toBe(0);
    });
  });

  describe('fetchLivePrices - error handling', () => {
    it('should return empty object when API throws error', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const result = await PortfolioService.fetchLivePrices(['BTC', 'ETH'], 'usd');

      expect(result).toEqual({});
      expect(consoleErrorSpy).not.toHaveBeenCalled(); // Graceful fallback without error
    });

    it('should handle empty asset list gracefully', async () => {
      const result = await PortfolioService.fetchLivePrices([], 'usd');

      expect(result).toEqual({});
      expect(axios.get).not.toHaveBeenCalled();
    });
  });

  describe('getHoldingDetails', () => {
    it('should calculate holding details with realized and unrealized PnL', async () => {
      const mockHolding = {
        asset_id: 'BTC',
        symbol: 'BTC',
        total_quantity: 2,
        average_cost: 40000,
        total_invested: 80000
      };

      const mockTransactions = [
        { asset_id: 'BTC', type: 'buy', quantity: 2, total_value: 80000 },
        { asset_id: 'BTC', type: 'sell', quantity: 0.5, total_value: 25000 },
        { asset_id: 'ETH', type: 'buy', quantity: 10, total_value: 20000 }
      ];

      Holding.findByPortfolioAndAsset = jest.fn().mockResolvedValue(mockHolding);
      Transaction.findByPortfolioId = jest.fn().mockResolvedValue(mockTransactions);

      const result = await PortfolioService.getHoldingDetails('port-1', 'BTC', 50000);

      expect(result.assetId).toBe('BTC');
      expect(result.currentPrice).toBe(50000);
      expect(parseFloat(result.currentValue)).toBe(100000); // 2 * 50000
      expect(parseFloat(result.unrealizedPnL)).toBe(20000); // 100000 - 80000
      expect(parseFloat(result.realizedPnL)).toBe(5000); // 25000 - (0.5 * 40000)
      expect(parseFloat(result.totalPnL)).toBe(25000); // 20000 + 5000
    });

    it('should throw error when holding not found', async () => {
      Holding.findByPortfolioAndAsset = jest.fn().mockResolvedValue(null);

      await expect(
        PortfolioService.getHoldingDetails('port-1', 'BTC')
      ).rejects.toThrow('Holding not found');
    });

    it('should use average cost when current price not provided', async () => {
      const mockHolding = {
        asset_id: 'BTC',
        symbol: 'BTC',
        total_quantity: 1,
        average_cost: 45000,
        total_invested: 45000
      };

      Holding.findByPortfolioAndAsset = jest.fn().mockResolvedValue(mockHolding);
      Transaction.findByPortfolioId = jest.fn().mockResolvedValue([]);

      const result = await PortfolioService.getHoldingDetails('port-1', 'BTC');

      expect(result.currentPrice).toBe(45000);
      expect(parseFloat(result.unrealizedPnL)).toBe(0); // Same as cost
    });
  });

  describe('syncPortfolioFromExchange', () => {
    const ExchangeConnection = require('../models/exchangeConnection.model');
    const BinanceService = require('../services/binance.service');
    const BitgetService = require('../services/bitget.service');

    beforeEach(() => {
      jest.mock('../models/exchangeConnection.model');
      jest.mock('../services/binance.service');
      jest.mock('../services/bitget.service');
    });

    it('should throw error when connection not found', async () => {
      jest.spyOn(ExchangeConnection, 'findById').mockResolvedValue(null);

      await expect(
        PortfolioService.syncPortfolioFromExchange('conn-123')
      ).rejects.toThrow('Exchange connection not found');
    });

    it('should throw error for unsupported exchange', async () => {
      jest.spyOn(ExchangeConnection, 'findById').mockResolvedValue({
        id: 'conn-123',
        exchange: 'unsupported-exchange',
        portfolio_id: 'port-1'
      });

      await expect(
        PortfolioService.syncPortfolioFromExchange('conn-123')
      ).rejects.toThrow('Unsupported exchange');
    });

    it('should sync portfolio from Binance', async () => {
      const mockConnection = {
        id: 'conn-123',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        portfolio_id: 'port-1'
      };

      const mockPortfolio = [
        { asset: 'BTC', symbol: 'BTC', total: 1.5, depositAddress: '0x123' },
        { asset: 'ETH', symbol: 'ETH', total: 10, network: 'ERC20' }
      ];

      jest.spyOn(ExchangeConnection, 'findById').mockResolvedValue(mockConnection);
      BinanceService.prototype.fetchPortfolio = jest.fn().mockResolvedValue(mockPortfolio);
      Holding.findByPortfolioAndAsset = jest.fn().mockResolvedValue({
        average_cost: 40000,
        total_invested: 60000
      });
      Holding.upsert = jest.fn().mockResolvedValue(true);

      const result = await PortfolioService.syncPortfolioFromExchange('conn-123');

      expect(result.syncedAssets).toBe(2);
      expect(result.portfolio).toEqual(mockPortfolio);
      expect(Holding.upsert).toHaveBeenCalledTimes(2);
    });

    it('should sync portfolio from Bitget with passphrase', async () => {
      const mockConnection = {
        id: 'conn-123',
        exchange: 'bitget',
        apiKey: 'key',
        apiSecret: 'secret',
        passphrase: 'pass123',
        portfolio_id: 'port-1'
      };

      const mockPortfolio = [
        { asset: 'BTC', symbol: 'BTC', total: 2.0 }
      ];

      jest.spyOn(ExchangeConnection, 'findById').mockResolvedValue(mockConnection);
      BitgetService.prototype.fetchPortfolio = jest.fn().mockResolvedValue(mockPortfolio);
      Holding.findByPortfolioAndAsset = jest.fn().mockResolvedValue(null);
      Holding.upsert = jest.fn().mockResolvedValue(true);

      const result = await PortfolioService.syncPortfolioFromExchange('conn-123');

      expect(result.syncedAssets).toBe(1);
      expect(Holding.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          portfolioId: 'port-1',
          assetId: 'BTC',
          totalQuantity: 2.0
        })
      );
    });

    it('should skip assets with zero balance', async () => {
      const mockConnection = {
        id: 'conn-123',
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        portfolio_id: 'port-1'
      };

      const mockPortfolio = [
        { asset: 'BTC', symbol: 'BTC', total: 1.5 },
        { asset: 'ETH', symbol: 'ETH', total: 0 }, // Zero balance
        { asset: 'SOL', symbol: 'SOL', total: -0.001 } // Negative (dust)
      ];

      jest.spyOn(ExchangeConnection, 'findById').mockResolvedValue(mockConnection);
      BinanceService.prototype.fetchPortfolio = jest.fn().mockResolvedValue(mockPortfolio);
      Holding.findByPortfolioAndAsset = jest.fn().mockResolvedValue(null);
      Holding.upsert = jest.fn().mockResolvedValue(true);

      await PortfolioService.syncPortfolioFromExchange('conn-123');

      expect(Holding.upsert).toHaveBeenCalledTimes(1); // Only BTC
    });
  });
});

