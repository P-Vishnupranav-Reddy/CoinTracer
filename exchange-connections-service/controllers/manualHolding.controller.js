const ManualHolding = require('../models/manualHolding.model');
const PortfolioService = require('../services/portfolio.service');

/**
 * Get all manual holdings for a portfolio with live prices
 */
async function getManualHoldings(req, res) {
  try {
    const { portfolioId } = req.params;

    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }

    const holdings = await ManualHolding.getByPortfolioId(portfolioId);

    // Fetch live prices for all assets
    if (holdings.length > 0) {
      const assetSymbols = holdings.map(h => h.asset_symbol);
      const currentPrices = await PortfolioService.fetchLivePrices(assetSymbols, 'usd');

      // Add current prices to holdings
      holdings.forEach(h => {
        h.current_price = currentPrices[h.asset_symbol.toUpperCase()] || null;
      });
    }

    res.json({
      success: true,
      holdings
    });
  } catch (error) {
    console.error('[Manual Holdings] Get error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Add or update a manual holding
 */
async function upsertManualHolding(req, res) {
  try {
    const { portfolioId } = req.params;
    const { assetSymbol, quantity, averageCost, notes } = req.body;

    if (!portfolioId || !assetSymbol || quantity === undefined) {
      return res.status(400).json({
        error: 'Portfolio ID, asset symbol, and quantity are required'
      });
    }

    if (quantity < 0) {
      return res.status(400).json({
        error: 'Quantity must be non-negative'
      });
    }

    const holding = await ManualHolding.upsert(
      portfolioId,
      assetSymbol,
      quantity,
      averageCost,
      notes
    );

    res.json({
      success: true,
      holding
    });
  } catch (error) {
    console.error('[Manual Holdings] Upsert error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete a manual holding
 */
async function deleteManualHolding(req, res) {
  try {
    const { portfolioId, assetSymbol } = req.params;

    if (!portfolioId || !assetSymbol) {
      return res.status(400).json({
        error: 'Portfolio ID and asset symbol are required'
      });
    }

    const deleted = await ManualHolding.delete(portfolioId, assetSymbol);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Manual holding not found'
      });
    }

    res.json({
      success: true,
      message: 'Manual holding deleted successfully'
    });
  } catch (error) {
    console.error('[Manual Holdings] Delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  getManualHoldings,
  upsertManualHolding,
  deleteManualHolding
};
