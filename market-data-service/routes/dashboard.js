const router = require('express').Router();
// Simple CoinMarketCap-only controller
const ctrl = require('../controllers/marketController');

router.get('/summary', ctrl.getDashboardSummary);

module.exports = router;
