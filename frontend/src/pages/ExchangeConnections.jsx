import React, { useEffect, useState } from 'react';
import { exchangeApi } from '../services/api_exchange';

export function ExchangeConnections() {
  const [connections, setConnections] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [supportedExchanges, setSupportedExchanges] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [syncing, setSyncing] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    exchange: 'binance',
    apiKey: '',
    apiSecret: '',
    passphrase: '',
    portfolioId: '',
  });

  const load = async () => {
    setError('');
    setLoading(true);
    try {
      const [cRes, pRes, eRes] = await Promise.all([
        exchangeApi.getConnections(),
        exchangeApi.getPortfolios(),
        exchangeApi.getSupportedExchanges(),
      ]);
      setConnections(cRes.data.connections || []);
      setPortfolios(pRes.data.portfolios || []);
      setSupportedExchanges(eRes.data.exchanges || []);
    } catch (err) {
      console.error('Failed to load exchange connections data:', err);
      setError(`Failed to load data: ${err?.response?.data?.error || err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Manual sync only (auto-sync removed per request)

  const onConnect = async () => {
    setError('');
    setSuccess('');
    try {
      const response = await exchangeApi.connectExchange(formData);
      const connectionId = response?.data?.connection?.id;
      
      setSuccess('Exchange connected successfully. Syncing transactions...');
      setShowForm(false);
      setFormData({ exchange: 'binance', apiKey: '', apiSecret: '', passphrase: '', portfolioId: '' });
      
      // Auto-sync after connecting
      if (connectionId) {
        try {
          setSyncing(connectionId);
          const syncRes = await exchangeApi.syncExchange(connectionId);
          setSuccess(`Exchange connected and synced ${syncRes?.data?.syncJob?.transactionsSynced || 0} transactions!`);
        } catch {
          setSuccess('Exchange connected, but sync failed. Please click Sync manually.');
        } finally {
          setSyncing('');
        }
      }
      
      load();
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to connect exchange';
      const details = e?.response?.data?.details || e?.message;
      setError(details && details !== msg ? `${msg}: ${details}` : msg);
    }
  };

  const onSync = async (id) => {
    setSyncing(id);
    setError('');
    setSuccess('');
    try {
      const res = await exchangeApi.syncExchange(id);
      setSuccess(`Synced ${res?.data?.syncJob?.transactionsSynced || 0} transactions.`);
      load();
    } catch {
      setError('Failed to sync exchange');
    } finally {
      setSyncing('');
    }
  };

  const onDisconnect = async (id) => {
    if (!confirm('Disconnect this exchange?')) return;
    setError('');
    setSuccess('');
    try {
      await exchangeApi.disconnectExchange(id);
      setSuccess('Exchange disconnected.');
      load();
    } catch {
      setError('Failed to disconnect exchange');
    }
  };

  return (
    <div className="page" style={{ padding: '1rem' }}>
      <div style={{ width: 'min(1400px, 95vw)', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, letterSpacing: -0.3 }}>Exchange Connections</h2>
          <button className="btn" onClick={() => setShowForm(v => !v)} disabled={loading}>
            {showForm ? 'Close' : 'Connect Exchange'}
          </button>
        </div>

        {error && <div className="toast error" style={{ marginBottom: 10 }}>{error}</div>}
        {success && <div className="toast" style={{ marginBottom: 10 }}>{success}</div>}

        {loading ? (
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div className="helper">Loading exchange connections...</div>
          </div>
        ) : (
          <>
            {/* Informational note banner like the reference */}
            <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.08)' }}>
              <div style={{ fontWeight: 700, marginRight: 6 }}>Note:</div>
              <div className="helper">Connect your exchange accounts (Binance, Bitget, KuCoin, BingX) to automatically sync your portfolio and transaction history. Your API keys are encrypted and stored securely.</div>
            </div>

        {showForm && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="form" style={{ display: 'grid', gap: 10 }}>
              <label>
                <div className="label">Exchange</div>
                <select className="input" value={formData.exchange} onChange={(e) => setFormData({ ...formData, exchange: e.target.value, passphrase: '' })}>
                  {supportedExchanges.map(ex => (
                    <option key={ex.value} value={ex.value}>{ex.name} {ex.logo}</option>
                  ))}
                </select>
              </label>

              <label>
                <div className="label">Portfolio</div>
                <select className="input" value={formData.portfolioId} onChange={(e) => setFormData({ ...formData, portfolioId: e.target.value })}>
                  <option value="">Select portfolio</option>
                  {portfolios.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>

              <label>
                <div className="label">API Key</div>
                <input className="input" type="password" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} />
              </label>

              <label>
                <div className="label">API Secret</div>
                <input className="input" type="password" value={formData.apiSecret} onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })} />
              </label>

              {supportedExchanges.find(ex => ex.value === formData.exchange)?.requiresPassphrase && (
                <label>
                  <div className="label">Passphrase {supportedExchanges.find(ex => ex.value === formData.exchange)?.passphraseLabel && `(${supportedExchanges.find(ex => ex.value === formData.exchange).passphraseLabel})`}</div>
                  <input className="input" type="password" value={formData.passphrase} onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })} />
                </label>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={onConnect}>Connect</button>
                <button className="btn ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div
          className="grid ex-grid"
          style={{
            display: 'grid',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          {connections.length === 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="helper">No exchange connections yet. Click "Connect Exchange" to get started.</div>
            </div>
          )}
          {connections.map(c => (
            <div className="card" key={c.id} style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 18, textTransform: 'capitalize', display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ display:'inline-block', width:8, height:8, borderRadius:999, background: (c.sync_status==='success'?'#22c55e':c.sync_status==='running'?'#f59e0b':'#94a3b8') }}></span>
                  {c.exchange}
                </div>
                <span className="chip" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#34d399' }}>{c.sync_status || 'idle'}</span>
              </div>
              <div className="helper" style={{ marginBottom: 2 }}>Portfolio: {portfolios.find(p => p.id === c.portfolio_id)?.name || c.portfolio_id}</div>
              {c.last_sync_at && <div className="helper" style={{ marginBottom: 2 }}>Last sync: {new Date(c.last_sync_at).toLocaleString()}</div>}
              <div className="helper" style={{ marginBottom: 10 }}>Transactions: {c.transactions_synced}</div>
              {syncing === c.id && <div className="helper" style={{ marginBottom: 8 }}>Syncing…</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn small" disabled={syncing === c.id} onClick={() => onSync(c.id)}>Sync</button>
                <button className="btn small danger" onClick={() => onDisconnect(c.id)}>Disconnect</button>
              </div>
            </div>
          ))}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
