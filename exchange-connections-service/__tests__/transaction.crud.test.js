const Transaction = require('../models/transaction.model');
const pool = require('../config/database');

jest.mock('../config/database');

describe('Transaction Model CRUD Operations', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    
    pool.connect = jest.fn().mockResolvedValue(mockClient);
    pool.query = jest.fn();
  });

  describe('create', () => {
    it('should create a new transaction', async () => {
      const transactionData = {
        portfolioId: 'port-123',
        type: 'buy',
        assetId: 'BTC',
        symbol: 'BTC/USDT',
        quantity: 0.5,
        price: 50000,
        fee: 10,
        exchange: 'binance',
        transactionDate: new Date(),
        tradeId: 'trade-123'
      };

      const mockResult = {
        rows: [{ id: 'txn-123', ...transactionData }]
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Check for existing
        .mockResolvedValueOnce(mockResult); // Insert

      const result = await Transaction.create(transactionData);

      expect(result).toBeDefined();
      expect(result.id).toBe('txn-123');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should skip duplicate transactions by tradeId', async () => {
      const transactionData = {
        portfolioId: 'port-123',
        type: 'buy',
        assetId: 'BTC',
        symbol: 'BTC/USDT',
        quantity: 0.5,
        price: 50000,
        tradeId: 'trade-123'
      };

      const existingTransaction = { id: 'existing-123' };
      pool.query.mockResolvedValueOnce({ rows: [existingTransaction] });

      const result = await Transaction.create(transactionData);

      expect(result).toEqual(existingTransaction);
      expect(pool.query).toHaveBeenCalledTimes(1); // Only duplicate check
    });

    it('should handle invalid date inputs', async () => {
      const transactionData = {
        portfolioId: 'port-123',
        type: 'buy',
        assetId: 'BTC',
        symbol: 'BTC',
        quantity: 1,
        price: 50000,
        transactionDate: 'invalid-date',
        tradeId: 'trade-456' // Need tradeId to trigger duplicate check
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check
        .mockResolvedValueOnce({ rows: [{ id: 'txn-123' }] }); // Insert

      const result = await Transaction.create(transactionData);

      expect(result).toBeDefined();
      expect(pool.query).toHaveBeenCalledTimes(2);
      // Second call should have a valid Date object
      const insertCallArgs = pool.query.mock.calls[1][1];
      const dateArg = insertCallArgs[9]; // transactionDate is 10th argument
      expect(dateArg).toBeInstanceOf(Date);
    });
  });

  describe('bulkCreate', () => {
    it('should bulk insert multiple transactions', async () => {
      const transactions = [
        {
          portfolioId: 'port-123',
          type: 'buy',
          assetId: 'BTC',
          symbol: 'BTC',
          quantity: 0.5,
          price: 50000,
          tradeId: 'trade-1'
        },
        {
          portfolioId: 'port-123',
          type: 'sell',
          assetId: 'ETH',
          symbol: 'ETH',
          quantity: 10,
          price: 3000,
          tradeId: 'trade-2'
        }
      ];

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing
        .mockResolvedValueOnce({ rows: [{ id: 'txn-1' }] }) // Insert 1
        .mockResolvedValueOnce({ rows: [{ id: 'txn-2' }] }) // Insert 2
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await Transaction.bulkCreate(transactions);

      expect(result).toHaveLength(2);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should skip duplicate transactions in bulk insert', async () => {
      const transactions = [
        {
          portfolioId: 'port-123',
          type: 'buy',
          assetId: 'BTC',
          symbol: 'BTC',
          quantity: 0.5,
          price: 50000,
          tradeId: 'trade-1'
        },
        {
          portfolioId: 'port-123',
          type: 'buy',
          assetId: 'BTC',
          symbol: 'BTC',
          quantity: 0.3,
          price: 51000,
          tradeId: 'trade-1' // Duplicate
        }
      ];

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ trade_id: 'trade-1' }] }) // Existing trade_ids
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await Transaction.bulkCreate(transactions);

      expect(result).toHaveLength(0); // Both skipped (one existing, one duplicate in batch)
    });

    it('should rollback on error', async () => {
      const transactions = [
        {
          portfolioId: 'port-123',
          type: 'buy',
          assetId: 'BTC',
          symbol: 'BTC',
          quantity: 0.5,
          price: 50000
        }
      ];

      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing
        .mockRejectedValueOnce(new Error('Insert failed')); // Insert error

      await expect(Transaction.bulkCreate(transactions)).rejects.toThrow('Insert failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle empty transaction array', async () => {
      const result = await Transaction.bulkCreate([]);
      expect(result).toEqual([]);
    });
  });

  describe('findByPortfolioId', () => {
    it('should find transactions by portfolio ID', async () => {
      const mockTransactions = [
        { id: 'txn-1', type: 'buy', asset_id: 'BTC' },
        { id: 'txn-2', type: 'sell', asset_id: 'ETH' }
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await Transaction.findByPortfolioId('port-123', 50, 0);

      expect(result).toEqual(mockTransactions);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE portfolio_id = $1'),
        expect.arrayContaining(['port-123', 50, 0])
      );
    });

    it('should filter by transaction type', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await Transaction.findByPortfolioId('port-123', 50, 0, 'buy,sell');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND type = ANY'),
        expect.arrayContaining(['port-123', ['buy', 'sell'], 50, 0])
      );
    });
  });

  describe('findByType', () => {
    it('should find transactions by specific types', async () => {
      const mockTransactions = [
        { id: 'txn-1', type: 'deposit' },
        { id: 'txn-2', type: 'withdraw' }
      ];

      pool.query.mockResolvedValue({ rows: mockTransactions });

      const result = await Transaction.findByType('port-123', ['deposit', 'withdraw']);

      expect(result).toEqual(mockTransactions);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE portfolio_id = $1'),
        ['port-123', ['deposit', 'withdraw']]
      );
    });

    it('should handle query errors', async () => {
      pool.query.mockRejectedValue(new Error('Query failed'));

      await expect(Transaction.findByType('port-123', ['buy'])).rejects.toThrow('Query failed');
    });
  });

  describe('findById', () => {
    it('should find a transaction by ID', async () => {
      const mockTransaction = { id: 'txn-123', type: 'buy' };
      pool.query.mockResolvedValue({ rows: [mockTransaction] });

      const result = await Transaction.findById('txn-123');

      expect(result).toEqual(mockTransaction);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM transactions WHERE id = $1',
        ['txn-123']
      );
    });

    it('should return undefined if not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await Transaction.findById('invalid-id');

      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update a transaction', async () => {
      const updateData = {
        quantity: 1.5,
        price: 55000,
        transactionDate: new Date()
      };

      const mockUpdated = { id: 'txn-123', ...updateData };
      pool.query.mockResolvedValue({ rows: [mockUpdated] });

      const result = await Transaction.update('txn-123', updateData);

      expect(result).toEqual(mockUpdated);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE transactions'),
        expect.arrayContaining([1.5, 55000, expect.any(Date), 'txn-123'])
      );
    });
  });

  describe('delete', () => {
    it('should delete a transaction', async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const result = await Transaction.delete('txn-123');

      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        'DELETE FROM transactions WHERE id = $1',
        ['txn-123']
      );
    });
  });

  describe('deleteByConnectionId', () => {
    it('should delete all transactions for a connection', async () => {
      pool.query.mockResolvedValue({
        rowCount: 5,
        rows: [
          { id: 'txn-1' },
          { id: 'txn-2' },
          { id: 'txn-3' },
          { id: 'txn-4' },
          { id: 'txn-5' }
        ]
      });

      const result = await Transaction.deleteByConnectionId('conn-123');

      expect(result).toBe(5);
      expect(pool.query).toHaveBeenCalledWith(
        'DELETE FROM transactions WHERE connection_id = $1 RETURNING id',
        ['conn-123']
      );
    });

    it('should handle errors', async () => {
      pool.query.mockRejectedValue(new Error('Delete failed'));

      await expect(Transaction.deleteByConnectionId('conn-123')).rejects.toThrow('Delete failed');
    });
  });

  describe('Date validation', () => {
    it('should handle numeric timestamps', async () => {
      const transactionData = {
        portfolioId: 'port-123',
        type: 'buy',
        assetId: 'BTC',
        symbol: 'BTC',
        quantity: 1,
        price: 50000,
        transactionDate: 1700000000, // Unix timestamp in seconds
        tradeId: 'trade-789' // Need tradeId for duplicate check
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check
        .mockResolvedValueOnce({ rows: [{ id: 'txn-123' }] }); // Insert

      await Transaction.create(transactionData);

      const callArgs = pool.query.mock.calls[1][1];
      const dateArg = callArgs[9]; // transactionDate is 10th argument
      expect(dateArg).toBeInstanceOf(Date);
    });

    it('should handle Date objects', async () => {
      const testDate = new Date('2024-01-01');
      const transactionData = {
        portfolioId: 'port-123',
        type: 'buy',
        assetId: 'BTC',
        symbol: 'BTC',
        quantity: 1,
        price: 50000,
        transactionDate: testDate,
        tradeId: 'trade-101' // Need tradeId
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check
        .mockResolvedValueOnce({ rows: [{ id: 'txn-123' }] }); // Insert

      await Transaction.create(transactionData);

      const callArgs = pool.query.mock.calls[1][1];
      expect(callArgs[9]).toEqual(testDate);
    });

    it('should fallback to current date for null input', async () => {
      const transactionData = {
        portfolioId: 'port-123',
        type: 'buy',
        assetId: 'BTC',
        symbol: 'BTC',
        quantity: 1,
        price: 50000,
        transactionDate: null,
        tradeId: 'trade-102' // Need tradeId
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Duplicate check
        .mockResolvedValueOnce({ rows: [{ id: 'txn-123' }] }); // Insert

      await Transaction.create(transactionData);

      const callArgs = pool.query.mock.calls[1][1];
      const dateArg = callArgs[9];
      expect(dateArg).toBeInstanceOf(Date);
      expect(Math.abs(Date.now() - dateArg.getTime())).toBeLessThan(1000); // Within 1 second
    });
  });
});
