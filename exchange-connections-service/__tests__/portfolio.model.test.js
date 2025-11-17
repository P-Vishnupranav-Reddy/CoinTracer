const Portfolio = require('../models/portfolio.model');
const pool = require('../config/database');

jest.mock('../config/database');

describe('Portfolio Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new portfolio', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'portfolio-123', user_id: 'user-456', name: 'My Portfolio' }]
      });

      const result = await Portfolio.create('user-456', 'My Portfolio');

      expect(result.name).toBe('My Portfolio');
      expect(result.user_id).toBe('user-456');
    });
  });

  describe('findByUserId', () => {
    it('should return all portfolios for a user', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: '1', name: 'Portfolio 1' },
          { id: '2', name: 'Portfolio 2' }
        ]
      });

      const result = await Portfolio.findByUserId('user-123');

      expect(result).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('should find portfolio by ID', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'portfolio-123', name: 'My Portfolio' }]
      });

      const result = await Portfolio.findById('portfolio-123');

      expect(result.id).toBe('portfolio-123');
    });

    it('should return undefined when not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await Portfolio.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update portfolio', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'portfolio-123', name: 'Updated Name' }]
      });

      const result = await Portfolio.update('portfolio-123', 'Updated Name', 'New description');

      expect(result.name).toBe('Updated Name');
    });
  });

  describe('delete', () => {
    it('should delete portfolio', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await Portfolio.delete('portfolio-123');

      expect(result).toBe(true);
    });
  });

  describe('getWithHoldings', () => {
    it('should return portfolio with holdings and total value', async () => {
      const mockPortfolio = { id: 'portfolio-123', name: 'My Portfolio', user_id: 'user-456' };
      const mockHoldings = [
        { id: 'h1', asset: 'BTC', quantity: 1, total_invested: '50000' },
        { id: 'h2', asset: 'ETH', quantity: 10, total_invested: '30000' },
        { id: 'h3', asset: 'SOL', quantity: 100, total_invested: '20000' }
      ];

      pool.query
        .mockResolvedValueOnce({ rows: [mockPortfolio] })
        .mockResolvedValueOnce({ rows: mockHoldings });

      const result = await Portfolio.getWithHoldings('portfolio-123');

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM portfolios WHERE id = $1', ['portfolio-123']);
      expect(pool.query).toHaveBeenNthCalledWith(2, 'SELECT * FROM holdings WHERE portfolio_id = $1', ['portfolio-123']);
      
      expect(result.portfolio).toEqual(mockPortfolio);
      expect(result.holdings).toEqual(mockHoldings);
      expect(result.totalValue).toBe(100000); // 50000 + 30000 + 20000
    });

    it('should handle portfolio with no holdings', async () => {
      const mockPortfolio = { id: 'portfolio-empty', name: 'Empty Portfolio', user_id: 'user-456' };
      
      pool.query
        .mockResolvedValueOnce({ rows: [mockPortfolio] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await Portfolio.getWithHoldings('portfolio-empty');

      expect(result.portfolio).toEqual(mockPortfolio);
      expect(result.holdings).toEqual([]);
      expect(result.totalValue).toBe(0);
    });

    it('should calculate totalValue with decimal precision', async () => {
      const mockPortfolio = { id: 'portfolio-123', name: 'Test' };
      const mockHoldings = [
        { total_invested: '123.45' },
        { total_invested: '678.90' },
        { total_invested: '0.65' }
      ];

      pool.query
        .mockResolvedValueOnce({ rows: [mockPortfolio] })
        .mockResolvedValueOnce({ rows: mockHoldings });

      const result = await Portfolio.getWithHoldings('portfolio-123');

      expect(result.totalValue).toBe(803); // 123.45 + 678.90 + 0.65
    });
  });
});
