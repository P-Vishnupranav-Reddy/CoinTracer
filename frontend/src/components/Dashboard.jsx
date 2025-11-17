import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { exchangeApi } from '../services/api_exchange';
import { manualHoldingAPI } from '../services/api_manual';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, Label } from 'recharts';
import { formatNumber } from '../utils/number';

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

function buildCombinedHoldings({
  balances = [],
  manualHoldings = [],
  fallbackHoldings = [],
  useFallbackWhenEmpty = false
} = {}) {
  const holdingsMap = new Map();

  const ensureEntry = (symbol, defaults = {}) => {
    if (!holdingsMap.has(symbol)) {
      holdingsMap.set(symbol, {
        asset: symbol,
        assetName: defaults.assetName || symbol,
        source: defaults.source || 'exchange',
        quantity: 0,
        averageCost: defaults.averageCost ?? null,
        currentPrice: defaults.currentPrice ?? null,
        change24h: defaults.change24h ?? 0
      });
    }
    return holdingsMap.get(symbol);
  };

  (balances || []).forEach((balance) => {
    const symbol = normalizeSymbol(balance?.asset || balance?.symbol);
    if (!symbol) return;

    const entry = ensureEntry(symbol, {
      assetName: balance?.assetName || symbol,
      source: 'exchange'
    });

    entry.quantity += Number(balance?.total ?? balance?.quantity ?? 0) || 0;

    if (balance?.averageCost != null && Number(balance.averageCost) > 0) {
      entry.averageCost = Number(balance.averageCost);
    }

    if (balance?.currentPrice != null && Number(balance.currentPrice) > 0) {
      entry.currentPrice = Number(balance.currentPrice);
    }

    if (balance?.change24h != null) {
      entry.change24h = Number(balance.change24h);
    }
  });

  (manualHoldings || []).forEach((holding) => {
    const symbol = normalizeSymbol(holding?.asset_symbol || holding?.asset);
    if (!symbol) return;

    const entry =
      holdingsMap.get(symbol) ||
      ensureEntry(symbol, {
        assetName: holding?.asset_name || symbol,
        source: 'manual'
      });

    const qty = Number(holding?.quantity) || 0;
    const existingQty = entry.quantity || 0;
    const totalQty = existingQty + qty;
    const existingCost = entry.averageCost || 0;
    const manualCostRaw = holding?.average_cost ?? holding?.averageCost;
    const manualCost = manualCostRaw != null ? Number(manualCostRaw) : null;

    let weightedAvgCost = entry.averageCost;
    if (manualCost != null && manualCost > 0) {
      const investedExisting = existingQty * existingCost;
      const investedManual = qty * manualCost;
      weightedAvgCost =
        totalQty > 0 ? (investedExisting + investedManual) / totalQty : existingCost;
    }

    entry.quantity = totalQty;
    if (weightedAvgCost && weightedAvgCost > 0) {
      entry.averageCost = weightedAvgCost;
    }

    if (entry.source === 'exchange') {
      entry.source = 'both';
    }

    if (!entry.currentPrice && holding?.current_price != null) {
      entry.currentPrice = Number(holding.current_price);
    }
  });

  let combined = Array.from(holdingsMap.values()).filter((h) => (h.quantity || 0) > 0);

  if (useFallbackWhenEmpty && combined.length === 0 && (fallbackHoldings || []).length > 0) {
    combined = fallbackHoldings
      .map((holding) => {
        const symbol = normalizeSymbol(
          holding?.asset || holding?.asset_symbol || holding?.symbol || holding?.asset_id
        );
        if (!symbol) return null;
        const quantity = Number(
          holding?.total_quantity ?? holding?.quantity ?? holding?.total ?? 0
        );
        if (!quantity) return null;

        const avgCostRaw = holding?.average_cost ?? holding?.averageCost ?? null;
        const valueRaw = holding?.currentValue ?? holding?.current_value ?? null;
        const priceRaw =
          holding?.currentPrice ??
          holding?.current_price ??
          (valueRaw != null && quantity > 0 ? Number(valueRaw) / quantity : null);

        return {
          source: 'portfolio',
          asset: symbol,
          assetName: symbol,
          quantity,
          averageCost: avgCostRaw != null ? Number(avgCostRaw) : null,
          currentPrice: priceRaw != null ? Number(priceRaw) : null,
          change24h: Number(holding?.change24h ?? holding?.change_24h ?? 0)
        };
      })
      .filter(Boolean);
  }

  return combined;
}

export default function Dashboard() {
  const navigate = useNavigate();
  
  const [portfolios, setPortfolios] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [portfolioName, setPortfolioName] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [portfolio, setPortfolio] = useState(null); // { portfolio, holdings, summary }
  const [allocation, setAllocation] = useState(null); // { allocation: [{symbol,value,percentage}], totalValue }
  const [connections, setConnections] = useState([]);
  const [balances, setBalances] = useState(null); // live balances for selected portfolio
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [manualHoldings, setManualHoldings] = useState([]); // manual holdings
  const [addingManual, setAddingManual] = useState(false); // modal state
  const [manualForm, setManualForm] = useState({ assetSymbol: '', quantity: '', averageCost: '', notes: '' });

  // Aggregated summary across *all* portfolios
  const [globalSummary, setGlobalSummary] = useState(null);
  const [globalSummaryLoading, setGlobalSummaryLoading] = useState(false);
  const [globalSummaryError, setGlobalSummaryError] = useState('');

  // Prevent body scroll when modal is open and support Escape to close
  useEffect(() => {
    if (creating || addingManual) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onEsc = (e) => { 
        if (e.key === 'Escape') {
          setCreating(false);
          setAddingManual(false);
        }
      };
      window.addEventListener('keydown', onEsc);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener('keydown', onEsc);
      };
    }
  }, [creating, addingManual]);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          exchangeApi.getPortfolios(),
          exchangeApi.getConnections().catch(() => ({ data: { connections: [] } })),
        ]);
        const list = pRes?.data?.portfolios || [];
        setPortfolios(list);
        setConnections(cRes?.data?.connections || []);
        if (list.length) setSelectedId(list[0].id);
      } catch {
        setError('Failed to load portfolios. Ensure the backend is running.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load aggregated summary across all portfolios by reusing backend portfolio summaries
  useEffect(() => {
    const loadGlobalSummary = async () => {
      if (!portfolios || portfolios.length === 0) {
        setGlobalSummary(null);
        setGlobalSummaryError('');
        setGlobalSummaryLoading(false);
        return;
      }

      setGlobalSummaryLoading(true);
      setGlobalSummaryError('');

      try {
        const portfolioResponses = await Promise.all(
          portfolios.map(async (p) => {
            try {
              const res = await exchangeApi.getPortfolio(p.id);
              return res?.data || null;
            } catch (err) {
              console.warn('Failed to fetch portfolio for aggregation', p.id, err);
              return null;
            }
          })
        );

        const validPortfolios = portfolioResponses.filter(Boolean);
        if (!validPortfolios.length) {
          setGlobalSummary(null);
          return;
        }

        let totalValue = 0;
        let totalInvested = 0;
        let totalPnL = 0;
        let total24hPnL = 0;
        let assetCount = 0;

        validPortfolios.forEach((data) => {
          const summary = data?.summary || {};
          totalValue += Number(summary.totalValue) || 0;
          totalInvested += Number(summary.totalInvested) || 0;
          totalPnL += Number(summary.totalPnL) || 0;
          assetCount +=
            Number(summary.assetCount) ||
            Number(data?.holdings?.length || 0);

          const holdings = data?.holdings || [];

          holdings.forEach((holding) => {
            const qty = Number(
              holding?.total_quantity ??
                holding?.quantity ??
                holding?.total ??
                0
            );
            if (!qty) return;

            const currentPrice = Number(
              holding?.current_price ??
                holding?.currentPrice ??
                holding?.price ??
                0
            );
            const investedRaw =
              holding?.total_invested != null
                ? Number(holding.total_invested)
                : null;
            const avgCost = Number(
              holding?.average_cost ?? holding?.averageCost ?? 0
            );
            const change24h = Number(
              holding?.change24h ?? holding?.change_24h ?? 0
            );

            if (currentPrice > 0 && change24h !== 0) {
              total24hPnL += qty * currentPrice * (change24h / 100);
            }
          });
        });

        const totalPnLPercentage =
          totalInvested > 0
            ? ((totalPnL / totalInvested) * 100).toFixed(2)
            : '0.00';
        const total24hPnLPercentage =
          totalValue - total24hPnL > 0
            ? ((total24hPnL / (totalValue - total24hPnL)) * 100).toFixed(2)
            : '0.00';

        setGlobalSummary({
          totalValue: totalValue.toFixed(2),
          totalInvested: totalInvested.toFixed(2),
          totalPnL: totalPnL.toFixed(2),
          totalPnLPercentage,
          total24hPnL: total24hPnL.toFixed(2),
          total24hPnLPercentage,
          portfolioCount: portfolios.length,
          assetCount
        });
      } catch (e) {
        console.error('Failed to load aggregated portfolio summary', e);
        setGlobalSummary(null);
        setGlobalSummaryError('Failed to load aggregated portfolio summary.');
      } finally {
        setGlobalSummaryLoading(false);
      }
    };

    if (!loading) loadGlobalSummary();
  }, [loading, portfolios]);

  // Load portfolio data + allocation when selection changes
  useEffect(() => {
    if (!selectedId) {
      setPortfolio(null);
      setAllocation(null);
      setBalances(null);
      return;
    }
    (async () => {
      try {
        setRefreshing(true);
        setError(''); // Clear previous errors
        const [pRes, aRes] = await Promise.all([
          exchangeApi.getPortfolio(selectedId).catch(err => {
            console.warn('Portfolio fetch failed:', err);
            return null;
          }),
          exchangeApi.getAllocation(selectedId).catch(err => {
            console.warn('Allocation fetch failed:', err);
            return null;
          }),
        ]);
        setPortfolio(pRes?.data || null);
        setAllocation(aRes?.data || null);
        
        // Show warning if data is partial
        if (!pRes && !aRes) {
          setError('Failed to load portfolio data. Please try refreshing.');
        } else if (!pRes || !aRes) {
          setError('Portfolio data partially loaded. Some information may be unavailable.');
        }
      } catch (err) {
        console.error('Portfolio load error:', err);
        setError('Failed to load portfolio data. Please try refreshing.');
      } finally {
        setRefreshing(false);
      }
    })();
  }, [selectedId]);

  // Load manual holdings for the selected portfolio
  useEffect(() => {
    if (!selectedId) {
      setManualHoldings([]);
      return;
    }
    (async () => {
      try {
        const res = await manualHoldingAPI.getHoldings(selectedId);
        setManualHoldings(res?.holdings || []);
      } catch {
        setManualHoldings([]);
      }
    })();
  }, [selectedId]);

  // Load live balances if there is a connection for this portfolio
  useEffect(() => {
    if (!selectedId) return;
    const conn = (connections || []).find(c => c.portfolio_id === selectedId);
    if (!conn) {
      setBalances(null);
      return;
    }
    (async () => {
      try {
        setBalancesLoading(true);
        const bRes = await exchangeApi.getExchangeBalances(conn.id);
        setBalances(bRes?.data?.balances || []);
      } catch {
        setBalances(null);
      } finally {
        setBalancesLoading(false);
      }
    })();
  }, [selectedId, connections]);

  // Merge manual holdings with exchange balances (fetch current prices for manual holdings)
  const combinedHoldings = useMemo(
    () => buildCombinedHoldings({ balances, manualHoldings }),
    [balances, manualHoldings]
  );

  // Share combined holdings with global search (and other components) via localStorage + event
  useEffect(() => {
    try {
      const assets = combinedHoldings
        .map(h => ({
          symbol: (h.asset || '').toUpperCase(),
          name: h.assetName || h.asset || '',
          source: h.source || 'unknown'
        }))
        .filter(asset => asset.symbol);

      const payload = {
        updatedAt: Date.now(),
        assets
      };

      localStorage.setItem('dashboardAssets', JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('dashboardAssetsUpdated', { detail: assets }));
    } catch (err) {
      console.warn('Failed to sync dashboard assets for global search', err);
    }
  }, [combinedHoldings]);

  // Calculate summary from combined holdings
  const summary = useMemo(() => {
    if (combinedHoldings.length > 0) {
      // Calculate from combined holdings
      let totalValue = 0;
      let totalInvested = 0;
      let total24hPnL = 0;
      
      combinedHoldings.forEach(h => {
        const qty = Number(h.quantity) || 0;
        const price = Number(h.currentPrice) || 0;
        const avgCost = Number(h.averageCost) || null;
        const change24h = Number(h.change24h) || 0;
        
        totalValue += qty * price;
        // Only add to invested if we know the cost (not rewards/airdrops)
        if (avgCost != null && avgCost > 0) {
          totalInvested += qty * avgCost;
        }
        
        // Calculate 24h P&L: quantity * currentPrice * (change24h / 100)
        // This gives the dollar change in value over 24h
        total24hPnL += qty * price * (change24h / 100);
      });
      
      return {
        totalValue: totalValue.toFixed(2),
        totalInvested: totalInvested.toFixed(2),
        totalPnL: (totalValue - totalInvested).toFixed(2),
        pnlPercentage: totalInvested > 0 ? (((totalValue - totalInvested) / totalInvested) * 100).toFixed(2) : '0.00',
        total24hPnL: total24hPnL.toFixed(2),
        total24hPnLPercentage: (totalValue - total24hPnL) > 0 ? ((total24hPnL / (totalValue - total24hPnL)) * 100).toFixed(2) : '0.00',
        assetCount: combinedHoldings.length
      };
    }
    return portfolio?.summary || {};
  }, [portfolio, combinedHoldings]);

  const createPortfolio = async () => {
    const name = portfolioName.trim();
    if (!name) return setError('Portfolio name cannot be empty');
    try {
      setError('');
      const res = await exchangeApi.createPortfolio(name);
      const newP = res?.data?.portfolio;
      if (!newP) {
        setError('Portfolio created but not returned from server.');
        return;
      }
      setSuccess(`Portfolio "${name}" created.`);
      setCreating(false);
      setPortfolioName('');
      const list = (await exchangeApi.getPortfolios())?.data?.portfolios || [];
      setPortfolios(list);
      setSelectedId(newP.id);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to create portfolio');
    }
  };

  const deletePortfolio = async (id) => {
    if (!confirm('Delete this portfolio?')) return;
    try {
      await exchangeApi.deletePortfolio(id);
      const list = (await exchangeApi.getPortfolios())?.data?.portfolios || [];
      setPortfolios(list);
      if (selectedId === id) setSelectedId(list[0]?.id || '');
    } catch {
      setError('Failed to delete portfolio');
    }
  };

  const addManualHolding = async () => {
    const { assetSymbol, quantity } = manualForm;
    if (!assetSymbol || !quantity || quantity <= 0) {
      return setError('Asset symbol and positive quantity are required');
    }
    try {
      setError('');
      const data = {
        assetSymbol: assetSymbol.trim().toUpperCase(),
        quantity: parseFloat(quantity),
        averageCost: manualForm.averageCost ? parseFloat(manualForm.averageCost) : null,
        notes: manualForm.notes || ''
      };
      await manualHoldingAPI.upsertHolding(selectedId, data);
      setSuccess(`Manual holding for ${data.assetSymbol} added`);
      setAddingManual(false);
      setManualForm({ assetSymbol: '', quantity: '', averageCost: '', notes: '' });
      // Refresh manual holdings
      const res = await manualHoldingAPI.getHoldings(selectedId);
      setManualHoldings(res?.holdings || []);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to add manual holding');
    }
  };

  const deleteManualHolding = async (assetSymbol) => {
    if (!confirm(`Delete manual holding for ${assetSymbol}?`)) return;
    try {
      await manualHoldingAPI.deleteHolding(selectedId, assetSymbol);
      setSuccess(`Manual holding for ${assetSymbol} deleted`);
      // Refresh manual holdings
      const res = await manualHoldingAPI.getHoldings(selectedId);
      setManualHoldings(res?.holdings || []);
    } catch {
      setError('Failed to delete manual holding');
    }
  };

  const exportHoldingsToCSV = () => {
    // Use balances if available (live from exchange), otherwise use portfolio holdings
    const holdingsToExport = balances && balances.length > 0 ? balances : portfolio?.holdings;
    
    if (!holdingsToExport || holdingsToExport.length === 0) {
      setError('No holdings to export');
      return;
    }

    // Prepare CSV data
    const headers = ['Asset', 'Quantity', 'Average Cost', 'Current Price', 'Current Value', 'P&L', 'P&L %'];
    const rows = holdingsToExport.map(h => {
      // Handle both balance and holding object structures
      const qty = Number(h.total || h.total_quantity) || 0;
      const avgCost = h.averageCost != null ? Number(h.averageCost) : (h.average_cost != null ? Number(h.average_cost) : null);
      const currentPrice = Number(h.currentPrice || h.current_price) || 0;
      const currentValue = qty * currentPrice;
      
      // Calculate P&L only if average cost is not NULL
      let pnl = null;
      let pnlPercent = null;
      if (avgCost != null && avgCost > 0) {
        const invested = qty * avgCost;
        pnl = currentValue - invested;
        pnlPercent = (pnl / invested) * 100;
      }

      return [
        h.asset || h.asset_symbol || h.symbol || h.asset_id || '',
        qty.toFixed(8),
        avgCost != null ? avgCost.toFixed(6) : 'N/A',
        currentPrice.toFixed(6),
        currentValue.toFixed(2),
        pnl != null ? pnl.toFixed(2) : 'N/A',
        pnlPercent != null ? pnlPercent.toFixed(2) + '%' : 'N/A'
      ];
    });

    // Create CSV content with proper newlines
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `holdings_${portfolio.portfolio?.name || 'export'}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSuccess('Holdings exported successfully');
  };

  const refresh = async () => {
    if (!selectedId) return;
    setRefreshing(true);
    try {
      const [pRes, aRes] = await Promise.all([
        exchangeApi.getPortfolio(selectedId),
        exchangeApi.getAllocation(selectedId),
      ]);
      setPortfolio(pRes?.data || null);
      setAllocation(aRes?.data || null);
    } catch {
      setError('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <main style={{ padding: 22 }}>
        <div className="helper">Loading dashboard…</div>
      </main>
    );
  }

  return (
    <main style={{ padding: 22 }}>
      <div style={{ width: 'min(1400px, 95vw)', margin: '0 auto' }}>
      {error && <div className="toast error" style={{ marginBottom: 10 }}>{error}</div>}
      {success && <div className="toast" style={{ marginBottom: 10 }}>{success}</div>}

      {/* Aggregated Portfolio Summary (All Portfolios) */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Aggregated Portfolio Overview</h3>
            <div className="helper">
              Quick view across all your portfolios
              {globalSummary?.portfolioCount ? ` (${globalSummary.portfolioCount} total)` : ''}
            </div>
          </div>
          {globalSummaryLoading && (
            <div className="helper" style={{ fontSize: 13 }}>Calculating…</div>
          )}
        </div>
        {globalSummaryError && (
          <div className="toast error" style={{ marginBottom: 8 }}>{globalSummaryError}</div>
        )}
        {globalSummary ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <div className="card" style={{ background: 'rgba(15,23,42,0.7)' }}>
              <div className="helper">Total Value (All Portfolios)</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>
                $ {Number(globalSummary.totalValue || 0).toFixed(2)}
              </div>
              <div className="helper">
                {globalSummary.assetCount || 0} aggregated asset position(s)
              </div>
            </div>
            <div className="card" style={{ background: 'rgba(15,23,42,0.7)' }}>
              <div className="helper">Overall Unrealized P&L</div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: Number(globalSummary.totalPnL || 0) >= 0 ? '#4ade80' : '#f87171',
                }}
              >
                {Number(globalSummary.totalPnL || 0) >= 0 ? '+' : ''}$ {Number(globalSummary.totalPnL || 0).toFixed(2)}
              </div>
              <div
                className="helper"
                style={{
                  color: Number(globalSummary.totalPnL || 0) >= 0 ? '#4ade80' : '#f87171',
                }}
              >
                {Number(globalSummary.totalPnLPercentage || 0) >= 0 ? '+' : ''}
                {Number(globalSummary.totalPnLPercentage || 0).toFixed(2)}%
              </div>
            </div>
            <div className="card" style={{ background: 'rgba(15,23,42,0.7)' }}>
              <div className="helper">24h Change (All Portfolios)</div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: Number(globalSummary.total24hPnL || 0) >= 0 ? '#4ade80' : '#f87171',
                }}
              >
                {Number(globalSummary.total24hPnL || 0) >= 0 ? '+' : ''}$ {Number(globalSummary.total24hPnL || 0).toFixed(2)}
              </div>
              <div
                className="helper"
                style={{
                  color: Number(globalSummary.total24hPnL || 0) >= 0 ? '#4ade80' : '#f87171',
                }}
              >
                {Number(globalSummary.total24hPnL || 0) >= 0 ? '+' : ''}
                {Number(globalSummary.total24hPnLPercentage || 0).toFixed(2)}%
              </div>
            </div>
          </div>
        ) : (
          !globalSummaryLoading && (
            <div className="helper">
              No aggregated data yet. Create a portfolio or add holdings to see your overall performance.
            </div>
          )
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Portfolio Dashboard</h3>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={refresh} disabled={!selectedId || refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
            <button className="btn" onClick={() => setCreating(true)}>Create Portfolio</button>
          </div>
        </div>
      </div>

      {/* Portfolio selector */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Your Portfolios</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {portfolios.map(p => (
            <div key={p.id} className="chip" style={{ display: 'flex', alignItems: 'center', gap: 6, border: selectedId===p.id ? '2px solid var(--accent, #6aa3ff)' : '1px solid rgba(255,255,255,0.12)', padding: '6px 8px', borderRadius: 8 }}>
              <button className="link" onClick={() => setSelectedId(p.id)} style={{ fontWeight: selectedId===p.id ? 700 : 500 }}>{p.name}</button>
              <button className="link" title="Delete" onClick={() => deletePortfolio(p.id)}>Delete</button>
            </div>
          ))}
          {portfolios.length === 0 && <div className="helper">No portfolios yet — create one to get started.</div>}
        </div>
      </div>

      {/* Summary row */}
      {portfolio && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div className="card">
            <div className="helper">Total Value</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>$ {Number(summary.totalValue||0).toFixed(2)}</div>
            <div className="helper">{portfolio.holdings?.length||0} asset(s)</div>
          </div>
          <div className="card">
            <div className="helper">24h P&L</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: Number(summary.total24hPnL||0) >= 0 ? '#4ade80' : '#f87171' }}>
              {Number(summary.total24hPnL||0) >= 0 ? '+' : ''}$ {Number(summary.total24hPnL||0).toFixed(2)}
            </div>
            <div className="helper" style={{ color: Number(summary.total24hPnL||0) >= 0 ? '#4ade80' : '#f87171' }}>
              {Number(summary.total24hPnL||0) >= 0 ? '+' : ''}{Number(summary.total24hPnLPercentage||0).toFixed(2)}%
            </div>
          </div>
          <div className="card">
            <div className="helper">Portfolio Status</div>
            <div className="chip" style={{ width: 'fit-content' }}>{Number(summary.totalValue||0) > 0 ? 'Active' : 'Empty'}</div>
          </div>
        </div>
      )}

      {/* Allocation + Holdings */}
      {portfolio && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>Portfolio Allocation {balances?.length ? '(Live by Qty)' : ''}</div>
            </div>
            {/* Donut chart using live data (balances if present, else allocation percentages) */}
            <AllocationDonut balances={balances} allocation={allocation} />
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>
                Holdings 
                {balances?.length ? ' (Live from Exchange)' : ''}
                {manualHoldings.length > 0 ? ` + ${manualHoldings.length} Manual` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!connections.find(c => c.portfolio_id === selectedId) && (
                  <button 
                    className="btn ghost" 
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    onClick={() => setAddingManual(true)}
                  >
                    ➕ Add Manual
                  </button>
                )}
                <button 
                  className="btn ghost" 
                  style={{ padding: '6px 12px', fontSize: 13 }}
                  onClick={exportHoldingsToCSV}
                  disabled={combinedHoldings.length === 0}
                >
                  📊 Export CSV
                </button>
              </div>
            </div>
            {balancesLoading ? (
              <div className="helper">Loading balances…</div>
            ) : combinedHoldings.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Asset</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px' }}>Quantity</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px' }}>Avg Cost</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px' }}>Current Price</th>
                      {manualHoldings.length > 0 && <th style={{ textAlign: 'center', padding: '8px 6px' }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {combinedHoldings.map((h, idx) => {
                      const currentPrice = h.currentPrice;
                      const avgCost = h.averageCost;
                      const change24h = h.change24h || 0;
                      
                      return (
                        <tr key={`${h.asset}-${h.source}`} style={{ borderBottom: idx === combinedHoldings.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
                          <td style={{ padding: '10px 6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                onClick={() => navigate(`/asset/${h.asset}`)}
                                style={{ 
                                  color: 'inherit', 
                                  textDecoration: 'none',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  transition: 'color 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.color = '#6aa3ff'}
                                onMouseLeave={(e) => e.target.style.color = 'inherit'}
                              >
                                {h.asset}
                              </span>
                              {change24h !== 0 && (
                                <span style={{ 
                                  fontSize: 11, 
                                  fontWeight: 600,
                                  color: change24h >= 0 ? '#4ade80' : '#f87171',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  backgroundColor: change24h >= 0 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)'
                                }}>
                                  {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 6px', fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumber(h.quantity||0, { maximumFractionDigits: 8 })}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 6px', fontVariantNumeric: 'tabular-nums' }}>
                            {avgCost != null && avgCost > 0 ? (
                              <span style={{ color: '#4ade80' }}>
                                $ {formatNumber(avgCost, { maximumFractionDigits: 2 })}
                              </span>
                            ) : <span className="helper" style={{ fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 6px', fontVariantNumeric: 'tabular-nums' }}>
                            {currentPrice != null && currentPrice > 0 ? `$ ${formatNumber(currentPrice, { maximumFractionDigits: 5 })}` : '—'}
                          </td>
                          {manualHoldings.length > 0 && (
                            <td style={{ textAlign: 'center', padding: '10px 6px' }}>
                              {h.source === 'manual' && (
                                <button 
                                  className="link" 
                                  onClick={() => deleteManualHolding(h.asset)}
                                  style={{ fontSize: 12, color: '#f87171' }}
                                  title="Delete manual holding"
                                >
                                  🗑️
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 6px' }}>Asset</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px' }}>Quantity</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px' }}>Avg Cost</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(portfolio?.holdings || []).map((h, idx, arr) => {
                      const symbol = h.symbol || h.asset_symbol || h.asset_id || 'N/A';
                      const currentPrice = h.currentPrice || h.current_price || 0;
                      const currentValue = h.currentValue || (h.total_quantity * currentPrice) || 0;
                      return (
                        <tr key={h.asset_id || h.symbol || idx} style={{ borderBottom: idx === arr.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
                          <td style={{ padding: '10px 6px' }}>{symbol}</td>
                          <td style={{ textAlign: 'right', padding: '10px 6px', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(h.total_quantity||0, { maximumFractionDigits: 8 })}</td>
                          <td style={{ textAlign: 'right', padding: '10px 6px' }}>$ {formatNumber(h.average_cost||h.averageCost||0, { maximumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'right', padding: '10px 6px' }}>{currentPrice > 0 ? `$ ${formatNumber(currentValue, { maximumFractionDigits: 2 })}` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {combinedHoldings.length === 0 && (!portfolio?.holdings || portfolio.holdings.length === 0) && (
                  <div className="helper">No holdings yet. Connect an exchange, add transactions, or add manual holdings.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Portfolio Dialog (lightweight) */}
      {creating && createPortal(
        <div className="modal-backdrop" onClick={(e)=>{ if (e.target === e.currentTarget) setCreating(false); }}>
          <div className="modal card" style={{ maxWidth: 480 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Create New Portfolio</div>
            <input className="input" placeholder="Portfolio name" value={portfolioName} onChange={e=>setPortfolioName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') createPortfolio(); }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn ghost" onClick={()=>setCreating(false)}>Cancel</button>
              <button className="btn" onClick={createPortfolio}>Create</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Manual Holding Dialog */}
      {addingManual && createPortal(
        <div className="modal-backdrop" onClick={(e)=>{ if (e.target === e.currentTarget) setAddingManual(false); }}>
          <div className="modal card" style={{ maxWidth: 480 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Add Manual Holding</div>
            <div style={{ marginBottom: 8 }}>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Asset Symbol (e.g., BTC, ETH)</label>
              <input 
                className="input" 
                placeholder="BTC" 
                value={manualForm.assetSymbol} 
                onChange={e=>setManualForm({...manualForm, assetSymbol: e.target.value.toUpperCase()})} 
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Quantity</label>
              <input 
                className="input" 
                type="number" 
                step="any"
                placeholder="1.5" 
                value={manualForm.quantity} 
                onChange={e=>setManualForm({...manualForm, quantity: e.target.value})} 
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Average Cost (optional, leave blank for NULL)</label>
              <input 
                className="input" 
                type="number" 
                step="any"
                placeholder="50000" 
                value={manualForm.averageCost} 
                onChange={e=>setManualForm({...manualForm, averageCost: e.target.value})} 
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <textarea 
                className="input" 
                rows="3"
                placeholder="Add notes about this holding..." 
                value={manualForm.notes} 
                onChange={e=>setManualForm({...manualForm, notes: e.target.value})} 
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={()=>setAddingManual(false)}>Cancel</button>
              <button className="btn" onClick={addManualHolding}>Add Holding</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
    </main>
  );
}

// Sparkline feature archived for later sprint

// Internal component: Donut chart for allocation
function AllocationDonut({ balances, allocation }) {
  // Palette prioritizing Blue, Teal, Orange; "Others" has a softer orange
  const TOP_COLORS = ['#1d4ed8', '#10b981', '#f59e0b'];
  const OTHERS_COLOR = '#fb923c';

  const data = useMemo(() => {
    const OTHERS_LABEL = 'Others';

    // Helper to convert an array of {name, value} to top 3 + others by percentage
    const top3PlusOthers = (entries) => {
      const total = entries.reduce((s, e) => s + Number(e.value || 0), 0);
      if (!total) return [];
      const withPct = entries
        .filter(e => Number(e.value) > 0)
        .map(e => ({ ...e, pct: (Number(e.value) / total) * 100 }));

      // Sort by percentage desc
      withPct.sort((a, b) => b.pct - a.pct);
      const top = withPct.slice(0, 3);
      const rest = withPct.slice(3);
      const othersTotal = rest.reduce((s, e) => s + Number(e.value), 0);
      const base = [...top];
      if (othersTotal > 0) base.push({ name: OTHERS_LABEL, value: othersTotal, pct: (othersTotal / total) * 100 });
      return base;
    };

    if (Array.isArray(balances) && balances.length) {
      const entries = balances.map(b => ({ name: b.asset, value: Number(b.total || 0) }));
      return top3PlusOthers(entries);
    }
    const alloc = allocation?.allocation || [];
    const entries = alloc.map(a => ({ name: a.symbol, value: Number(a.percentage || 0) }));
    return top3PlusOthers(entries);
  }, [balances, allocation]);

  // Custom label/leader line to avoid overlap and show nicer callouts
  const RADIAN = Math.PI / 180;
  const renderLabel = (props) => {
    const { cx, cy, midAngle, outerRadius, percent, name, index } = props;
    const radius = outerRadius + 42; // push labels further out
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const yBase = cy + radius * Math.sin(-midAngle * RADIAN);
    const rightSide = x >= cx;
    // stronger stagger to reduce overlaps
    const stagger = 10;
    const y = yBase + (rightSide ? index * stagger : -index * stagger);
    const textAnchor = rightSide ? 'start' : 'end';
    const label = `${name} (${(percent * 100).toFixed(0)}%)`;
    return (
      <text x={x} y={y} fill="#cbd5e1" fontSize={12} textAnchor={textAnchor} dominantBaseline="central">
        {label}
      </text>
    );
  };

  const renderLabelLine = (props) => {
    const { cx, cy, midAngle, outerRadius, index } = props;
    const r1 = outerRadius + 10; // start just outside the arc
    const r2 = outerRadius + 34; // elbow point further out
    const x1 = cx + r1 * Math.cos(-midAngle * RADIAN);
    const y1 = cy + r1 * Math.sin(-midAngle * RADIAN);
    const x2 = cx + r2 * Math.cos(-midAngle * RADIAN);
    const y2Base = cy + r2 * Math.sin(-midAngle * RADIAN);
    const rightSide = x2 >= cx;
    const stagger = 10;
    const y2 = y2Base + (rightSide ? index * stagger : -index * stagger);
    const x3 = x2 + (rightSide ? 26 : -26); // longer horizontal tail
    const y3 = y2;
    const path = `M${x1},${y1} L${x2},${y2} L${x3},${y3}`;
    return (
      <g>
        <path d={path} stroke="rgba(148,163,184,0.65)" strokeWidth={1.2} fill="none" />
        <circle cx={x1} cy={y1} r={1.8} fill="rgba(148,163,184,0.85)" />
      </g>
    );
  };

  if (!data.length) return (
    <div className="helper" style={{ marginBottom: 8 }}>No allocation data yet.</div>
  );

  return (
    <div style={{ width: '100%', height: 300, marginBottom: 8 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={70}
            outerRadius={115}
            paddingAngle={1}
            labelLine={renderLabelLine}
            label={renderLabel}
          >
            {data.map((entry, index) => {
              const fill = entry.name === 'Others' ? OTHERS_COLOR : TOP_COLORS[index % TOP_COLORS.length];
              return <Cell key={`cell-${index}`} fill={fill} />;
            })}
            <Label position="center" style={{ fill: '#9ca3af', fontSize: 12 }}>Allocation</Label>
          </Pie>
          <Tooltip formatter={(value, name, props) => {
            const pct = props?.payload?.pct ? props.payload.pct.toFixed(2) + '%' : '';
            return [value, `${name} ${pct}`];
          }} />
          <Legend verticalAlign="bottom" height={24} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}