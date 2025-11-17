import React, { useEffect, useMemo, useState } from 'react';
import { exchangeApi } from '../services/api_exchange';
import { manualHoldingAPI } from '../services/api_manual';
import { formatNumber } from '../utils/number';

export function Transactions() {
  const [portfolios, setPortfolios] = useState([]);
  const [portfolioId, setPortfolioId] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Manual transaction entry parked for later sprint
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [connections, setConnections] = useState([]);
  const [addingManual, setAddingManual] = useState(false);
  const [manualForm, setManualForm] = useState({ 
    assetSymbol: '', 
    quantity: '', 
    averageCost: '', 
    notes: '',
    purchaseDate: new Date().toISOString().split('T')[0], // Default to today
    exchange: '' // Custom exchange name
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          exchangeApi.getPortfolios(),
          exchangeApi.getConnections().catch(() => ({ data: { connections: [] } }))
        ]);
        const allPortfolios = pRes.data.portfolios || [];
        const allConnections = cRes?.data?.connections || [];
        
        // Filter to only show portfolios that are connected to an exchange
        const connectedPortfolios = allPortfolios.filter(p => 
          allConnections.some(c => String(c.portfolio_id) === String(p.id))
        );
        
        setPortfolios(connectedPortfolios);
        setConnections(allConnections);
        
        // Set initial portfolio to first connected one
        if (connectedPortfolios.length && !portfolioId) {
          setPortfolioId(connectedPortfolios[0].id);
        } else if (!connectedPortfolios.length) {
          setPortfolioId(null);
        }
      } catch {
        setError('Failed to load portfolios');
      }
    };
    load();
  }, [portfolioId]);

  useEffect(() => {
    const loadTx = async () => {
      if (!portfolioId) return;
      try {
        if (filterType === 'all') {
          const res = await exchangeApi.getTransactions(portfolioId, { limit: 1000, offset: 0 });
          setTransactions(res.data.transactions || []);
        } else {
          const res = await exchangeApi.getTransactionsByType(portfolioId, filterType);
          setTransactions(res.data.transactions || res.data.conversions || res.data.spotTrades || []);
        }
      } catch {
        setError('Failed to load transactions');
      }
    };
    loadTx();
  }, [portfolioId, filterType]);

  // addTx and delTx intentionally removed while feature is parked

  // Derived, paginated slice
  const slice = useMemo(() => {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return transactions.slice(start, end);
  }, [transactions, page, rowsPerPage]);

  const total = transactions.length;
  const startIndex = total ? page * rowsPerPage + 1 : 0;
  const endIndex = Math.min(total, (page + 1) * rowsPerPage);

  const isReadOnly = useMemo(() => {
    if (!portfolioId) return false;
    const conn = (connections || []).find(c => String(c.portfolio_id) === String(portfolioId));
    return !!conn; // treat any linked connection as read-only
  }, [connections, portfolioId]);

  const addManualHolding = async () => {
    const { assetSymbol, quantity, averageCost, purchaseDate, exchange } = manualForm;
    if (!assetSymbol || !quantity || quantity <= 0) {
      return setError('Asset symbol and positive quantity are required');
    }
    try {
      setError('');
      const data = {
        assetSymbol: assetSymbol.trim().toUpperCase(),
        quantity: parseFloat(quantity),
        averageCost: averageCost ? parseFloat(averageCost) : null,
        notes: manualForm.notes || ''
      };
      
      // Add the manual holding
      await manualHoldingAPI.upsertHolding(portfolioId, data);
      
      // Auto-create a BUY transaction entry in the transaction history
      if (averageCost && parseFloat(averageCost) > 0) {
        try {
          const transactionData = {
            date: purchaseDate || new Date().toISOString().split('T')[0],
            type: 'buy',
            assetSymbol: data.assetSymbol,
            quantity: data.quantity,
            price: parseFloat(averageCost),
            totalValue: data.quantity * parseFloat(averageCost),
            exchange: exchange || '-',
            notes: `Manual entry: ${manualForm.notes || 'Buy transaction'}`
          };
          await exchangeApi.addTransaction(portfolioId, transactionData);
        } catch (txErr) {
          console.warn('Failed to create transaction entry:', txErr);
          // Don't fail the whole operation if transaction creation fails
        }
      }
      
      setSuccess(`Manual holding for ${data.assetSymbol} added successfully`);
      setAddingManual(false);
      setManualForm({ assetSymbol: '', quantity: '', averageCost: '', notes: '', purchaseDate: new Date().toISOString().split('T')[0], exchange: '' });
      
      // Reload transactions to show the new entry
      loadTransactions();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to add manual holding');
    }
  };

  const TypePill = ({ type }) => {
    const t = String(type || '').toLowerCase();
    const map = {
      buy: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: 'BUY' },
      sell: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'SELL' },
      deposit: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', label: 'DEPOSIT' },
      withdraw: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'WITHDRAW' },
      convert: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7', label: 'CONVERT' },
    };
    const st = map[t] || { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: t.toUpperCase() };
    return (
      <span style={{ background: st.bg, color: st.color, padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{st.label}</span>
    );
  };

  return (
    <div className="page" style={{ padding: '1rem' }}>
      <div style={{ width: 'min(1400px, 95vw)', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, letterSpacing: -0.3 }}>Transaction History</h2>
            {isReadOnly && <span className="chip" style={{ background:'rgba(96,165,250,0.15)', border:'1px solid rgba(96,165,250,0.25)', color:'#93c5fd', padding:'6px 10px', borderRadius:8, fontSize:12, fontWeight:700 }}>Live • Read-only</span>}
          </div>
          {!isReadOnly && portfolioId && (
            <button 
              className="btn" 
              style={{ padding: '8px 16px' }}
              onClick={() => setAddingManual(true)}
            >
              ➕ Add Manual Asset
            </button>
          )}
        </div>

        {error && <div className="toast error" style={{ marginBottom: 10 }}>{error}</div>}
        {success && <div className="toast success" style={{ marginBottom: 10 }}>{success}</div>}

        {portfolios.length === 0 && (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Exchange Portfolios Found</div>
            <div className="helper">Transaction history is only available for portfolios connected to exchanges.</div>
            <div className="helper" style={{ marginTop: 8 }}>Connect an exchange from the Dashboard to view transactions.</div>
          </div>
        )}

        {portfolios.length > 0 && (
          <>
        {success && <div className="toast success" style={{ marginBottom: 10, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>{success}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 16, alignItems: 'start' }}>
          {/* Filters card on the right */}
          <div className="card" style={{ padding: 16, order: 2 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Select Portfolio</div>
            <select className="input" value={portfolioId} onChange={(e) => { setPortfolioId(e.target.value); setPage(0); }}>
              {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button className={`btn ${filterType==='all'?'':'ghost'}`} onClick={() => { setFilterType('all'); setPage(0); }}>All</button>
              <button className={`btn ${filterType==='buy,sell'?'':'ghost'}`} onClick={() => { setFilterType('buy,sell'); setPage(0); }}>Spot Trades</button>
              <button className={`btn ${filterType==='deposit,withdraw'?'':'ghost'}`} onClick={() => { setFilterType('deposit,withdraw'); setPage(0); }}>Deposits/Withdrawals</button>
              <button className={`btn ${filterType==='convert'?'':'ghost'}`} onClick={() => { setFilterType('convert'); setPage(0); }}>Conversions</button>
            </div>
            {isReadOnly && (
              <div className="helper" style={{ marginTop: 10 }}>
                This portfolio is linked to an exchange. Manual add/delete is disabled; transactions are synced from the exchange.
              </div>
            )}
          </div>

          {/* Transactions table on the left */}
          <div className="card" style={{ padding: 0, order: 1 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>Details</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>Quantity</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>Price</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>Total Value</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>Exchange</th>
                    {/* Actions column removed while manual entry is parked */}
                  </tr>
                </thead>
                <tbody>
                  {slice.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '10px 8px' }}>
                        {new Date(tx.transaction_date).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 8px' }}><TypePill type={tx.type} /></td>
                      <td style={{ padding: '10px 8px' }}>
                        {tx.type === 'convert' && tx.quote_asset ? (
                          <span>
                            {tx.quote_asset} <span style={{ color: '#9ca3af' }}>→</span> {tx.symbol}
                          </span>
                        ) : tx.symbol}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(tx.quantity, { maximumFractionDigits: 8 })}</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontVariantNumeric: 'tabular-nums' }}>
                        {tx.type === 'convert' ? (
                          <span>
                            ${formatNumber(tx.price || 0, { maximumFractionDigits: 6 })}
                            <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>ratio: 1:{formatNumber(tx.conversion_rate || 0, { maximumFractionDigits: 4 })}</span>
                          </span>
                        ) : `$${formatNumber(tx.price || 0, { maximumFractionDigits: 2 })}`}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', fontVariantNumeric: 'tabular-nums' }}>${formatNumber(tx.total_value || 0, { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '10px 8px' }}>{tx.exchange || 'Manual'}</td>
                      {/* Delete action removed while manual entry is parked */}
                    </tr>
                  ))}
                  {slice.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 16, color: '#9ca3af' }}>No transactions found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="space-between" style={{ padding: '10px 12px' }}>
              <div className="helper">Rows per page:&nbsp;
                <select className="input" style={{ padding: '6px 8px', height: 36, width: 80 }} value={rowsPerPage} onChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}>
                  <option>25</option>
                  <option>50</option>
                  <option>100</option>
                </select>
              </div>
              <div className="helper" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{startIndex}–{endIndex} of {total}</span>
                <button className="btn ghost" style={{ padding: '6px 10px' }} disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>{'<'}</button>
                <button className="btn ghost" style={{ padding: '6px 10px' }} disabled={(page+1)*rowsPerPage>=total} onClick={()=>setPage(p=>p+1)}>{'>'}</button>
              </div>
            </div>
          </div>
        </div>

        {/* Manual Add Asset Modal */}
        {addingManual && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setAddingManual(false); }}>
            <div className="modal card" style={{ maxWidth: 480 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Add Manual Asset</div>
              <div style={{ marginBottom: 12, padding: 12, background: 'rgba(59,130,246,0.1)', borderRadius: 8, fontSize: 14 }}>
                <strong>Note:</strong> This adds an asset to your portfolio holdings without transaction history. 
                The average cost is optional (leave blank for airdrops/rewards).
              </div>
              <div style={{ marginBottom: 8 }}>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Asset Symbol (e.g., BTC, ETH)</label>
                <input 
                  className="input" 
                  placeholder="BTC" 
                  value={manualForm.assetSymbol} 
                  onChange={e => setManualForm({...manualForm, assetSymbol: e.target.value.toUpperCase()})} 
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
                  onChange={e => setManualForm({...manualForm, quantity: e.target.value})} 
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Average Cost per unit (optional)</label>
                <input 
                  className="input" 
                  type="number" 
                  step="any"
                  placeholder="45000.00" 
                  value={manualForm.averageCost} 
                  onChange={e => setManualForm({...manualForm, averageCost: e.target.value})} 
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Purchase Date (optional)</label>
                <input 
                  className="input" 
                  type="date"
                  value={manualForm.purchaseDate} 
                  onChange={e => setManualForm({...manualForm, purchaseDate: e.target.value})} 
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Exchange/Platform (optional)</label>
                <input 
                  className="input" 
                  placeholder="Binance, Coinbase, etc." 
                  value={manualForm.exchange} 
                  onChange={e => setManualForm({...manualForm, exchange: e.target.value})} 
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="helper" style={{ display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                <textarea 
                  className="input" 
                  rows="3"
                  placeholder="Add notes about this asset..." 
                  value={manualForm.notes} 
                  onChange={e => setManualForm({...manualForm, notes: e.target.value})} 
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn ghost" onClick={() => setAddingManual(false)}>Cancel</button>
                <button className="btn" onClick={addManualHolding}>Add Asset</button>
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
