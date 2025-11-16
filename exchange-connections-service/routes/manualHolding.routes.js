const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../../shared/authMiddleware');
const {
  getManualHoldings,
  upsertManualHolding,
  deleteManualHolding
} = require('../controllers/manualHolding.controller');

// All routes require authentication
router.use(authMiddleware);

// Get all manual holdings for a portfolio
router.get('/:portfolioId', getManualHoldings);

// Add or update a manual holding
router.post('/:portfolioId', upsertManualHolding);

// Delete a manual holding
router.delete('/:portfolioId/:assetSymbol', deleteManualHolding);

module.exports = router;
