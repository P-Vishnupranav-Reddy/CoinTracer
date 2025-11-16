const express = require('express');
const router = express.Router();
const PortfolioController = require('../controllers/portfolio.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// ===============================
// Portfolio CRUD Routes
// ===============================
router.post('/', authMiddleware, PortfolioController.createPortfolio);
router.get('/', authMiddleware, PortfolioController.getPortfolios);
router.get('/:portfolioId', authMiddleware, PortfolioController.getPortfolio);
router.put('/:portfolioId', authMiddleware, PortfolioController.updatePortfolio);
router.delete('/:portfolioId', authMiddleware, PortfolioController.deletePortfolio);

// ===============================
// Transaction Routes
// ===============================
router.post('/:portfolioId/transactions', authMiddleware, PortfolioController.addTransaction);
router.get('/:portfolioId/transactions', authMiddleware, PortfolioController.getTransactions);
router.put('/:portfolioId/transactions/:transactionId', authMiddleware, PortfolioController.updateTransaction);
router.delete('/:portfolioId/transactions/:transactionId', authMiddleware, PortfolioController.deleteTransaction);

// ===============================
// Allocation & CSV
// ===============================
router.get('/:portfolioId/allocation', authMiddleware, PortfolioController.getAllocation);
router.get('/:portfolioId/export/csv', authMiddleware, PortfolioController.exportCSV);

// ===============================
// Advanced Routes (Filtering & Analytics)
// ===============================
router.get('/:portfolioId/transactions/filter', authMiddleware, PortfolioController.getTransactionsByType);
router.get('/:portfolioId/conversions', authMiddleware, PortfolioController.getConversionHistory);
router.get('/:portfolioId/spot-trades', authMiddleware, PortfolioController.getSpotTradingHistory);
router.get('/:portfolioId/pnl', authMiddleware, PortfolioController.getPortfolioWithPnL);
router.post('/sync/:connectionId', authMiddleware, PortfolioController.syncPortfolio);

module.exports = router;
