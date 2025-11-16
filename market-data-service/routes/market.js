const router = require('express').Router();
// Simple CoinMarketCap-only controller
const ctrl = require('../controllers/marketController');

router.get('/prices/batch', ctrl.getPricesBatch);
router.get('/prices/:assetId', ctrl.getPrice);
router.get('/assets/search', ctrl.searchAssets);
router.get('/assets/:symbol/details', ctrl.getAssetDetails);
router.get('/assets/:symbol/chart', ctrl.getAssetChart);
router.get('/status', ctrl.getStatus);

module.exports = router;
