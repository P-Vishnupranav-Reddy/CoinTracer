const ExchangeFactory = require('../services/exchangeFactory.service');
const BinanceService = require('../services/binance.service');
const BingXService = require('../services/bingx.service');
const BitgetService = require('../services/bitget.service');
const KuCoinService = require('../services/kucoin.service');

jest.mock('../services/binance.service');
jest.mock('../services/bingx.service');
jest.mock('../services/bitget.service');
jest.mock('../services/kucoin.service');

describe('ExchangeFactory Service - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createService - Edge Cases', () => {
    it('should create Binance service', () => {
      const result = ExchangeFactory.createService('binance', 'key', 'secret');

      expect(BinanceService).toHaveBeenCalledWith('key', 'secret', expect.any(Object));
      expect(result).toBeDefined();
    });

    it('should create BingX service', () => {
      const result = ExchangeFactory.createService('bingx', 'key', 'secret');

      expect(BingXService).toHaveBeenCalledWith('key', 'secret');
      expect(result).toBeDefined();
    });

    it('should create Bitget service with passphrase', () => {
      const result = ExchangeFactory.createService('bitget', 'key', 'secret', 'pass');

      expect(BitgetService).toHaveBeenCalledWith('key', 'secret', 'pass');
      expect(result).toBeDefined();
    });

    it('should create KuCoin service with passphrase', () => {
      const result = ExchangeFactory.createService('kucoin', 'key', 'secret', 'pass');

      expect(KuCoinService).toHaveBeenCalledWith('key', 'secret', 'pass');
      expect(result).toBeDefined();
    });

    it('should handle case-insensitive exchange names', () => {
      const result = ExchangeFactory.createService('BINANCE', 'key', 'secret');

      expect(BinanceService).toHaveBeenCalled();
    });

    it('should throw error for unsupported exchange', () => {
      expect(() => {
        ExchangeFactory.createService('unsupported', 'key', 'secret');
      }).toThrow('Unsupported exchange');
    });

    it('should throw error when KuCoin missing passphrase', () => {
      expect(() => {
        ExchangeFactory.createService('kucoin', 'key', 'secret');
      }).toThrow('KuCoin requires passphrase');
    });

    it('should throw error when Bitget missing passphrase', () => {
      expect(() => {
        ExchangeFactory.createService('bitget', 'key', 'secret');
      }).toThrow('Bitget requires passphrase');
    });

    it('should handle special characters in credentials', () => {
      const key = 'key!@#$%^&*()';
      const secret = 'secret!@#$%^&*()';

      ExchangeFactory.createService('binance', key, secret);

      expect(BinanceService).toHaveBeenCalledWith(key, secret, expect.any(Object));
    });
  });

  describe('getSupportedExchanges - Edge Cases', () => {
    it('should return list of supported exchanges', () => {
      const result = ExchangeFactory.getSupportedExchanges();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include exchange configurations', () => {
      const result = ExchangeFactory.getSupportedExchanges();

      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('value');
    });

    it('should include passphrase requirements', () => {
      const result = ExchangeFactory.getSupportedExchanges();
      const kucoin = result.find(ex => ex.value === 'kucoin');

      expect(kucoin).toBeDefined();
      expect(kucoin.requiresPassphrase).toBe(true);
    });
  });

  describe('validateExchangeConfig - Edge Cases', () => {
    it('should validate complete Binance config', () => {
      const config = {
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret'
      };

      expect(() => {
        ExchangeFactory.createService(config.exchange, config.apiKey, config.apiSecret);
      }).not.toThrow();
    });

    it('should validate complete KuCoin config', () => {
      const config = {
        exchange: 'kucoin',
        apiKey: 'key',
        apiSecret: 'secret',
        passphrase: 'pass'
      };

      expect(() => {
        ExchangeFactory.createService(config.exchange, config.apiKey, config.apiSecret, config.passphrase);
      }).not.toThrow();
    });

    it('should reject incomplete KuCoin config', () => {
      const config = {
        exchange: 'kucoin',
        apiKey: 'key',
        apiSecret: 'secret'
      };

      expect(() => {
        ExchangeFactory.createService(config.exchange, config.apiKey, config.apiSecret);
      }).toThrow();
    });
  });

  describe('Service Instantiation - Edge Cases', () => {
    it('should pass options to Binance service', () => {
      const options = { region: 'us', recvWindow: 10000 };

      ExchangeFactory.createService('binance', 'key', 'secret', null, options);

      expect(BinanceService).toHaveBeenCalledWith(
        'key',
        'secret',
        expect.objectContaining({ region: 'us', recvWindow: 10000 })
      );
    });

    it('should use default options for Binance', () => {
      ExchangeFactory.createService('binance', 'key', 'secret');

      expect(BinanceService).toHaveBeenCalledWith(
        'key',
        'secret',
        expect.objectContaining({ region: expect.any(String) })
      );
    });

    it('should handle empty options object', () => {
      const result = ExchangeFactory.createService('binance', 'key', 'secret', null, {});

      expect(result).toBeDefined();
    });
  });
});
