const ManualHolding = require('../models/manualHolding.model');
const pool = require('../config/database');

jest.mock('../../shared/database');

describe('ManualHolding Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('upsert', () => {
    it('should create or update a manual holding', async () => {
      const mockHolding = {
        id: 'holding-123',
        portfolio_id: 'port-1',
        asset_symbol: 'BTC',
        quantity: '1.5',
        average_cost: '50000'
      };

      require('../../shared/database').query.mockResolvedValueOnce({ rows: [mockHolding] });

      const result = await ManualHolding.upsert('port-1', 'BTC', 1.5, 50000);

      expect(result.id).toBe('holding-123');
      expect(require('../../shared/database').query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO manual_holdings'),
        expect.arrayContaining(['port-1', 'BTC', 1.5, 50000])
      );
    });

    it('should handle errors', async () => {
      require('../../shared/database').query.mockRejectedValueOnce(new Error('DB Error'));

      await expect(ManualHolding.upsert('port-1', 'BTC', 1.5)).rejects.toThrow('DB Error');
    });
  });

  describe('getByPortfolioId', () => {
    it('should find all holdings for a portfolio', async () => {
      const mockHoldings = [
        { id: '1', asset_symbol: 'BTC', quantity: '1.5' },
        { id: '2', asset_symbol: 'ETH', quantity: '10' }
      ];

      require('../../shared/database').query.mockResolvedValueOnce({ rows: mockHoldings });

      const result = await ManualHolding.getByPortfolioId('port-1');

      expect(result).toEqual(mockHoldings);
      expect(require('../../shared/database').query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM manual_holdings'),
        ['port-1']
      );
    });

    it('should return empty array when none found', async () => {
      require('../../shared/database').query.mockResolvedValueOnce({ rows: [] });

      const result = await ManualHolding.getByPortfolioId('port-1');

      expect(result).toEqual([]);
    });
  });

  describe('getBySymbol', () => {
    it('should find holding by portfolio and symbol', async () => {
      const mockHolding = { id: 'holding-1', asset_symbol: 'BTC' };

      require('../../shared/database').query.mockResolvedValueOnce({ rows: [mockHolding] });

      const result = await ManualHolding.getBySymbol('port-1', 'BTC');

      expect(result).toEqual(mockHolding);
    });

    it('should return undefined when not found', async () => {
      require('../../shared/database').query.mockResolvedValueOnce({ rows: [] });

      const result = await ManualHolding.getBySymbol('port-1', 'XRP');

      expect(result).toBeUndefined();
    });

    it('should uppercase asset symbol', async () => {
      require('../../shared/database').query.mockResolvedValueOnce({ rows: [{}] });

      await ManualHolding.getBySymbol('port-1', 'btc');

      expect(require('../../shared/database').query).toHaveBeenCalledWith(
        expect.any(String),
        ['port-1', 'BTC']
      );
    });
  });

  describe('delete', () => {
    it('should delete a manual holding', async () => {
      const mockDeleted = { id: 'holding-1', asset_symbol: 'BTC' };
      
      require('../../shared/database').query.mockResolvedValueOnce({ rows: [mockDeleted] });

      const result = await ManualHolding.delete('port-1', 'BTC');

      expect(result).toEqual(mockDeleted);
      expect(require('../../shared/database').query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM manual_holdings'),
        ['port-1', 'BTC']
      );
    });

    it('should return undefined when not found', async () => {
      require('../../shared/database').query.mockResolvedValueOnce({ rows: [] });

      const result = await ManualHolding.delete('port-1', 'nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('deleteByPortfolioId', () => {
    it('should delete all holdings for a portfolio', async () => {
      require('../../shared/database').query.mockResolvedValueOnce({ rowCount: 5 });

      const result = await ManualHolding.deleteByPortfolioId('port-1');

      expect(result).toBe(5);
      expect(require('../../shared/database').query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM manual_holdings'),
        ['port-1']
      );
    });

    it('should return 0 when no holdings', async () => {
      require('../../shared/database').query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await ManualHolding.deleteByPortfolioId('port-1');

      expect(result).toBe(0);
    });
  });
});
