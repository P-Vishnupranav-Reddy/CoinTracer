const Transaction = require('../models/transaction.model');
const pool = require('../config/database');

jest.mock('../config/database');

describe('Transaction Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new transaction', async () => {
      const transactionData = {
        portfolioId: 'portfolio-123',
        type: 'buy',
        assetId: 'BTC',
        symbol: 'BTC',
        quantity: 0.5,
        price: 50000,
        fee: 10,
        exchange: 'binance',
        transactionDate: new Date('2024-01-01'),
        tradeId: 'trade-123'
      };

      // Mock: no existing transaction
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        // Mock: successful insert
        .mockResolvedValueOnce({
          rows: [{ id: 'tx-456', ...transactionData }]
        });

      const result = await Transaction.create(transactionData);

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('tx-456');
      expect(result.type).toBe('buy');
    });

    it('should not create duplicate transaction with same trade_id', async () => {
      const transactionData = {
        portfolioId: 'portfolio-123',
        type: 'sell',
        symbol: 'ETH',
        quantity: 2,
        price: 3000,
        tradeId: 'existing-trade-123'
      };

      // Mock: existing transaction found
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'existing-tx' }]
      });

      const result = await Transaction.create(transactionData);

      expect(pool.query).toHaveBeenCalledTimes(1); // Only duplicate check
      expect(result.id).toBe('existing-tx');
    });

    it('should handle deposit transaction', async () => {
      const depositData = {
        portfolioId: 'portfolio-123',
        type: 'deposit',
        symbol: 'USDT',
        quantity: 1000,
        exchange: 'binance',
        transactionDate: new Date(),
        txid: 'txid-abc123',
        walletAddress: '0x123...',
        network: 'ERC20'
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'deposit-tx', ...depositData }]
        });

      const result = await Transaction.create(depositData);

      expect(result.type).toBe('deposit');
      expect(result.walletAddress).toBe('0x123...');
    });

    it('should handle withdrawal transaction', async () => {
      const withdrawalData = {
        portfolioId: 'portfolio-123',
        type: 'withdrawal',
        symbol: 'BTC',
        quantity: 0.1,
        fee: 0.0005,
        exchange: 'binance',
        transactionDate: new Date(),
        txid: 'txid-xyz',
        network: 'BTC'
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'withdrawal-tx', ...withdrawalData }]
        });

      const result = await Transaction.create(withdrawalData);

      expect(result.type).toBe('withdrawal');
      expect(result.fee).toBe(0.0005);
    });

    it('should handle conversion transaction with quote asset', async () => {
      const conversionData = {
        portfolioId: 'portfolio-123',
        type: 'conversion',
        symbol: 'BTC',
        quantity: 0.5,
        quoteAsset: 'USDT',
        quoteQuantity: 25000,
        conversionRate: 50000,
        transactionDate: new Date(),
        tradeId: 'conv-123'
      };

      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'conv-tx', ...conversionData }]
        });

      const result = await Transaction.create(conversionData);

      expect(result.type).toBe('conversion');
      expect(result.quoteAsset).toBe('USDT');
    });
  });

  describe('bulkCreate', () => {
    it('should insert multiple transactions', async () => {
      const transactions = [
        {
          portfolioId: 'portfolio-123',
          type: 'buy',
          symbol: 'BTC',
          quantity: 0.5,
          price: 50000,
          transactionDate: new Date()
        },
        {
          portfolioId: 'portfolio-123',
          type: 'sell',
          symbol: 'ETH',
          quantity: 2,
          price: 3000,
          transactionDate: new Date()
        }
      ];

      // Mock pool.connect() to return a client object
      const mockClient = {
        query: jest.fn().mockResolvedValue({
          rows: transactions.map((t, i) => ({ id: `tx-${i}`, ...t })),
          rowCount: 2
        }),
        release: jest.fn()
      };

      pool.connect = jest.fn().mockResolvedValue(mockClient);

      const result = await Transaction.bulkCreate(transactions);

      expect(result.length).toBe(2);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      const result = await Transaction.bulkCreate([]);

      expect(result).toEqual([]);
      expect(pool.connect).not.toHaveBeenCalled();
    });
  });

  describe('findByPortfolioId', () => {
    it('should return all transactions for a portfolio', async () => {
      const mockTransactions = [
        { id: '1', type: 'buy', symbol: 'BTC', quantity: 0.5 },
        { id: '2', type: 'sell', symbol: 'ETH', quantity: 2 }
      ];

      pool.query.mockResolvedValueOnce({ rows: mockTransactions });

      const result = await Transaction.findByPortfolioId('portfolio-123');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT *'),
        ['portfolio-123', 50, 0]
      );
      expect(result).toEqual(mockTransactions);
    });

    it('should return empty array when no transactions found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await Transaction.findByPortfolioId('empty-portfolio');

      expect(result).toEqual([]);
    });
  });

  describe('findByType', () => {
    it('should return transactions for specific types', async () => {
      const mockTransactions = [
        { id: '1', type: 'buy' },
        { id: '2', type: 'sell' }
      ];

      pool.query.mockResolvedValueOnce({ rows: mockTransactions });

      const result = await Transaction.findByType('portfolio-123', ['buy', 'sell']);

      expect(result).toEqual(mockTransactions);
      expect(result).toHaveLength(2);
    });
  });

  describe('deleteByConnectionId', () => {
    it('should delete all transactions for a connection', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 10, rows: [] });

      const result = await Transaction.deleteByConnectionId('conn-123');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM transactions'),
        ['conn-123']
      );
      expect(result).toBe(10);
    });
  });

  describe('delete', () => {
    it('should delete a specific transaction', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await Transaction.delete('tx-1');

      expect(result).toBe(true);
    });
  });
});
