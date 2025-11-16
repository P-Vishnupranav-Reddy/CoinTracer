const axios = require('axios');
const NodeCache = require('node-cache');

const baseURL = process.env.BINANCE_API_BASE || 'https://api.binance.com';
const ttl = Number(process.env.CACHE_TTL_SECONDS || 30);
const cache = new NodeCache({ stdTTL: ttl, checkperiod: ttl });

const client = axios.create({ baseURL, timeout: 10_000 });

// NOTE: Binance is now used as a FALLBACK source when CoinMarketCap doesn't have data
// CoinMarketCap is the PRIMARY source for comprehensive crypto price data

// Prefer quotes in this order for vs=usd
function pickQuotesForVs(vs = 'usd') {
  const v = String(vs).toLowerCase();
  if (v === 'usd') return ['USDT', 'USD', 'BUSD'];
  return ['USDT'];
}

// Common name→symbol aliases so inputs like "bitcoin" work
const ALIASES = {
  bitcoin: 'BTC',
  btc: 'BTC',
  ethereum: 'ETH',
  eth: 'ETH',
  dogecoin: 'DOGE',
  doge: 'DOGE',
  cardano: 'ADA',
  ada: 'ADA',
  ripple: 'XRP',
  xrp: 'XRP',
  polkadot: 'DOT',
  dot: 'DOT',
  litecoin: 'LTC',
  ltc: 'LTC',
  solana: 'SOL',
  sol: 'SOL',
  polygon: 'MATIC',
  matic: 'MATIC',
  bnb: 'BNB',
  binancecoin: 'BNB'
};

// Cache exchange info for 12 hours
async function getExchangeInfo() {
  const key = 'exchangeInfo';
  const cached = cache.get(key);
  if (cached) return cached;
  const { data } = await client.get('/api/v3/exchangeInfo');
  cache.set(key, data, 12 * 60 * 60);
  return data;
}

// Resolve input assets (symbols or common names) to Binance trading symbols with desired quote
// Returns array of { symbol, baseAsset, quoteAsset } or null when not found
async function resolveSymbols(assets, vs = 'usd') {
  const info = await getExchangeInfo();
  const quotes = pickQuotesForVs(vs);
  const preferredOrder = new Map(quotes.map((q, i) => [q, i])); // lower index = higher priority

  // Index symbols by base asset with best quote by priority
  const bestByBase = new Map();
  for (const s of info.symbols || []) {
    if (s.status !== 'TRADING') continue;
    if (!preferredOrder.has(s.quoteAsset)) continue;
    const base = s.baseAsset.toUpperCase();
    const curr = bestByBase.get(base);
    const rank = preferredOrder.get(s.quoteAsset);
    if (!curr || rank < preferredOrder.get(curr.quoteAsset)) {
      bestByBase.set(base, { symbol: s.symbol, baseAsset: s.baseAsset, quoteAsset: s.quoteAsset });
    }
  }

  const out = [];
  for (const a of assets) {
    if (!a) { out.push(null); continue; }
    const key = String(a).toLowerCase();
    const base = (ALIASES[key] || key).toUpperCase();
    out.push(bestByBase.get(base) || null);
  }
  return out;
}

async function getTicker24(symbol) {
  const { data } = await client.get('/api/v3/ticker/24hr', { params: { symbol } });
  return data;
}

async function getTickers24(symbols) {
  const results = await Promise.all(
    symbols.map(async (sym) => {
      if (!sym) return [sym, null];
      const cacheKey = `ticker24:${sym}`;
      const cached = cache.get(cacheKey);
      if (cached) return [sym, cached];
      const data = await getTicker24(sym);
      cache.set(cacheKey, data);
      return [sym, data];
    })
  );
  const map = {};
  for (const [sym, data] of results) map[sym] = data;
  return map;
}

/**
 * Get historical OHLCV candlestick data for charting
 * @param {string} symbol - Trading symbol (e.g., 'BTCUSDT')
 * @param {string} interval - Kline interval (1m, 5m, 15m, 1h, 4h, 1d, 1w, 1M)
 * @param {number} limit - Number of candles to return (default 100, max 1000)
 * @param {number} startTime - Start time in ms (optional)
 * @param {number} endTime - End time in ms (optional)
 * @returns {Array} Array of OHLCV candles
 */
async function getKlines(symbol, interval = '1d', limit = 100, startTime = null, endTime = null) {
  const cacheKey = `klines:${symbol}:${interval}:${limit}:${startTime}:${endTime}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const params = { symbol, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;

    const { data } = await client.get('/api/v3/klines', { params });

    // Transform Binance kline format to OHLCV objects
    const candles = data.map(k => ({
      time: k[0], // Open time (ms)
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
      quoteVolume: parseFloat(k[7]),
      trades: k[8]
    }));

    cache.set(cacheKey, candles, 60); // Cache for 1 minute
    return candles;
  } catch (error) {
    console.error(`[Binance] Error fetching klines for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Get historical chart data for an asset symbol
 * Automatically resolves symbol to trading pair (e.g., ETH → ETHUSDT)
 * @param {string} assetSymbol - Asset symbol (e.g., 'BTC', 'ETH')
 * @param {string} interval - Chart interval ('1d', '1w', '1M')
 * @param {number} limit - Number of data points
 * @returns {Array|null} OHLCV candles or null if not available
 */
async function getAssetChartData(assetSymbol, interval = '1d', limit = 100) {
  try {
    // Resolve asset symbol to Binance trading pair
    const resolved = await resolveSymbols([assetSymbol], 'usd');
    const tradingPair = resolved[0];

    if (!tradingPair) {
      console.log(`[Binance] No trading pair found for ${assetSymbol}`);
      return null;
    }

    console.log(`[Binance] Fetching chart data for ${assetSymbol} via ${tradingPair.symbol}`);
    return await getKlines(tradingPair.symbol, interval, limit);
  } catch (error) {
    console.error(`[Binance] Error in getAssetChartData for ${assetSymbol}:`, error.message);
    return null;
  }
}

module.exports = {
  resolveSymbols,
  getTicker24,
  getTickers24,
  getKlines,
  getAssetChartData,
  pickQuotesForVs,
  getExchangeInfo
};
