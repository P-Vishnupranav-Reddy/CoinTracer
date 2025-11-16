const axios = require('axios');
const NodeCache = require('node-cache');

// CoinMarketCap API Configuration
const CMC_API_KEY = process.env.CMC_API_KEY || 'DEMO_KEY';
const CMC_BASE_URL = process.env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com';
const CMC_SANDBOX_URL = 'https://sandbox-api.coinmarketcap.com'; // For testing without credits

const ttl = Number(process.env.CACHE_TTL_SECONDS || 60); // CMC updates every 60s
const cache = new NodeCache({ stdTTL: ttl, checkperiod: ttl });

// Use sandbox for demo key, production for real key
const baseURL = CMC_API_KEY === 'DEMO_KEY' ? CMC_SANDBOX_URL : CMC_BASE_URL;

const client = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'X-CMC_PRO_API_KEY': CMC_API_KEY,
    Accept: 'application/json'
  }
});

/**
 * Symbol normalization mapping (common variations)
 */
const SYMBOL_ALIASES = {
  // Common names → symbols
  bitcoin: 'BTC',
  ethereum: 'ETH',
  ripple: 'XRP',
  dogecoin: 'DOGE',
  cardano: 'ADA',
  polkadot: 'DOT',
  litecoin: 'LTC',
  solana: 'SOL',
  polygon: 'MATIC',
  binancecoin: 'BNB',
  // Lowercase symbols
  btc: 'BTC',
  eth: 'ETH',
  xrp: 'XRP',
  doge: 'DOGE',
  ada: 'ADA',
  dot: 'DOT',
  ltc: 'LTC',
  sol: 'SOL',
  matic: 'MATIC',
  bnb: 'BNB'
};

/**
 * Normalize symbol to uppercase standard
 */
function normalizeSymbol(symbol) {
  if (!symbol) return null;
  const key = String(symbol).toLowerCase();
  return SYMBOL_ALIASES[key] || symbol.toUpperCase();
}

/**
 * Get cryptocurrency map (symbol → CMC ID mapping)
 * This is cached for 12 hours as it rarely changes
 */
async function getCryptoMap() {
  const cacheKey = 'cmc:crypto_map';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await client.get('/v1/cryptocurrency/map', {
      params: {
        listing_status: 'active',
        limit: 5000 // Get top 5000 active cryptos
      }
    });

    const map = new Map();
    if (data.data && Array.isArray(data.data)) {
      for (const crypto of data.data) {
        map.set(crypto.symbol.toUpperCase(), {
          id: crypto.id,
          name: crypto.name,
          symbol: crypto.symbol,
          slug: crypto.slug
        });
      }
    }

    cache.set(cacheKey, map, 12 * 60 * 60); // Cache for 12 hours
    return map;
  } catch (error) {
    console.error('[CMC] Error fetching crypto map:', error.message);
    return new Map();
  }
}

/**
 * Get latest quotes for multiple cryptocurrencies
 * @param {string[]} symbols - Array of cryptocurrency symbols
 * @param {string} convert - Target currency (default: USD)
 * @returns {Object} Map of symbol → quote data
 */
async function getLatestQuotes(symbols, convert = 'USD') {
  if (!symbols || symbols.length === 0) return {};

  // Normalize symbols
  const normalizedSymbols = symbols.map(normalizeSymbol).filter(Boolean);
  const symbolsParam = normalizedSymbols.join(',');

  const cacheKey = `cmc:quotes:${symbolsParam}:${convert}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await client.get('/v2/cryptocurrency/quotes/latest', {
      params: {
        symbol: symbolsParam,
        convert,
        skip_invalid: true // Skip symbols that don't exist
      }
    });

    const quotes = {};

    if (data.data) {
      // V2 endpoint returns arrays for each symbol (handles duplicates)
      for (const [symbol, cryptoArray] of Object.entries(data.data)) {
        if (Array.isArray(cryptoArray) && cryptoArray.length > 0) {
          // Take the first (highest ranked) coin with this symbol
          const crypto = cryptoArray[0];
          const quote = crypto.quote[convert];

          quotes[symbol] = {
            id: crypto.id,
            name: crypto.name,
            symbol: crypto.symbol,
            slug: crypto.slug,
            price: quote.price,
            volume_24h: quote.volume_24h,
            volume_change_24h: quote.volume_change_24h || 0,
            percent_change_1h: quote.percent_change_1h || 0,
            percent_change_24h: quote.percent_change_24h || 0,
            percent_change_7d: quote.percent_change_7d || 0,
            market_cap: quote.market_cap,
            market_cap_dominance: quote.market_cap_dominance || 0,
            circulating_supply: crypto.circulating_supply,
            total_supply: crypto.total_supply,
            max_supply: crypto.max_supply,
            last_updated: quote.last_updated
          };
        }
      }
    }

    cache.set(cacheKey, quotes);
    return quotes;
  } catch (error) {
    console.error('[CMC] Error fetching quotes:', error.message);
    if (error.response) {
      console.error('[CMC] Response status:', error.response.status);
      console.error('[CMC] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return {};
  }
}

/**
 * Get latest quote for a single cryptocurrency
 * @param {string} symbol - Cryptocurrency symbol
 * @param {string} convert - Target currency (default: USD)
 * @returns {Object|null} Quote data or null if not found
 */
async function getLatestQuote(symbol, convert = 'USD') {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;

  const quotes = await getLatestQuotes([normalized], convert);
  return quotes[normalized] || null;
}

/**
 * Search for cryptocurrencies by name or symbol
 * @param {string} query - Search query
 * @param {number} limit - Max results to return
 * @returns {Array} Array of matching cryptocurrencies
 */
async function searchCryptos(query, limit = 20) {
  if (!query || query.length < 2) return [];

  const cacheKey = `cmc:search:${query.toLowerCase()}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const cryptoMap = await getCryptoMap();
    const results = [];
    const queryLower = query.toLowerCase();

    for (const [symbol, info] of cryptoMap) {
      if (
        symbol.toLowerCase().includes(queryLower) ||
        info.name.toLowerCase().includes(queryLower) ||
        info.slug.toLowerCase().includes(queryLower)
      ) {
        results.push({
          id: info.id,
          symbol: info.symbol,
          name: info.name,
          slug: info.slug
        });

        if (results.length >= limit) break;
      }
    }

    cache.set(cacheKey, results, 5 * 60); // Cache for 5 minutes
    return results;
  } catch (error) {
    console.error('[CMC] Error searching cryptos:', error.message);
    return [];
  }
}

/**
 * Get global market metrics
 * @param {string} convert - Target currency (default: USD)
 * @returns {Object|null} Global metrics or null
 */
async function getGlobalMetrics(convert = 'USD') {
  const cacheKey = `cmc:global:${convert}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await client.get('/v1/global-metrics/quotes/latest', {
      params: { convert }
    });

    if (data.data) {
      const metrics = {
        active_cryptocurrencies: data.data.active_cryptocurrencies,
        total_cryptocurrencies: data.data.total_cryptocurrencies,
        active_exchanges: data.data.active_exchanges,
        total_market_cap: data.data.quote[convert].total_market_cap,
        total_volume_24h: data.data.quote[convert].total_volume_24h,
        btc_dominance: data.data.btc_dominance,
        eth_dominance: data.data.eth_dominance,
        last_updated: data.data.last_updated
      };

      cache.set(cacheKey, metrics, 5 * 60); // Cache for 5 minutes
      return metrics;
    }

    return null;
  } catch (error) {
    console.error('[CMC] Error fetching global metrics:', error.message);
    return null;
  }
}

/**
 * Check if CMC API is configured properly
 */
function isConfigured() {
  return CMC_API_KEY && CMC_API_KEY !== 'DEMO_KEY';
}

/**
 * Get API credit usage info
 */
async function getApiInfo() {
  try {
    const { data } = await client.get('/v1/key/info');
    return data.data;
  } catch (error) {
    console.error('[CMC] Error fetching API info:', error.message);
    return null;
  }
}

/**
 * Get detailed cryptocurrency info (metadata, description, links, etc.)
 * @param {string} symbol - Cryptocurrency symbol
 * @returns {Object|null} Detailed crypto info or null
 */
async function getCryptoInfo(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;

  const cacheKey = `cmc:info:${normalized}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // First get the CMC ID from the map
    const cryptoMap = await getCryptoMap();
    const cryptoData = cryptoMap.get(normalized);
    
    if (!cryptoData) {
      console.log(`[CMC] Symbol ${normalized} not found in crypto map`);
      return null;
    }

    // Fetch detailed info using CMC ID
    const { data } = await client.get('/v2/cryptocurrency/info', {
      params: {
        id: cryptoData.id
      }
    });

    if (data.data && data.data[cryptoData.id]) {
      const info = data.data[cryptoData.id];
      
      const result = {
        id: info.id,
        name: info.name,
        symbol: info.symbol,
        slug: info.slug,
        description: info.description,
        logo: info.logo,
        website: info.urls?.website?.[0] || null,
        technical_doc: info.urls?.technical_doc?.[0] || null,
        twitter: info.urls?.twitter?.[0] || null,
        reddit: info.urls?.reddit?.[0] || null,
        message_board: info.urls?.message_board?.[0] || null,
        chat: info.urls?.chat?.[0] || null,
        source_code: info.urls?.source_code?.[0] || null,
        explorer: info.urls?.explorer?.[0] || null,
        date_added: info.date_added,
        date_launched: info.date_launched,
        tags: info.tags || [],
        category: info.category,
        notice: info.notice
      };

      cache.set(cacheKey, result, 60 * 60); // Cache for 1 hour
      return result;
    }

    return null;
  } catch (error) {
    console.error('[CMC] Error fetching crypto info:', error.message);
    if (error.response) {
      console.error('[CMC] Response status:', error.response.status);
    }
    return null;
  }
}

module.exports = {
  getLatestQuotes,
  getLatestQuote,
  searchCryptos,
  getGlobalMetrics,
  getCryptoMap,
  getCryptoInfo,
  getApiInfo,
  isConfigured,
  normalizeSymbol
};
