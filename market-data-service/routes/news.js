const router = require('express').Router();
const newsController = require('../controllers/newsController');

router.get('/', newsController.getNews);
router.get('/asset/:symbol', newsController.getNewsForAsset);
router.get('/sources', newsController.getSources);

module.exports = router;
