const cmcService = require('../services/coinmarketcap');
const { resolveSymbols, getTickers24, getExchangeInfo } = require('../services/binance');

/**
 * Simple CoinMarketCap-only controller
 * No fallback complexity - just CMC API
 */

function parseAssetsParam(req) {
  const q = req.query.assets || '';
  return q.split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeFromTicker(meta, ticker, vs) {
  if (!meta || !ticker) return null;
  return {
    assetId: meta.baseAsset.toLowerCase(),
    vs,
    price: Number(ticker.lastPrice) || null,
    marketCap: null, // not provided by Binance
    change24h: Number(ticker.priceChangePercent) || null,
    lastUpdated: ticker.closeTime ? new Date(ticker.closeTime).toISOString() : new Date().toISOString()
  };
}

/**
 * Normalize CMC data to API response format
 */
function normalizeCMCData(cmcQuote, vs) {
  if (!cmcQuote) return null;

  return {
    assetId: cmcQuote.slug,
    symbol: cmcQuote.symbol,
    name: cmcQuote.name,
    vs: vs.toUpperCase(),
    price: cmcQuote.price,
    marketCap: cmcQuote.market_cap,
    change24h: cmcQuote.percent_change_24h,
    volume24h: cmcQuote.volume_24h,
    circulatingSupply: cmcQuote.circulating_supply,
    totalSupply: cmcQuote.total_supply,
    maxSupply: cmcQuote.max_supply,
    lastUpdated: cmcQuote.last_updated
  };
}

/**
 * GET /api/v1/market/prices/:assetId
 * Get price for a single asset
 */
exports.getPrice = async (req, res, next) => {
  try {
    const vs = (req.query.vs || 'usd').toUpperCase();
    const asset = req.params.assetId;

    console.log(`[CMC] Fetching price for ${asset} in ${vs}`);

    const cmcQuote = await cmcService.getLatestQuote(asset, vs);

    if (!cmcQuote) {
      return res.status(404).json({
        message: `Asset ${asset} not found`,
        asset,
        vs
      });
    }

    console.log(`[CMC] Found ${asset}: $${cmcQuote.price}`);
    res.json(normalizeCMCData(cmcQuote, vs));
  } catch (err) {
    console.error('[CMC] Error in getPrice:', err.message);
    next(err);
  }
};

/**
 * GET /api/v1/market/prices/batch?assets=BTC,ETH,SOL
 * Get prices for multiple assets
 */
exports.getPricesBatch = async (req, res, next) => {
  try {
    const vs = (req.query.vs || 'usd').toUpperCase();
    const assets = parseAssetsParam(req);

    if (!assets.length) {
      return res.status(400).json({ message: 'Query "assets" is required' });
    }

    console.log(`[CMC] Fetching batch prices for ${assets.length} assets:`, assets);

    const cmcQuotes = await cmcService.getLatestQuotes(assets, vs);
    const results = [];

    for (const asset of assets) {
      const normalized = cmcService.normalizeSymbol(asset);
      if (cmcQuotes[normalized]) {
        results.push(normalizeCMCData(cmcQuotes[normalized], vs));
      } else {
        console.log(`[CMC] Asset not found: ${asset}`);
      }
    }

    console.log(`[CMC] Successfully fetched ${results.length}/${assets.length} assets`);

    const response = {
      vs,
      count: results.length,
      requested: assets.length,
      data: results
    };

    res.json(response);
  } catch (err) {
    console.error('[CMC] Error in getPricesBatch:', err.message);
    // Return empty data rather than crashing
    res.json({
      vs: (req.query.vs || 'usd').toUpperCase(),
      count: 0,
      requested: parseAssetsParam(req).length,
      data: [],
      error: err.message
    });
  }
};

/**
 * GET /api/v1/dashboard/summary?assets=BTC,ETH
 * Get dashboard summary with top gainer/loser
 */
exports.getDashboardSummary = async (req, res, next) => {
  try {
    const vs = (req.query.vs || 'usd').toUpperCase();
    const assets = parseAssetsParam(req);

    if (!assets.length) {
      return res.status(400).json({ message: 'Query "assets" is required' });
    }

    console.log(`[CMC] Fetching dashboard for ${assets.length} assets`);

    // Get all prices
    const cmcQuotes = await cmcService.getLatestQuotes(assets, vs);
    const rows = [];

    for (const asset of assets) {
      const normalized = cmcService.normalizeSymbol(asset);
      if (cmcQuotes[normalized]) {
        rows.push(normalizeCMCData(cmcQuotes[normalized], vs));
      }
    }

    // Calculate top gainer and loser
    const topGainer = rows.length > 0
      ? rows.reduce((max, r) => (r.change24h > (max?.change24h || -Infinity) ? r : max), null)
      : null;

    const topLoser = rows.length > 0
      ? rows.reduce((min, r) => (r.change24h < (min?.change24h || Infinity) ? r : min), null)
      : null;

    // Get global metrics
    const globalMetrics = await cmcService.getGlobalMetrics(vs);

    const response = {
      vs,
      totalMarketCap: globalMetrics?.total_market_cap || null,
      totalVolume24h: globalMetrics?.total_volume_24h || null,
      btcDominance: globalMetrics?.btc_dominance || null,
      ethDominance: globalMetrics?.eth_dominance || null,
      topGainer,
      topLoser,
      count: rows.length,
      updatedAt: new Date().toISOString(),
      data: rows
    };

    res.json(response);
  } catch (err) {
    console.error('[CMC] Error in getDashboardSummary:', err.message);
    next(err);
  }
};

/**
 * GET /api/v1/market/assets/search?q=bitcoin
 * Search for assets
 */
exports.searchAssets = async (req, res, next) => {
  try {
    const q = String(req.query.query || req.query.q || '').trim().toLowerCase();

    if (!q || q.length < 2) {
      return res.status(400).json({ message: 'query (min 2 chars) is required' });
    }

    console.log(`[CMC] Searching for: ${q}`);

    const results = await cmcService.searchCryptos(q, 30);

    res.json({
      count: results.length,
      assets: results.map(r => ({
        id: r.slug,
        symbol: r.symbol,
        name: r.name,
        cmcId: r.id
      }))
    });
  } catch (err) {
    console.error('[CMC] Error in searchAssets:', err.message);
    next(err);
  }
};

/**
 * GET /api/v1/market/status
 * Get service status and API usage
 */
exports.getStatus = async (req, res, next) => {
  try {
    const status = {
      service: 'Market Data Service',
      provider: 'CoinMarketCap',
      configured: cmcService.isConfigured(),
      coverage: '10,000+ cryptocurrencies',
      timestamp: new Date().toISOString()
    };

    // Get CMC API info
    if (cmcService.isConfigured()) {
      const apiInfo = await cmcService.getApiInfo();
      if (apiInfo) {
        status.plan = apiInfo.plan;
        status.usage = apiInfo.usage;
      }
    }

    res.json(status);
  } catch (err) {
    console.error('[CMC] Error in getStatus:', err.message);
    next(err);
  }
};

/**
 * GET /api/v1/market/assets/:symbol/details
 * Get comprehensive asset details (metadata + current market data)
 * Works dynamically for any cryptocurrency symbol
 */
exports.getAssetDetails = async (req, res, next) => {
  try {
    const symbol = req.params.symbol?.toUpperCase();
    const vs = (req.query.vs || 'usd').toUpperCase();

    if (!symbol) {
      return res.status(400).json({ message: 'Symbol is required' });
    }

    console.log(`[Market] Fetching details for ${symbol}`);

    // Fetch both metadata and current market data in parallel
    const [metadata, marketData] = await Promise.all([
      cmcService.getCryptoInfo(symbol),
      cmcService.getLatestQuote(symbol, vs)
    ]);

    if (!metadata && !marketData) {
      return res.status(404).json({ 
        message: `Asset ${symbol} not found`,
        symbol 
      });
    }

    // Combine metadata and market data
    const response = {
      symbol: symbol,
      name: metadata?.name || marketData?.name || symbol,
      slug: metadata?.slug || marketData?.slug || symbol.toLowerCase(),
      
      // Metadata
      description: metadata?.description || null,
      logo: metadata?.logo || null,
      dateAdded: metadata?.date_added || null,
      dateLaunched: metadata?.date_launched || null,
      tags: metadata?.tags || [],
      category: metadata?.category || null,
      
      // Links
      links: {
        website: metadata?.website || null,
        whitepaper: metadata?.technical_doc || null,
        twitter: metadata?.twitter || null,
        reddit: metadata?.reddit || null,
        messageBoard: metadata?.message_board || null,
        chat: metadata?.chat || null,
        sourceCode: metadata?.source_code || null,
        explorer: metadata?.explorer || null
      },
      
      // Market Data
      market: marketData ? {
        price: marketData.price,
        marketCap: marketData.market_cap,
        marketCapRank: null, // Would need listings endpoint for rank
        volume24h: marketData.volume_24h,
        volumeChange24h: marketData.volume_change_24h,
        percentChange1h: marketData.percent_change_1h,
        percentChange24h: marketData.percent_change_24h,
        percentChange7d: marketData.percent_change_7d,
        circulatingSupply: marketData.circulating_supply,
        totalSupply: marketData.total_supply,
        maxSupply: marketData.max_supply,
        fullyDilutedValuation: marketData.max_supply ? marketData.price * marketData.max_supply : null,
        marketCapDominance: marketData.market_cap_dominance,
        lastUpdated: marketData.last_updated
      } : null,
      
      vs: vs
    };

    res.json(response);
  } catch (err) {
    console.error('[Market] Error in getAssetDetails:', err.message);
    next(err);
  }
};

/**
 * GET /api/v1/market/assets/:symbol/chart
 * Get historical chart data for any asset
 * Query params: interval (1d, 1w, 1M), limit (default 100)
 */
exports.getAssetChart = async (req, res, next) => {
  try {
    const symbol = req.params.symbol?.toUpperCase();
    const interval = req.query.interval || '1d';
    const limit = parseInt(req.query.limit) || 100;

    if (!symbol) {
      return res.status(400).json({ message: 'Symbol is required' });
    }

    // Validate interval
    const validIntervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({ 
        message: 'Invalid interval', 
        validIntervals 
      });
    }

    console.log(`[Market] Fetching chart for ${symbol}, interval: ${interval}, limit: ${limit}`);

    const binanceService = require('../services/binance');
    const chartData = await binanceService.getAssetChartData(symbol, interval, Math.min(limit, 1000));

    if (!chartData) {
      return res.status(404).json({ 
        message: `Chart data not available for ${symbol}`,
        note: 'Asset may not be listed on Binance',
        symbol 
      });
    }

    res.json({
      symbol,
      interval,
      count: chartData.length,
      data: chartData
    });
  } catch (err) {
    console.error('[Market] Error in getAssetChart:', err.message);
    next(err);
  }
};
