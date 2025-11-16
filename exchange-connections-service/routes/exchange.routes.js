const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const ExchangeController = require('../controllers/exchange.controller');

// Apply auth middleware
router.use(authMiddleware);

// === Exchange routes ===
router.get('/supported-exchanges', ExchangeController.getSupportedExchanges);
router.get('/connections', ExchangeController.getConnections);
router.post('/connections', ExchangeController.connectExchange); // matches your method name
router.delete('/connections/:connectionId', ExchangeController.disconnectExchange);
router.post('/connections/:connectionId/sync', ExchangeController.syncExchange);
router.get('/connections/:connectionId/status', ExchangeController.getSyncStatus);
router.get('/connections/:connectionId/balances', ExchangeController.getBalances);

// === Price calculation routes ===
router.get('/connections/:connectionId/average-prices', ExchangeController.getAveragePrices);
router.get('/connections/:connectionId/breakeven-prices', ExchangeController.getBreakevenPrices);

module.exports = router;
