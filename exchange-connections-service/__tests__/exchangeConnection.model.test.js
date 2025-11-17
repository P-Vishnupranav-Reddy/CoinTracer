const ExchangeConnection = require('../models/exchangeConnection.model');
const pool = require('../config/database');
const EncryptionUtil = require('../utils/encryption.util');

jest.mock('../config/database');
jest.mock('../utils/encryption.util');

describe('ExchangeConnection Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashApiKey', () => {
    it('should hash API key consistently', () => {
      const apiKey = 'test-api-key-123';
      const hash1 = ExchangeConnection.hashApiKey(apiKey);
      const hash2 = ExchangeConnection.hashApiKey(apiKey);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA256 hex = 64 chars
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = ExchangeConnection.hashApiKey('key1');
      const hash2 = ExchangeConnection.hashApiKey('key2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('create', () => {
    it('should create a new exchange connection with encryption', async () => {
      const connectionData = {
        userId: 'user-123',
        portfolioId: 'portfolio-456',
        exchange: 'binance',
        apiKey: 'my-api-key',
        apiSecret: 'my-api-secret',
        passphrase: null
      };

      EncryptionUtil.encrypt
        .mockReturnValueOnce('encrypted-api-key')
        .mockReturnValueOnce('encrypted-api-secret');

      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'conn-789',
          user_id: 'user-123',
          portfolio_id: 'portfolio-456',
          exchange: 'binance',
          is_active: true,
          created_at: new Date()
        }]
      });

      const result = await ExchangeConnection.create(connectionData);

      expect(EncryptionUtil.encrypt).toHaveBeenCalledTimes(2);
      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith('my-api-key');
      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith('my-api-secret');
      expect(result.id).toBe('conn-789');
      expect(result.exchange).toBe('binance');
    });

    it('should encrypt passphrase when provided', async () => {
      const connectionData = {
        userId: 'user-123',
        portfolioId: 'portfolio-456',
        exchange: 'kucoin',
        apiKey: 'key',
        apiSecret: 'secret',
        passphrase: 'my-passphrase'
      };

      EncryptionUtil.encrypt
        .mockReturnValueOnce('enc-key')
        .mockReturnValueOnce('enc-secret')
        .mockReturnValueOnce('enc-passphrase');

      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'conn-999', exchange: 'kucoin' }]
      });

      await ExchangeConnection.create(connectionData);

      expect(EncryptionUtil.encrypt).toHaveBeenCalledTimes(3);
      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith('my-passphrase');
    });
  });

  describe('findByApiKeyHash', () => {
    it('should find connection by API key hash', async () => {
      const mockConnection = {
        id: 'conn-123',
        user_id: 'user-456',
        exchange: 'binance'
      };

      pool.query.mockResolvedValueOnce({ rows: [mockConnection] });

      const result = await ExchangeConnection.findByApiKeyHash('binance', 'hash123');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('api_key_hash'),
        ['binance', 'hash123']
      );
      expect(result).toEqual(mockConnection);
    });

    it('should return null when no connection found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await ExchangeConnection.findByApiKeyHash('binance', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should return all connections for a user', async () => {
      const mockConnections = [
        { id: '1', exchange: 'binance' },
        { id: '2', exchange: 'bitget' }
      ];

      pool.query.mockResolvedValueOnce({ rows: mockConnections });

      const result = await ExchangeConnection.findByUserId('user-123');

      expect(result).toEqual(mockConnections);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no connections found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await ExchangeConnection.findByUserId('new-user');

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return connection with decrypted credentials', async () => {
      const mockConnection = {
        id: 'conn-123',
        exchange: 'binance',
        api_key_encrypted: 'enc-key',
        api_secret_encrypted: 'enc-secret',
        passphrase_encrypted: 'enc-pass'
      };

      EncryptionUtil.decrypt
        .mockReturnValueOnce('decrypted-key')
        .mockReturnValueOnce('decrypted-secret')
        .mockReturnValueOnce('decrypted-pass');

      pool.query.mockResolvedValueOnce({ rows: [mockConnection] });

      const result = await ExchangeConnection.findById('conn-123');

      expect(EncryptionUtil.decrypt).toHaveBeenCalledTimes(3);
      expect(result.apiKey).toBe('decrypted-key');
      expect(result.apiSecret).toBe('decrypted-secret');
      expect(result.passphrase).toBe('decrypted-pass');
    });

    it('should return null when connection not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await ExchangeConnection.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle missing passphrase', async () => {
      const mockConnection = {
        id: 'conn-123',
        api_key_encrypted: 'enc-key',
        api_secret_encrypted: 'enc-secret',
        passphrase_encrypted: null
      };

      EncryptionUtil.decrypt
        .mockReturnValueOnce('key')
        .mockReturnValueOnce('secret');

      pool.query.mockResolvedValueOnce({ rows: [mockConnection] });

      const result = await ExchangeConnection.findById('conn-123');

      expect(EncryptionUtil.decrypt).toHaveBeenCalledTimes(2);
      expect(result.passphrase).toBeUndefined();
    });
  });

  describe('updateSyncStatus', () => {
    it('should update sync status successfully', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'conn-123',
          sync_status: 'success',
          transactions_synced: 150
        }]
      });

      const result = await ExchangeConnection.updateSyncStatus('conn-123', 'success', 150);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE exchange_connections'),
        expect.arrayContaining(['success', 150, null, 'conn-123'])
      );
      expect(result.sync_status).toBe('success');
    });

    it('should store error message on failure', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'conn-123',
          sync_status: 'error',
          error_message: 'API rate limit exceeded'
        }]
      });

      const result = await ExchangeConnection.updateSyncStatus(
        'conn-123',
        'error',
        0,
        'API rate limit exceeded'
      );

      expect(result.error_message).toBe('API rate limit exceeded');
    });
  });

  describe('getSyncStatus', () => {
    it('should get sync status of a connection', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'conn-123',
          sync_status: 'success',
          last_sync_at: new Date(),
          transactions_synced: 100
        }]
      });

      const result = await ExchangeConnection.getSyncStatus('conn-123');

      expect(result.sync_status).toBe('success');
      expect(result.transactions_synced).toBe(100);
    });

    it('should return undefined when connection not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await ExchangeConnection.getSyncStatus('nonexistent');

      expect(result).toBeUndefined();
    });
  });
});
