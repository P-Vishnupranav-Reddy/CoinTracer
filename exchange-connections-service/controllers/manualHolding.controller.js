const ManualHolding = require('../models/manualHolding.model');
const PortfolioService = require('../services/portfolio.service');

/**
 * Get all manual holdings for a portfolio with live prices
 */
async function getManualHoldings(req, res) {
  try {
    const { portfolioId } = req.params;
    console.log('[Manual Holdings] GET request for portfolio:', portfolioId);

    if (!portfolioId) {
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }

    const holdings = await ManualHolding.getByPortfolioId(portfolioId);
    console.log(`[Manual Holdings] Found ${holdings.length} holdings`);

    // Fetch live prices for all assets
    if (holdings.length > 0) {
      const assetSymbols = holdings.map(h => h.asset_symbol);
      console.log('[Manual Holdings] Fetching prices for:', assetSymbols);
      const currentPrices = await PortfolioService.fetchLivePrices(assetSymbols, 'usd');

      // Add current prices to holdings
      holdings.forEach(h => {
        const priceData = currentPrices[h.asset_symbol.toUpperCase()];
        h.current_price = priceData?.price || priceData || null;
        console.log(`[Manual Holdings] ${h.asset_symbol}: quantity=${h.quantity}, avgCost=${h.average_cost}, currentPrice=${h.current_price}`);
      });
    }

    console.log('[Manual Holdings] Returning response:', JSON.stringify({ success: true, holdings }, null, 2));
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

    console.log('[Manual Holdings] UPSERT request:', { portfolioId, assetSymbol, quantity, averageCost, notes });

    if (!portfolioId || !assetSymbol || quantity === undefined) {
      console.log('[Manual Holdings] Validation failed: missing required fields');
      return res.status(400).json({
        error: 'Portfolio ID, asset symbol, and quantity are required'
      });
    }

    if (quantity < 0) {
      console.log('[Manual Holdings] Validation failed: negative quantity');
      return res.status(400).json({
        error: 'Quantity must be non-negative'
      });
    }

    // If no average cost provided, fetch current price and use it as cost basis
    let finalAverageCost = averageCost;
    if (!finalAverageCost || finalAverageCost === 0) {
      console.log('[Manual Holdings] No average cost provided, fetching current price for:', assetSymbol);
      try {
        const currentPrices = await PortfolioService.fetchLivePrices([assetSymbol], 'usd');
        const priceData = currentPrices[assetSymbol.toUpperCase()];
        const currentPrice = priceData?.price || priceData;

        if (currentPrice && currentPrice > 0) {
          finalAverageCost = currentPrice;
          console.log(`[Manual Holdings] Using current price as cost basis: $${currentPrice}`);
        } else {
          console.log('[Manual Holdings] Could not fetch current price, using null');
          finalAverageCost = null;
        }
      } catch (priceError) {
        console.warn('[Manual Holdings] Failed to fetch current price:', priceError.message);
        finalAverageCost = null;
      }
    }

    const holding = await ManualHolding.upsert(
      portfolioId,
      assetSymbol,
      quantity,
      finalAverageCost,
      notes
    );

    console.log('[Manual Holdings] Upsert successful:', holding);

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
