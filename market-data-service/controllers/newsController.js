const newsService = require('../services/news');

/**
 * GET /api/v1/news
 * Get aggregated crypto news from multiple sources
 * Query params:
 *   - limit: Number of articles (default: 50)
 *   - category: Filter by category (optional)
 *   - source: Filter by source (optional)
 */
exports.getNews = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const category = req.query.category || null;
    const source = req.query.source || null;

    console.log(`[News] Fetching news: limit=${limit}, category=${category}, source=${source}`);

    const articles = await newsService.getAggregatedNews({
      limit: Math.min(limit, 100), // Cap at 100
      category,
      source
    });

    res.json({
      count: articles.length,
      articles,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[News] Error in getNews:', err.message);
    next(err);
  }
};

/**
 * GET /api/v1/news/asset/:symbol
 * Get news articles related to a specific cryptocurrency
 * Query params:
 *   - limit: Number of articles (default: 20)
 */
exports.getNewsForAsset = async (req, res, next) => {
  try {
    const symbol = req.params.symbol;
    const limit = parseInt(req.query.limit) || 20;

    if (!symbol) {
      return res.status(400).json({
        message: 'Cryptocurrency symbol is required',
        symbol: null
      });
    }

    console.log(`[News] Fetching news for ${symbol}: limit=${limit}`);

    const articles = await newsService.getNewsForAsset(symbol, Math.min(limit, 50));

    res.json({
      symbol: symbol.toUpperCase(),
      count: articles.length,
      articles,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[News] Error in getNewsForAsset for ${req.params.symbol}:`, err.message);
    next(err);
  }
};

/**
 * GET /api/v1/news/sources
 * Get list of available news sources
 */
exports.getSources = async (req, res, next) => {
  try {
    const sources = [
      {
        name: 'CoinMarketCap',
        type: 'API',
        category: 'general',
        available: process.env.CMC_API_KEY && process.env.CMC_API_KEY !== 'DEMO_KEY'
      },
      {
        name: 'CoinDesk',
        type: 'RSS',
        category: 'general',
        available: true
      },
      {
        name: 'Cointelegraph',
        type: 'RSS',
        category: 'general',
        available: true
      },
      {
        name: 'Bitcoin Magazine',
        type: 'RSS',
        category: 'bitcoin',
        available: true
      }
    ];

    res.json({
      count: sources.length,
      sources,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[News] Error in getSources:', err.message);
    next(err);
  }
};
