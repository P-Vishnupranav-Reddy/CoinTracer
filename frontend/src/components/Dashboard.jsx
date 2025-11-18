import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { exchangeApi } from '../services/api_exchange';
import { manualHoldingAPI } from '../services/api_manual';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, Label, BarChart, Bar, XAxis, YAxis } from 'recharts';
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
  const [exchangeBreakdown, setExchangeBreakdown] = useState({
    loading: false,
    data: [],
    countData: [],
    error: ''
  });
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

  // Load live balances for all connected exchanges in the selected portfolio
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setBalances(null);
      setExchangeBreakdown({ loading: false, data: [], countData: [], error: '' });
      return () => {
        cancelled = true;
      };
    }

    const relevantConnections = (connections || []).filter((c) => c.portfolio_id === selectedId);
    if (!relevantConnections.length) {
      setBalances(null);
      setExchangeBreakdown({
        loading: false,
        data: [],
        countData: [],
        error: 'Connect an exchange to see live distribution.'
      });
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        setBalancesLoading(true);
        setExchangeBreakdown((prev) => ({ ...prev, loading: true, error: '' }));
        const responses = await Promise.all(
          relevantConnections.map(async (conn) => {
            try {
              const res = await exchangeApi.getExchangeBalances(conn.id);
              return {
                connectionId: conn.id,
                exchange: res?.data?.exchange || conn.exchange || conn.name || 'Unknown',
                balances: res?.data?.balances || []
              };
            } catch (err) {
              console.warn('Exchange balance fetch failed', conn.id, err);
              return { connectionId: conn.id, exchange: conn.exchange || 'Unknown', balances: [], error: true };
            }
          })
        );
        if (cancelled) return;

        const successful = responses.filter((r) => !r.error && Array.isArray(r.balances));
        const flattenedBalances = successful.flatMap((entry) =>
          entry.balances.map((balance) => ({ ...balance, exchange: entry.exchange }))
        );
        setBalances(flattenedBalances);

        const breakdownEntries = successful
          .map((entry) => {
            const totalValue = entry.balances.reduce((sum, b) => {
              const qty = Number(b.total ?? b.quantity ?? b.free ?? 0) || 0;
              const price = Number(b.currentPrice ?? b.current_price ?? 0) || 0;
              const fallbackValue = price > 0 ? qty * price : qty;
              return sum + fallbackValue;
            }, 0);
            return totalValue > 0
              ? { exchange: entry.exchange, value: totalValue }
              : null;
          })
          .filter(Boolean);

        const countEntries = successful
          .map((entry) => {
            const assetCount = entry.balances.filter((b) => {
              const qty = Number(b.total ?? b.quantity ?? b.free ?? 0) || 0;
              return qty > 0;
            }).length;
            return assetCount > 0 ? { exchange: entry.exchange, count: assetCount } : null;
          })
          .filter(Boolean);

        const totalValue = breakdownEntries.reduce((sum, item) => sum + item.value, 0);
        const data = breakdownEntries
          .map((item) => ({
            ...item,
            pct: totalValue > 0 ? (item.value / totalValue) * 100 : 0
          }))
          .sort((a, b) => b.value - a.value);

        const countData = countEntries.sort((a, b) => b.count - a.count);

        setExchangeBreakdown({
          loading: false,
          data,
          countData,
          error:
            data.length || countData.length
              ? ''
              : 'Unable to compute exchange mix from live balances.'
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load exchange balances', err);
        setBalances(null);
        setExchangeBreakdown({
          loading: false,
          data: [],
          countData: [],
          error: 'Failed to load exchange distribution.'
        });
      } finally {
        if (!cancelled) {
          setBalancesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, connections]);

  // Merge manual holdings with exchange balances (fetch current prices for manual holdings)
  const combinedHoldings = useMemo(
    () => buildCombinedHoldings({ balances, manualHoldings }),
    [balances, manualHoldings]
  );

  // Calculate aggregated summary across ALL portfolios by fetching live data for each
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
        let aggregatedTotalValue = 0;
        let aggregatedTotal24hPnL = 0;
        const uniqueAssets = new Set();

        // Process each portfolio to get its live balances + manual holdings
        for (const p of portfolios) {
          try {
            // Get connections for this portfolio
            const portfolioConnections = connections.filter(c => c.portfolio_id === p.id);

            // Fetch live balances from all exchanges for this portfolio
            let portfolioBalances = [];
            if (portfolioConnections.length > 0) {
              const balanceResponses = await Promise.all(
                portfolioConnections.map(async (conn) => {
                  try {
                    const res = await exchangeApi.getExchangeBalances(conn.id);
                    return res?.data?.balances || [];
                  } catch {
                    return [];
                  }
                })
              );
              portfolioBalances = balanceResponses.flat();
            }

            // Fetch manual holdings for this portfolio
            let portfolioManualHoldings = [];
            try {
              const manualRes = await manualHoldingAPI.getHoldings(p.id);
              portfolioManualHoldings = manualRes?.data?.holdings || [];
            } catch {
              // Manual holdings might not exist
            }

            // Build combined holdings for this portfolio
            const portfolioCombined = buildCombinedHoldings({
              balances: portfolioBalances,
              manualHoldings: portfolioManualHoldings
            });

            // Calculate this portfolio's totals
            portfolioCombined.forEach(h => {
              const qty = Number(h.quantity) || 0;
              const price = Number(h.currentPrice) || 0;
              const change24h = Number(h.change24h) || 0;

              aggregatedTotalValue += qty * price;
              aggregatedTotal24hPnL += qty * price * (change24h / 100);
              uniqueAssets.add(h.asset);
            });

          } catch (err) {
            console.warn(`Failed to calculate portfolio ${p.name}:`, err);
          }
        }

        // Calculate 24h P&L percentage
        const value24hAgo = aggregatedTotalValue - aggregatedTotal24hPnL;
        const total24hPnLPercentage = value24hAgo > 0
          ? ((aggregatedTotal24hPnL / value24hAgo) * 100).toFixed(2)
          : '0.00';

        setGlobalSummary({
          totalValue: aggregatedTotalValue.toFixed(2),
          total24hPnL: aggregatedTotal24hPnL.toFixed(2),
          total24hPnLPercentage,
          portfolioCount: portfolios.length,
          assetCount: uniqueAssets.size
        });
        setGlobalSummaryError('');
      } catch (e) {
        console.error('Failed to calculate aggregated portfolio summary', e);
        setGlobalSummary(null);
        setGlobalSummaryError('Failed to calculate aggregated portfolio summary.');
      } finally {
        setGlobalSummaryLoading(false);
      }
    };

    if (!loading) loadGlobalSummary();
  }, [portfolios, connections, loading]);

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
      // Get the holding details before deleting for transaction record
      const holdingsRes = await manualHoldingAPI.getHoldings(selectedId);
      const holdingToDelete = (holdingsRes?.holdings || []).find(
        h => (h.asset_symbol || h.asset)?.toUpperCase() === assetSymbol.toUpperCase()
      );
      
      // Delete the manual holding
      await manualHoldingAPI.deleteHolding(selectedId, assetSymbol);
      
      // Auto-create a SELL transaction entry
      if (holdingToDelete) {
        try {
          const quantity = Number(holdingToDelete.quantity) || 0;
          const avgCost = Number(holdingToDelete.average_cost || holdingToDelete.averageCost) || 0;
          const currentPrice = Number(holdingToDelete.current_price || holdingToDelete.currentPrice) || avgCost;
          
          const transactionData = {
            date: new Date().toISOString().split('T')[0],
            type: 'sell',
            assetSymbol: assetSymbol.toUpperCase(),
            quantity: quantity,
            price: currentPrice > 0 ? currentPrice : avgCost,
            totalValue: quantity * (currentPrice > 0 ? currentPrice : avgCost),
            exchange: '-',
            notes: 'Manual entry: Sell transaction (holding deleted)'
          };
          await exchangeApi.addTransaction(selectedId, transactionData);
        } catch (txErr) {
          console.warn('Failed to create sell transaction entry:', txErr);
        }
      }
      
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
            <AllocationDonut 
              balances={balances} 
              allocation={allocation} 
              combinedHoldings={combinedHoldings}
            />
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Exchange Distribution</div>
                {exchangeBreakdown.loading && <div className="helper" style={{ fontSize: 12 }}>Loading…</div>}
              </div>
              <ExchangeBreakdownChart breakdown={exchangeBreakdown} />
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>Assets per Exchange</div>
                {exchangeBreakdown.loading && <div className="helper" style={{ fontSize: 12 }}>Loading…</div>}
              </div>
              <ExchangeAssetCountChart breakdown={exchangeBreakdown} />
            </div>
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
                  Export CSV
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
                      
                      // Calculate P&L percentage if we have both prices
                      let pnlPercent = null;
                      if (avgCost != null && avgCost > 0 && currentPrice != null && currentPrice > 0) {
                        pnlPercent = ((currentPrice - avgCost) / avgCost) * 100;
                      }
                      
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
                              {pnlPercent != null && (
                                <span style={{ 
                                  fontSize: 11, 
                                  fontWeight: 600,
                                  color: pnlPercent >= 0 ? '#4ade80' : '#f87171',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  backgroundColor: pnlPercent >= 0 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)'
                                }}>
                                  {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
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
function AllocationDonut({ balances, allocation, combinedHoldings }) {
  const CHART_HEIGHT = 320;
  const CHART_MARGIN = { top: 24, right: 28, bottom: 24, left: 28 };
  const TOP_COLORS = ['#1d4ed8', '#0ea5e9', '#10b981', '#14b8a6', '#f97316', '#facc15'];
  const OTHERS_COLOR = '#fb923c';

  const chartSource = useMemo(() => {
    const condense = (entries, mode) => {
      const total = entries.reduce((sum, entry) => sum + Number(entry.value || 0), 0);
      if (!total) return null;
      const sorted = entries
        .filter(entry => Number(entry.value) > 0)
        .sort((a, b) => Number(b.value) - Number(a.value));
      const top = sorted.slice(0, 6);
      const others = sorted.slice(6);
      const othersTotal = others.reduce((sum, entry) => sum + Number(entry.value || 0), 0);
      const data = [...top];
      if (othersTotal > 0) {
        data.push({ name: 'Others', value: othersTotal });
      }
      return {
        data: data.map(item => ({
          ...item,
          pct: total > 0 ? (Number(item.value) / total) * 100 : 0
        })),
        total,
        mode
      };
    };

    const fromCombined = () => {
      const entries = (combinedHoldings || [])
        .map((holding) => {
          const qty = Number(holding.quantity) || 0;
          const price = Number(holding.currentPrice) || 0;
          if (!qty || !price) return null;
          return { name: holding.asset || holding.assetName, value: qty * price };
        })
        .filter(Boolean);
      if (!entries.length) return null;
      const condensed = condense(entries, 'value');
      if (!condensed) return null;
      return {
        ...condensed,
        helper: 'Using live value (exchange + manual holdings)'
      };
    };

    const fromBalances = () => {
      if (!Array.isArray(balances) || !balances.length) return null;
      const entries = balances
        .map((balance) => ({
          name: balance.asset,
          value: Number(balance.total || balance.quantity || 0)
        }))
        .filter(entry => entry.name && Number(entry.value) > 0);
      if (!entries.length) return null;
      const condensed = condense(entries, 'quantity');
      if (!condensed) return null;
      return {
        ...condensed,
        helper: 'Using exchange balance quantities'
      };
    };

    const fromAllocation = () => {
      const alloc = allocation?.allocation || [];
      if (!alloc.length) return null;
      const entries = alloc
        .map((item) => ({
          name: item.symbol,
          value: Number(item.percentage || 0)
        }))
        .filter(entry => entry.name && Number(entry.value) > 0);
      if (!entries.length) return null;
      const condensed = condense(entries, 'percentage');
      if (!condensed) return null;
      return {
        ...condensed,
        helper: 'Using backend allocation snapshot'
      };
    };

    return fromCombined() || fromBalances() || fromAllocation() || { data: [], total: 0, helper: 'Allocation data unavailable' };
  }, [balances, allocation, combinedHoldings]);

  const formatValue = (value) => {
    if (!chartSource) return value;
    switch (chartSource.mode) {
      case 'value':
        return `$ ${formatNumber(value, { maximumFractionDigits: 2 })}`;
      case 'percentage':
        return `${formatNumber(value, { maximumFractionDigits: 2 })}%`;
      default:
        return formatNumber(value, { maximumFractionDigits: 6 });
    }
  };

  const data = chartSource?.data || [];

  // Custom label/leader line to avoid overlap and show nicer callouts
  const RADIAN = Math.PI / 180;
  const renderLabel = (props) => {
    const { cx, cy, midAngle, outerRadius, percent, name, index } = props;
    const radius = outerRadius + 34; // closer labels to reduce clutter
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const yBase = cy + radius * Math.sin(-midAngle * RADIAN);
    const rightSide = x >= cx;
    const stagger = 8;
    const y = yBase + (rightSide ? index * stagger : -index * stagger);
    const textAnchor = rightSide ? 'start' : 'end';
    const label = `${name} ${(percent * 100).toFixed(0)}%`;
    return (
      <text x={x} y={y} fill="#cbd5e1" fontSize={12} textAnchor={textAnchor} dominantBaseline="central">
        {label}
      </text>
    );
  };

  const renderLabelLine = (props) => {
    const { cx, cy, midAngle, outerRadius, index } = props;
    const r1 = outerRadius + 8; // start just outside the arc
    const r2 = outerRadius + 24; // elbow point further out
    const x1 = cx + r1 * Math.cos(-midAngle * RADIAN);
    const y1 = cy + r1 * Math.sin(-midAngle * RADIAN);
    const x2 = cx + r2 * Math.cos(-midAngle * RADIAN);
    const y2Base = cy + r2 * Math.sin(-midAngle * RADIAN);
    const rightSide = x2 >= cx;
    const stagger = 8;
    const y2 = y2Base + (rightSide ? index * stagger : -index * stagger);
    const x3 = x2 + (rightSide ? 22 : -22); // shorter tail
    const y3 = y2;
    const path = `M${x1},${y1} L${x2},${y2} L${x3},${y3}`;
    return (
      <g>
        <path d={path} stroke="rgba(148,163,184,0.65)" strokeWidth={1.2} fill="none" />
        <circle cx={x1} cy={y1} r={1.8} fill="rgba(148,163,184,0.85)" />
      </g>
    );
  };

  const renderCenterLabel = ({ viewBox }) => {
    if (!viewBox) return null;
    const { cx, cy } = viewBox;
    const totalDisplay =
      chartSource?.mode === 'value'
        ? `$ ${formatNumber(chartSource.total || 0, { maximumFractionDigits: 0 })}`
        : chartSource?.mode === 'percentage'
        ? '100%'
        : formatNumber(chartSource?.total || 0, { maximumFractionDigits: 0 });
    const subLabel =
      chartSource?.mode === 'value'
        ? 'Portfolio Value'
        : chartSource?.mode === 'percentage'
        ? 'Allocation'
        : 'Total Quantity';

    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0">
        <tspan x={cx} dy="-0.2em" fontSize={16} fontWeight={600}>
          {chartSource?.total ? totalDisplay : 'Allocation'}
        </tspan>
        <tspan x={cx} dy="1.4em" fontSize={12} fill="#94a3b8">
          {chartSource?.total ? subLabel : ''}
        </tspan>
      </text>
    );
  };

  if (!data.length) return (
    <div className="helper" style={{ marginBottom: 8 }}>{chartSource?.helper || 'No allocation data yet.'}</div>
  );

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ width: '100%', height: CHART_HEIGHT }}>
        <ResponsiveContainer>
          <PieChart margin={CHART_MARGIN}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
              innerRadius={78}
              outerRadius={110}
            paddingAngle={1}
            labelLine={renderLabelLine}
            label={renderLabel}
          >
            {data.map((entry, index) => {
              const fill = entry.name === 'Others' ? OTHERS_COLOR : TOP_COLORS[index % TOP_COLORS.length];
              return <Cell key={`cell-${index}`} fill={fill} />;
            })}
            <Label position="center" content={renderCenterLabel} />
          </Pie>
          <Tooltip formatter={(value, name, props) => {
            const pct = props?.payload?.pct ? props.payload.pct.toFixed(2) + '%' : '';
            return [formatValue(value), `${name}${pct ? ` (${pct})` : ''}`];
          }} />
          <Legend
            iconType="circle"
            layout="horizontal"
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ paddingTop: 4 }}
          />
        </PieChart>
      </ResponsiveContainer>
      </div>
      {chartSource?.helper && (
        <div className="helper" style={{ textAlign: 'center' }}>{chartSource.helper}</div>
      )}
    </div>
  );
}

function ExchangeBreakdownChart({ breakdown }) {
  const { data = [], loading, error } = breakdown || {};
  const COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185'];
  const chartData = data.map((item, index) => ({
    ...item,
    fill: COLORS[index % COLORS.length]
  }));

  if (loading && !chartData.length) {
    return <div className="helper">Loading exchange balances…</div>;
  }

  if ((!chartData.length && error) || (!chartData.length && !loading)) {
    return (
      <div className="helper">
        {error || 'No exchange distribution data yet.'}
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <PieChart margin={{ top: 16, right: 28, bottom: 12, left: 28 }}>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="exchange"
            innerRadius={58}
            outerRadius={92}
            paddingAngle={1}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {chartData.map((entry, index) => (
              <Cell key={`exchange-cell-${index}`} fill={entry.fill} />
            ))}
            <Label
              position="center"
              content={({ viewBox }) => {
                if (!viewBox) return null;
                const { cx, cy } = viewBox;
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#e2e8f0">
                    <tspan x={cx} dy="-0.2em" fontSize={15} fontWeight={600}>
                      {chartData.length} Exch
                    </tspan>
                    <tspan x={cx} dy="1.3em" fontSize={12} fill="#94a3b8">
                      Live Mix
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
          <Tooltip
            formatter={(value, name, props) => {
              const pct = props?.payload?.pct ? props.payload.pct.toFixed(2) + '%' : '';
              return [`$ ${formatNumber(value, { maximumFractionDigits: 2 })}`, `${name}${pct ? ` (${pct})` : ''}`];
            }}
          />
          <Legend verticalAlign="bottom" height={24} />
        </PieChart>
      </ResponsiveContainer>
      <div className="helper" style={{ textAlign: 'center', marginTop: 4 }}>
        Based on live balances across connected exchanges.
      </div>
    </div>
  );
}

function ExchangeAssetCountChart({ breakdown }) {
  const { countData = [], loading, error } = breakdown || {};

  if (loading && !countData.length) {
    return <div className="helper">Loading asset counts…</div>;
  }

  if ((!countData.length && error) || (!countData.length && !loading)) {
    return (
      <div className="helper">
        {error || 'No asset count data yet.'}
      </div>
    );
  }

  const chartHeight = Math.max(140, countData.length * 38);

  return (
    <div style={{ width: '100%', height: chartHeight, marginTop: 12 }}>
      <ResponsiveContainer>
        <BarChart
          data={countData}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 32, bottom: 8 }}
        >
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            dataKey="exchange"
            type="category"
            width={90}
            tick={{ fill: '#e2e8f0', fontSize: 12 }}
          />
          <Tooltip
            formatter={(value) => [`${value} asset${value === 1 ? '' : 's'}`, 'Assets']}
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              borderRadius: 10,
              color: '#e2e8f0',
              boxShadow: '0 10px 25px rgba(2, 6, 23, 0.55)',
              padding: '8px 12px'
            }}
            wrapperStyle={{ zIndex: 30 }}
            labelStyle={{ color: '#cbd5f5', marginBottom: 4 }}
            itemStyle={{ color: '#e2e8f0', fontWeight: 500 }}
          />
          <Bar
            dataKey="count"
            radius={[4, 4, 4, 4]}
            fill="url(#exchangeCountGradient)"
            label={({ value, x, y, height, width }) => (
              <text
                x={x + width + 6}
                y={y + height / 2}
                fill="#cbd5f5"
                fontSize={12}
                dominantBaseline="middle"
              >
                {value}
              </text>
            )}
          />
          <defs>
            <linearGradient id="exchangeCountGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
      <div className="helper" style={{ textAlign: 'center', marginTop: 4 }}>
        Counts deduplicated per exchange based on live balances.
      </div>
    </div>
  );
}