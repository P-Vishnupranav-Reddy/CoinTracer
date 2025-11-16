require('dotenv').config();

const express = require('express');
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
const port = 3004;

// Middleware
app.use(corsMiddleware);
app.use(express.json());

// ======================
// Health Check
// ======================
app.get('/health', healthCheck('Personalization Service', '1.0.0'));

// ======================
// Mock Market Data
// ======================
// TODO: Replace with actual market data service call
const mockMarketData = {
  BTC: { name: 'Bitcoin', price: 69500.00, priceChange24h: 2.5 },
  ETH: { name: 'Ethereum', price: 3400.00, priceChange24h: 1.2 },
  SOL: { name: 'Solana', price: 150.00, priceChange24h: 5.1 },
  ADA: { name: 'Cardano', price: 0.45, priceChange24h: -1.0 }
};

// ======================
// API Routes
// ======================

app.get('/api/v1/favorites', authMiddleware, async (req, res) => {
  const userId = req.userId;

  try {
    const sql = 'SELECT asset_id FROM "favorites" WHERE "user_id" = $1';
    const { rows } = await query(sql, [userId]);

    const detailedFavorites = rows.map(fav => {
      const marketData = mockMarketData[fav.asset_id];

      if (marketData) {
        return {
          assetId: fav.asset_id,
          ...marketData
        };
      }
      return null;
    }).filter(fav => fav !== null);

    logger.info('Fetched favorites', { userId, count: detailedFavorites.length });
    res.status(200).json({ favorites: detailedFavorites });
  } catch (err) {
    logger.error('Error fetching favorites', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/favorites', authMiddleware, async (req, res) => {
  const { assetId } = req.body;
  const userId = req.userId;

  if (!assetId) {
    return res.status(400).json({ error: 'assetId is required' });
  }

  try {
    const sql = `
            INSERT INTO "favorites" ("user_id", "asset_id") 
            VALUES ($1, $2)
            ON CONFLICT ("user_id", "asset_id") DO NOTHING
            RETURNING *
        `;
    const { rows } = await query(sql, [userId, assetId.toUpperCase()]);

    if (rows.length > 0) {
      logger.info('Added favorite', { userId, assetId });
      res.status(201).json(rows[0]);
    } else {
      logger.warn('Duplicate favorite attempt', { userId, assetId });
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

  try {
    const sql = 'DELETE FROM "favorites" WHERE "user_id" = $1 AND "asset_id" = $2 RETURNING *';
    const { rows } = await query(sql, [userId, assetId.toUpperCase()]);

    if (rows.length > 0) {
      logger.info('Removed favorite', { userId, assetId });
      res.status(200).json({ message: 'Favorite removed successfully' });
    } else {
      logger.warn('Favorite not found for deletion', { userId, assetId });
      res.status(404).json({ error: 'Favorite not found' });
    }
  } catch (err) {
    logger.error('Error deleting favorite', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================
// Error Handlers
// ======================
app.use(notFoundHandler);
app.use(errorHandler);

// ======================
// Start Server
// ======================
const server = app.listen(port, () => {
  logger.info('Personalization Service started', { port, url: `http://localhost:${port}` });
});

// ======================
// Graceful Shutdown
// ======================
const shutdown = () => {
  logger.info('Shutdown signal received, closing gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
