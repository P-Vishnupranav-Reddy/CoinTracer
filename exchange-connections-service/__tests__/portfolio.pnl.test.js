const PortfolioService = require('../services/portfolio.service');
const Holding = require('../models/holding.model');

// Mock the models
jest.mock('../models/holding.model');

describe('Portfolio P&L Calculations', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculatePortfolioWithPnL', () => {
    
    it('should calculate P&L correctly with current prices', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1.5,
          average_cost: 40000,
          total_invested: 60000,
          current_price: null
        },
        {
          id: 'holding-2',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'ETH',
          total_quantity: 10,
          average_cost: 2500,
          total_invested: 25000,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 45000,
        ETH: 3000
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result).toBeDefined();
      expect(result.totalInvested).toBe('85000.00');
      expect(result.totalCurrentValue).toBe('97500.00'); // (1.5 * 45000) + (10 * 3000)
      expect(result.totalUnrealizedPnL).toBe('12500.00'); // 97500 - 85000
      expect(result.totalPnLPercentage).toBe('14.71'); // (12500 / 85000) * 100
      expect(result.pnlColor).toBe('success');
      expect(result.holdings).toHaveLength(2);
    });

    it('should handle negative P&L correctly', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1,
          average_cost: 50000,
          total_invested: 50000,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 40000
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result.totalUnrealizedPnL).toBe('-10000.00');
      expect(result.totalPnLPercentage).toBe('-20.00');
      expect(result.pnlColor).toBe('error');
    });

    it('should use average_cost when current price is not available', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'SOL',
          total_quantity: 100,
          average_cost: 100,
          total_invested: 10000,
          current_price: null
        }
      ];

      const currentPrices = {}; // No price available

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result.totalCurrentValue).toBe('10000.00'); // Uses average_cost
      expect(result.totalUnrealizedPnL).toBe('0.00');
      expect(result.totalPnLPercentage).toBe('0.00');
    });

    it('should filter out zero-quantity holdings', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1,
          average_cost: 45000,
          total_invested: 45000,
          current_price: null
        },
        {
          id: 'holding-2',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'ETH',
          total_quantity: 0,
          average_cost: 3000,
          total_invested: 0,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 45000,
        ETH: 3000
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0].asset_symbol).toBe('BTC');
    });

    it('should handle empty portfolio', async () => {
      Holding.findByPortfolioId.mockResolvedValue([]);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', {});

      expect(result.totalInvested).toBe('0.00');
      expect(result.totalCurrentValue).toBe('0.00');
      expect(result.totalUnrealizedPnL).toBe('0.00');
      expect(result.totalPnLPercentage).toBe('0.00');
      expect(result.holdings).toHaveLength(0);
    });

    it('should calculate P&L percentage correctly for each holding', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1,
          average_cost: 40000,
          total_invested: 40000,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 50000
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result.holdings[0].pnl_percentage).toBe('25.00'); // (10000 / 40000) * 100
      expect(result.holdings[0].unrealized_pnl).toBe('10000.00');
    });

    it('should handle multiple assets with mixed P&L', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1,
          average_cost: 40000,
          total_invested: 40000,
          current_price: null
        },
        {
          id: 'holding-2',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'ETH',
          total_quantity: 10,
          average_cost: 3000,
          total_invested: 30000,
          current_price: null
        },
        {
          id: 'holding-3',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'SOL',
          total_quantity: 50,
          average_cost: 150,
          total_invested: 7500,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 45000, // +12.5%
        ETH: 2800,  // -6.67%
        SOL: 160    // +6.67%
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      // BTC: (45000 - 40000) = 5000 profit
      // ETH: (28000 - 30000) = -2000 loss
      // SOL: (8000 - 7500) = 500 profit
      // Total: 3500 profit on 77500 invested

      expect(result.totalInvested).toBe('77500.00');
      expect(result.totalUnrealizedPnL).toBe('3500.00');
      expect(parseFloat(result.totalPnLPercentage)).toBeCloseTo(4.52, 1);
      expect(result.pnlColor).toBe('success');
    });

    it('should include 24h price change when available', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1,
          average_cost: 40000,
          total_invested: 40000,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 45000
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result.holdings[0]).toHaveProperty('current_price');
      expect(result.holdings[0].current_price).toBe('45000.00');
    });

    it('should handle very large numbers correctly', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1000,
          average_cost: 40000,
          total_invested: 40000000,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 50000
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result.totalInvested).toBe('40000000.00');
      expect(result.totalCurrentValue).toBe('50000000.00');
      expect(result.totalUnrealizedPnL).toBe('10000000.00');
      expect(result.totalPnLPercentage).toBe('25.00');
    });

    it('should handle decimal quantities correctly', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 0.5678,
          average_cost: 44321.50,
          total_invested: 25165.82,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 46000.75
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result.totalInvested).toBe('25165.82');
      expect(parseFloat(result.totalCurrentValue)).toBeCloseTo(26118.99, 2);
      expect(parseFloat(result.totalUnrealizedPnL)).toBeGreaterThan(0);
    });
  });

  describe('Asset Allocation', () => {
    
    it('should calculate correct asset allocation percentages', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1,
          average_cost: 40000,
          total_invested: 40000,
          current_price: null
        },
        {
          id: 'holding-2',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'ETH',
          total_quantity: 20,
          average_cost: 3000,
          total_invested: 60000,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: 45000,
        ETH: 3000
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      const totalValue = parseFloat(result.totalCurrentValue);
      const btcValue = 45000;
      const ethValue = 60000;

      expect(btcValue / totalValue * 100).toBeCloseTo(42.86, 1);
      expect(ethValue / totalValue * 100).toBeCloseTo(57.14, 1);
    });
  });

  describe('Edge Cases', () => {
    
    it('should handle zero invested with positive quantity', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'AIRDROP',
          total_quantity: 100,
          average_cost: 0,
          total_invested: 0,
          current_price: null
        }
      ];

      const currentPrices = {
        AIRDROP: 10
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      expect(result.totalInvested).toBe('0.00');
      expect(result.totalCurrentValue).toBe('1000.00');
      expect(result.totalUnrealizedPnL).toBe('1000.00');
      expect(result.totalPnLPercentage).toBe('0.00'); // Can't calculate % on zero investment
    });

    it('should handle null or undefined prices gracefully', async () => {
      const mockHoldings = [
        {
          id: 'holding-1',
          portfolio_id: 'portfolio-123',
          asset_symbol: 'BTC',
          total_quantity: 1,
          average_cost: 40000,
          total_invested: 40000,
          current_price: null
        }
      ];

      const currentPrices = {
        BTC: null
      };

      Holding.findByPortfolioId.mockResolvedValue(mockHoldings);

      const result = await PortfolioService.calculatePortfolioWithPnL('portfolio-123', currentPrices);

      // Should fallback to average_cost
      expect(result.totalCurrentValue).toBe('40000.00');
    });
  });
});
