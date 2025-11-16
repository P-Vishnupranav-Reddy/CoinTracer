const BinanceService = require('./binance.service');
const BitgetService = require('./bitget.service');
const KuCoinService = require('./kucoin.service');
const BingXService = require('./bingx.service');

/**
 * Exchange Factory
 * Creates appropriate exchange service instances based on exchange type
 */
class ExchangeFactory {
  /**
   * Create exchange service instance
   * @param {string} exchange - Exchange name (binance, bitget, kucoin, bingx)
   * @param {string} apiKey - API key
   * @param {string} apiSecret - API secret
   * @param {string} passphrase - Optional passphrase (required for KuCoin, Bitget)
   * @param {object} options - Additional options (e.g., region for Binance)
   * @returns {Object} Exchange service instance
   */
  static createService(exchange, apiKey, apiSecret, passphrase = null, options = {}) {
    const exchangeName = exchange.toLowerCase();

    switch (exchangeName) {
      case 'binance':
        return new BinanceService(apiKey, apiSecret, {
          region: options.region || process.env.BINANCE_REGION || 'global',
          recvWindow: options.recvWindow || Number(process.env.BINANCE_RECV_WINDOW || 60000),
          timeout: options.timeout || Number(process.env.BINANCE_TIMEOUT || 30000)
        });

      case 'bitget':
        if (!passphrase) {
          throw new Error('Bitget requires passphrase');
        }
        return new BitgetService(apiKey, apiSecret, passphrase);

      case 'kucoin':
        if (!passphrase) {
          throw new Error('KuCoin requires passphrase');
        }
        return new KuCoinService(apiKey, apiSecret, passphrase);

      case 'bingx':
        return new BingXService(apiKey, apiSecret);

      default:
        throw new Error(`Unsupported exchange: ${exchange}`);
    }
  }

  /**
   * Get list of supported exchanges with their configurations
   * @returns {Array} List of supported exchanges
   */
  static getSupportedExchanges() {
    return [
      {
        name: 'Binance',
        value: 'binance',
        requiresPassphrase: false,
        color: 'from-yellow-400 to-yellow-600',
        logo: '🟨',
        features: {
          balance: true,
          trades: true,
          deposits: true,
          withdrawals: true,
          conversions: true
        }
      },
      {
        name: 'Bitget',
        value: 'bitget',
        requiresPassphrase: true,
        color: 'from-blue-400 to-blue-600',
        logo: '🔵',
        features: {
          balance: true,
          trades: true,
          deposits: true,
          withdrawals: true,
          conversions: false
        }
      },
      {
        name: 'KuCoin',
        value: 'kucoin',
        requiresPassphrase: true,
        color: 'from-green-400 to-green-600',
        logo: '🟢',
        features: {
          balance: true,
          trades: true,
          deposits: true,
          withdrawals: true,
          conversions: false
        }
      },
      {
        name: 'BingX',
        value: 'bingx',
        requiresPassphrase: false,
        color: 'from-purple-400 to-purple-600',
        logo: '🟣',
        features: {
          balance: true,
          trades: true,
          deposits: true,
          withdrawals: true,
          conversions: false
        }
      }
    ];
  }

  /**
   * Validate exchange credentials by testing connection
   * @param {string} exchange - Exchange name
   * @param {string} apiKey - API key
   * @param {string} apiSecret - API secret
   * @param {string} passphrase - Optional passphrase
   * @param {object} options - Additional options
   * @returns {Promise<Object>} Validation result {success: boolean, message: string}
   */
  static async validateCredentials(exchange, apiKey, apiSecret, passphrase = null, options = {}) {
    try {
      const service = this.createService(exchange, apiKey, apiSecret, passphrase, options);
      const result = await service.testConnection();
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Check if exchange requires passphrase
   * @param {string} exchange - Exchange name
   * @returns {boolean} True if passphrase required
   */
  static requiresPassphrase(exchange) {
    const exchangeConfig = this.getSupportedExchanges().find(
      (e) => e.value === exchange.toLowerCase()
    );
    return exchangeConfig ? exchangeConfig.requiresPassphrase : false;
  }

  /**
   * Get exchange configuration
   * @param {string} exchange - Exchange name
   * @returns {Object|null} Exchange configuration or null if not found
   */
  static getExchangeConfig(exchange) {
    return (
      this.getSupportedExchanges().find((e) => e.value === exchange.toLowerCase()) || null
    );
  }
}

module.exports = ExchangeFactory;
