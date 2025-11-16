const PortfolioService = require('../services/portfolio.service');
const Holding = require('../models/holding.model');
const axios = require('axios');

// Mock dependencies
jest.mock('../models/holding.model');
jest.mock('axios');

describe('Portfolio Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        BTC: 50000,
        ETH: 3500,
        BNB: 500
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

      expect(prices).toHaveProperty('BTC', 50000);
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
        BTC: 50000,
        ETH: 3500,
        USDT: 1,
        BNB: 500,
        SOL: 100
      });
    });
  });

  // Note: calculateSummary and updateHoldingPrices are not implemented in the actual service
  // Tests removed as they tested non-existent functionality
});
