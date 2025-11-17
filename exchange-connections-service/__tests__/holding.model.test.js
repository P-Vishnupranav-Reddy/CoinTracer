const Holding = require('../models/holding.model');
const pool = require('../config/database');

jest.mock('../config/database');

describe('Holding Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('upsert', () => {
    it('should insert a new holding when it does not exist', async () => {
      const holdingData = {
        portfolioId: 'portfolio-123',
        assetId: 'BTC',
        symbol: 'BTC',
        totalQuantity: 1.5,
        averageCost: 50000,
        totalInvested: 75000,
        currentPrice: 52000,
        depositAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        network: 'BTC'
      };

      // Mock: no existing holding
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        // Mock: successful insert
        .mockResolvedValueOnce({
          rows: [{ id: 'holding-456', ...holdingData }]
        });

      const result = await Holding.upsert(holdingData);

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('holding-456');
      expect(result.totalQuantity).toBe(1.5);
    });

    it('should update an existing holding', async () => {
      const holdingData = {
        portfolioId: 'portfolio-123',
        assetId: 'ETH',
        symbol: 'ETH',
        totalQuantity: 10,
        averageCost: 3000,
        totalInvested: 30000,
        currentPrice: 3100
      };

      // Mock: existing holding found
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 'holding-789' }] })
        // Mock: successful update
        .mockResolvedValueOnce({
          rows: [{ id: 'holding-789', ...holdingData }]
        });

      const result = await Holding.upsert(holdingData);

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('holding-789');
      expect(result.totalQuantity).toBe(10);
    });

    it('should handle null optional fields', async () => {
      const holdingData = {
        portfolioId: 'portfolio-123',
        symbol: 'USDT',
        totalQuantity: 1000,
        averageCost: 1,
        totalInvested: 1000
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'holding-999', ...holdingData, currentPrice: null }]
        });

      const result = await Holding.upsert(holdingData);

      expect(result.currentPrice).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const holdingData = {
        portfolioId: 'portfolio-123',
        symbol: 'BTC',
        totalQuantity: 1,
        averageCost: 50000,
        totalInvested: 50000
      };

      pool.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(Holding.upsert(holdingData)).rejects.toThrow('Database connection failed');
    });
  });

  describe('findByPortfolioId', () => {
    it('should return all holdings for a portfolio', async () => {
      const portfolioId = 'portfolio-123';
      const mockHoldings = [
        { id: '1', asset_symbol: 'BTC', total_quantity: 1.5, total_invested: 75000 },
        { id: '2', asset_symbol: 'ETH', total_quantity: 10, total_invested: 30000 }
      ];

      pool.query.mockResolvedValueOnce({ rows: mockHoldings });

      const result = await Holding.findByPortfolioId(portfolioId);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM holdings'),
        [portfolioId]
      );
      expect(result).toEqual(mockHoldings);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no holdings found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await Holding.findByPortfolioId('empty-portfolio');

      expect(result).toEqual([]);
    });
  });

  describe('findByPortfolioAndAsset', () => {
    it('should return a specific holding', async () => {
      const mockHolding = {
        id: '1',
        portfolio_id: 'portfolio-123',
        asset_symbol: 'BTC',
        total_quantity: 1.5
      };

      pool.query.mockResolvedValueOnce({ rows: [mockHolding] });

      const result = await Holding.findByPortfolioAndAsset('portfolio-123', 'BTC');

      expect(result).toEqual(mockHolding);
    });

    it('should return undefined when holding not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await Holding.findByPortfolioAndAsset('portfolio-123', 'NOTFOUND');

      expect(result).toBeUndefined();
    });
  });

  describe('recalculateFromTransactions', () => {
    it('should recalculate holdings from transactions', async () => {
      const mockHoldings = [
        { asset_symbol: 'BTC', total_quantity: 1.5, average_cost: 50000 }
      ];

      pool.query.mockResolvedValueOnce({ rows: mockHoldings });

      const result = await Holding.recalculateFromTransactions('portfolio-123');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('recalculate_holdings_from_transactions'),
        ['portfolio-123']
      );
      expect(result).toEqual(mockHoldings);
    });

    it('should throw error on database failure', async () => {
      pool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(Holding.recalculateFromTransactions('portfolio-123')).rejects.toThrow('Database error');
    });
  });
});
