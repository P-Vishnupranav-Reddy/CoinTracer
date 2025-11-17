require('dotenv').config();

const express = require('express');
const axios = require('axios');
const {
  authMiddleware,
  corsMiddleware,
  errorHandler,
  notFoundHandler,
  createLogger,
  healthCheck
} = require('../shared');
const { query } = require('../shared/database');

const logger = createLogger('Personalization-Service');
const app = express();

const MARKET_DATA_SERVICE_URL = (process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:5001').replace(/\/$/, '');
const MARKET_DATA_TIMEOUT_MS = Number(process.env.MARKET_DATA_TIMEOUT_MS || 8000);
const DEFAULT_VS = (process.env.MARKET_DATA_DEFAULT_VS || 'USD').toUpperCase();
const MAX_FAVORITES_PER_REQUEST = Number(process.env.MAX_FAVORITES_BATCH || 50);

app.use(corsMiddleware);
app.use(express.json());

app.get('/health', healthCheck('Personalization Service', '1.0.0'));

const normalizeAssetId = (assetId = '') => String(assetId || '').trim().toUpperCase();

async function fetchMarketSnapshots(assetIds = [], vs = DEFAULT_VS) {
  const symbols = [...new Set(assetIds.map(normalizeAssetId).filter(Boolean))];
  if (!symbols.length) {
    return {};
  }

  const limited = symbols.slice(0, MAX_FAVORITES_PER_REQUEST);

  try {
    const params = new URLSearchParams({
      assets: limited.join(','),
      vs
    });
    const url = `${MARKET_DATA_SERVICE_URL}/api/v1/market/prices/batch?${params.toString()}`;
    const { data } = await axios.get(url, { timeout: MARKET_DATA_TIMEOUT_MS });
    const responseVs = (data?.vs || vs).toUpperCase();
    const snapshots = {};

    (data?.data || []).forEach(entry => {
      const key = normalizeAssetId(entry.symbol || entry.assetId);
      if (!key) return;
      snapshots[key] = {
        assetId: key,
        symbol: entry.symbol || key,
        name: entry.name || entry.assetId || key,
        price: entry.price != null ? Number(entry.price) : null,
        priceChange24h: Number(entry.change24h ?? entry.percentChange24h ?? 0),
        marketCap: entry.marketCap ?? null,
        volume24h: entry.volume24h ?? null,
        lastUpdated: entry.lastUpdated || null,
        vs: responseVs
      };
    });

    return snapshots;
  } catch (error) {
    logger.error('Failed to fetch market data for favorites', {
      assetCount: symbols.length,
      error: error.message
    });
    return {};
  }
}

app.get('/api/v1/favorites', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const vs = (req.query.vs || DEFAULT_VS).toUpperCase();

  try {
    const sql = 'SELECT asset_id FROM "favorites" WHERE "user_id" = $1 ORDER BY created_at DESC NULLS LAST';
    const { rows } = await query(sql, [userId]);
    const assetIds = rows.map(row => normalizeAssetId(row.asset_id));

    if (!assetIds.length) {
      return res.status(200).json({ count: 0, favorites: [], vs });
    }

    const marketData = await fetchMarketSnapshots(assetIds, vs);

    const favorites = assetIds.map(assetId => {
      const snapshot = marketData[assetId];
      return {
        assetId,
        symbol: snapshot?.symbol || assetId,
        name: snapshot?.name || assetId,
        price: snapshot?.price ?? null,
        priceChange24h: snapshot?.priceChange24h ?? 0,
        marketCap: snapshot?.marketCap ?? null,
        volume24h: snapshot?.volume24h ?? null,
        lastUpdated: snapshot?.lastUpdated || null,
        vs: snapshot?.vs || vs
      };
    });

    logger.info('Fetched favorites', { userId, count: favorites.length });
    res.status(200).json({ count: favorites.length, vs, favorites });
  } catch (err) {
    logger.error('Error fetching favorites', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/favorites', authMiddleware, async (req, res) => {
  const { assetId } = req.body;
  const userId = req.userId;
  const normalizedAssetId = normalizeAssetId(assetId);

  if (!normalizedAssetId) {
    return res.status(400).json({ error: 'assetId is required' });
  }

  try {
    const sql = `
            INSERT INTO "favorites" ("user_id", "asset_id") 
            VALUES ($1, $2)
            ON CONFLICT ("user_id", "asset_id") DO NOTHING
            RETURNING *
        `;
    const { rows } = await query(sql, [userId, normalizedAssetId]);

    if (rows.length > 0) {
      logger.info('Added favorite', { userId, assetId: normalizedAssetId });
      res.status(201).json(rows[0]);
    } else {
      logger.warn('Duplicate favorite attempt', { userId, assetId: normalizedAssetId });
      res.status(409).json({ error: 'This asset is already in your favorites.' });
    }
  } catch (err) {
    logger.error('Error adding favorite', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/v1/favorites/:assetId', authMiddleware, async (req, res) => {
  const { assetId } = req.params;
  const userId = req.userId;
  const normalizedAssetId = normalizeAssetId(assetId);

  try {
    const sql = 'DELETE FROM "favorites" WHERE "user_id" = $1 AND "asset_id" = $2 RETURNING *';
    const { rows } = await query(sql, [userId, normalizedAssetId]);

    if (rows.length > 0) {
      logger.info('Removed favorite', { userId, assetId: normalizedAssetId });
      res.status(200).json({ message: 'Favorite removed successfully' });
    } else {
      logger.warn('Favorite not found for deletion', { userId, assetId: normalizedAssetId });
      res.status(404).json({ error: 'Favorite not found' });
    }
  } catch (err) {
    logger.error('Error deleting favorite', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app, logger };
