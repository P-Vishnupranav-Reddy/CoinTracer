const ExchangeFactory = require('../services/exchangeFactory.service');
const BinanceService = require('../services/binance.service');
const KuCoinService = require('../services/kucoin.service');
const BingXService = require('../services/bingx.service');
const BitgetService = require('../services/bitget.service');

// Mock the service classes
jest.mock('../services/binance.service');
jest.mock('../services/kucoin.service');
jest.mock('../services/bingx.service');
jest.mock('../services/bitget.service');

describe('Exchange Factory Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getExchangeConfig', () => {
    it('should return Binance config', () => {
      const config = ExchangeFactory.getExchangeConfig('binance');

      expect(config).toBeDefined();
      expect(config.name).toBe('Binance');
      expect(config.requiresPassphrase).toBe(false);
    });

    it('should return KuCoin config', () => {
      const config = ExchangeFactory.getExchangeConfig('kucoin');

      expect(config).toBeDefined();
      expect(config.name).toBe('KuCoin');
      expect(config.requiresPassphrase).toBe(true);
    });

    it('should return BingX config', () => {
      const config = ExchangeFactory.getExchangeConfig('bingx');

      expect(config).toBeDefined();
      expect(config.name).toBe('BingX');
      expect(config.requiresPassphrase).toBe(false);
    });

    it('should return Bitget config', () => {
      const config = ExchangeFactory.getExchangeConfig('bitget');

      expect(config).toBeDefined();
      expect(config.name).toBe('Bitget');
      expect(config.requiresPassphrase).toBe(true);
    });

    it('should return null for unsupported exchange', () => {
      const config = ExchangeFactory.getExchangeConfig('unsupported-exchange');

      expect(config).toBeNull();
    });

    it('should handle case-insensitive exchange names', () => {
      const config1 = ExchangeFactory.getExchangeConfig('BINANCE');
      const config2 = ExchangeFactory.getExchangeConfig('BiNaNcE');

      expect(config1).toBeDefined();
      expect(config2).toBeDefined();
      expect(config1.name).toBe('Binance');
      expect(config2.name).toBe('Binance');
    });
  });

  describe('createService', () => {
    it('should create Binance service instance', () => {
      const mockService = { exchange: 'binance' };
      BinanceService.mockImplementation(() => mockService);

      const service = ExchangeFactory.createService('binance', 'api-key', 'api-secret');

      expect(BinanceService).toHaveBeenCalledWith('api-key', 'api-secret', {
        region: 'global',
        recvWindow: 60000,
        timeout: 30000
      });
      expect(service).toBe(mockService);
    });

    it('should create KuCoin service with passphrase', () => {
      const mockService = { exchange: 'kucoin' };
      KuCoinService.mockImplementation(() => mockService);

      const service = ExchangeFactory.createService(
        'kucoin',
        'api-key',
        'api-secret',
        'passphrase'
      );

      expect(KuCoinService).toHaveBeenCalledWith('api-key', 'api-secret', 'passphrase');
      expect(service).toBe(mockService);
    });

    it('should create BingX service instance', () => {
      const mockService = { exchange: 'bingx' };
      BingXService.mockImplementation(() => mockService);

      const service = ExchangeFactory.createService('bingx', 'api-key', 'api-secret');

      expect(BingXService).toHaveBeenCalledWith('api-key', 'api-secret');
      expect(service).toBe(mockService);
    });

    it('should create Bitget service with passphrase', () => {
      const mockService = { exchange: 'bitget' };
      BitgetService.mockImplementation(() => mockService);

      const service = ExchangeFactory.createService(
        'bitget',
        'api-key',
        'api-secret',
        'passphrase'
      );

      expect(BitgetService).toHaveBeenCalledWith('api-key', 'api-secret', 'passphrase');
      expect(service).toBe(mockService);
    });

    it('should throw error for unsupported exchange', () => {
      expect(() => {
        ExchangeFactory.createService('unsupported', 'api-key', 'api-secret');
      }).toThrow('Unsupported exchange: unsupported');
    });

    it('should pass options to service constructor', () => {
      const mockService = { exchange: 'binance' };
      BinanceService.mockImplementation(() => mockService);

      const options = { timeout: 30000, recvWindow: 5000, region: 'us' };
      ExchangeFactory.createService('binance', 'api-key', 'api-secret', null, options);

      expect(BinanceService).toHaveBeenCalledWith('api-key', 'api-secret', {
        region: 'us',
        recvWindow: 5000,
        timeout: 30000
      });
    });
  });

  describe('validateCredentials', () => {
    it('should return success when credentials are valid', async () => {
      const mockService = {
        testConnection: jest.fn().mockResolvedValue(true)
      };
      BinanceService.mockImplementation(() => mockService);

      const result = await ExchangeFactory.validateCredentials(
        'binance',
        'valid-key',
        'valid-secret'
      );

      expect(result).toBe(true);
      expect(mockService.testConnection).toHaveBeenCalled();
    });

    it('should return failure when credentials are invalid', async () => {
      const mockService = {
        testConnection: jest.fn().mockRejectedValue(
          new Error('Invalid API credentials')
        )
      };
      BinanceService.mockImplementation(() => mockService);

      const result = await ExchangeFactory.validateCredentials(
        'binance',
        'invalid-key',
        'invalid-secret'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid API credentials');
    });

    it('should handle network timeout errors', async () => {
      const mockService = {
        testConnection: jest.fn().mockRejectedValue(
          new Error('ETIMEDOUT')
        )
      };
      BinanceService.mockImplementation(() => mockService);

      const result = await ExchangeFactory.validateCredentials(
        'binance',
        'api-key',
        'api-secret'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('ETIMEDOUT');
    });

    it('should validate KuCoin with passphrase', async () => {
      const mockService = {
        testConnection: jest.fn().mockResolvedValue(true)
      };
      KuCoinService.mockImplementation(() => mockService);

      const result = await ExchangeFactory.validateCredentials(
        'kucoin',
        'api-key',
        'api-secret',
        'passphrase'
      );

      expect(result).toBe(true);
      expect(KuCoinService).toHaveBeenCalledWith(
        'api-key',
        'api-secret',
        'passphrase'
      );
    });

    it('should return failure for unsupported exchange', async () => {
      const result = await ExchangeFactory.validateCredentials(
        'unsupported',
        'api-key',
        'api-secret'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unsupported exchange');
    });
  });

  describe('getSupportedExchanges', () => {
    it('should return list of all supported exchanges', () => {
      const exchanges = ExchangeFactory.getSupportedExchanges();

      expect(exchanges).toBeInstanceOf(Array);
      expect(exchanges.length).toBeGreaterThan(0);
      expect(exchanges.some(e => e.value === 'binance')).toBe(true);
      expect(exchanges.some(e => e.value === 'kucoin')).toBe(true);
      expect(exchanges.some(e => e.value === 'bingx')).toBe(true);
      expect(exchanges.some(e => e.value === 'bitget')).toBe(true);
    });

    it('should return exchanges with proper config structure', () => {
      const exchanges = ExchangeFactory.getSupportedExchanges();

      exchanges.forEach(exchange => {
        expect(exchange).toHaveProperty('name');
        expect(exchange).toHaveProperty('value');
        expect(exchange).toHaveProperty('requiresPassphrase');
        expect(exchange).toHaveProperty('features');
      });
    });
  });
});
