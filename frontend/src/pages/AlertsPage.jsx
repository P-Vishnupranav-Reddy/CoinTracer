import React, { useState, useEffect } from 'react';
import { alertsService } from '../services/api_alerts';
import { exchangeApi } from '../services/api_exchange';
import { manualHoldingAPI } from '../services/api_manual';
import '../DevB_Features.css';

export function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [portfolioAssets, setPortfolioAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [formData, setFormData] = useState({
    assetId: '',
    assetSymbol: '',
    type: 'price_target',
    condition: 'above',
    value: '',
    percentageTimeframe: '24h'
  });

  useEffect(() => {
    loadAlerts();
    loadPortfolioAssets();
  }, [filter]);

  const loadAlerts = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filter === 'active') params.activeOnly = 'true';
      const response = await alertsService.getAlerts(params);
      setAlerts(response.data.alerts || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  const loadPortfolioAssets = async () => {
    setLoadingAssets(true);
    try {
      const [portfoliosRes, connectionsRes] = await Promise.all([
        exchangeApi.getPortfolios().catch(() => ({ data: { portfolios: [] } })),
        exchangeApi.getConnections().catch(() => ({ data: { connections: [] } }))
      ]);

      const portfolios = portfoliosRes?.data?.portfolios || [];
      const connections = connectionsRes?.data?.connections || [];

      const allAssets = new Map();

      for (const portfolio of portfolios) {
        try {
          const portfolioRes = await exchangeApi.getPortfolio(portfolio.id).catch(() => null);
          const holdings = portfolioRes?.data?.holdings || [];

          holdings.forEach((holding) => {
            const symbol = (holding.symbol || holding.asset_symbol || holding.asset_id || '').toUpperCase();
            const assetId = (holding.asset_id || holding.symbol || holding.asset_symbol || '').toLowerCase();
            if (symbol && !allAssets.has(symbol)) {
              allAssets.set(symbol, {
                symbol,
                assetId: assetId || symbol.toLowerCase(),
                name: holding.name || symbol
              });
            }
          });

          const connection = connections.find((c) => c.portfolio_id === portfolio.id);
          if (connection) {
            const balancesRes = await exchangeApi.getExchangeBalances(connection.id).catch(() => null);
            const balances = balancesRes?.data?.balances || [];

            balances.forEach((balance) => {
              const symbol = (balance.asset || balance.symbol || '').toUpperCase();
              if (symbol && !allAssets.has(symbol)) {
                allAssets.set(symbol, {
                  symbol,
                  assetId: symbol.toLowerCase(),
                  name: balance.name || symbol
                });
              }
            });
          }

          const manualRes = await manualHoldingAPI.getHoldings(portfolio.id).catch(() => null);
          const manualHoldings = manualRes?.holdings || [];
          manualHoldings.forEach((holding) => {
            const symbol = (holding.asset_symbol || holding.symbol || '').toUpperCase();
            if (symbol && !allAssets.has(symbol)) {
              allAssets.set(symbol, {
                symbol,
                assetId: symbol.toLowerCase(),
                name: holding.name || symbol
              });
            }
          });

        } catch (err) {
          console.warn(`Failed to load portfolio ${portfolio.id}:`, err);
        }
      }

      setPortfolioAssets(Array.from(allAssets.values()).sort((a, b) => a.symbol.localeCompare(b.symbol)));
    } catch (err) {
      console.warn('Failed to load portfolio assets:', err);
      setPortfolioAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  };

  const handleCreateAlert = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.assetId || !formData.value) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      const alertData = {
        assetId: formData.assetId.toLowerCase(),
        assetSymbol: formData.assetSymbol.toUpperCase(),
        type: formData.type,
        condition: formData.condition,
        value: parseFloat(formData.value)
      };

      if (formData.type === 'percentage_change') {
        alertData.percentageTimeframe = formData.percentageTimeframe;
      }

      await alertsService.createAlert(alertData);
      setShowCreateModal(false);

      setFormData({
        assetId: '',
        assetSymbol: '',
        type: 'price_target',
        condition: 'above',
        value: '',
        percentageTimeframe: '24h'
      });

      loadAlerts();
      loadPortfolioAssets();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create alert');
    }
  };

  const handleDelete = async (alertId) => {
    if (!window.confirm('Are you sure you want to delete this alert?')) return;
    try {
      await alertsService.deleteAlert(alertId);
      loadAlerts();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to delete alert');
    }
  };

  const handleReset = async (alertId) => {
    try {
      await alertsService.resetAlert(alertId);
      loadAlerts();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to reset alert');
    }
  };

  const handleToggleActive = async (alertId, currentActive) => {
    try {
      await alertsService.updateAlert(alertId, { active: !currentActive });
      loadAlerts();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update alert');
    }
  };

  const handleTestAlert = async (alertId) => {
    try {
      const response = await alertsService.testAlert(alertId);
      const result = response.data.checkResult;

      if (result.triggered) {
        alert(
          `Alert would trigger!\n${result.reason}\nCurrent: ${result.currentValue}\nTarget: ${result.targetValue}`
        );
      } else {
        alert(
          `Alert would not trigger.\n${result.reason || 'Condition not met'}`
        );
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to test alert');
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        (alert.assetId || '').toLowerCase().includes(query) ||
        (alert.assetSymbol || '').toLowerCase().includes(query)
      );
    }
    return true;
  });

  const formatValue = (alert) => {
    if (alert.type === 'price_target') {
      return `$${Number(alert.value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    }
    return `${alert.value}%`;
  };

  const getConditionText = (alert) => {
    if (alert.type === 'price_target') {
      return alert.condition === 'above' ? 'Above' : 'Below';
    }
    return alert.condition === 'increase' ? 'Increase by' : 'Decrease by';
  };

  if (loading) {
    return (
      <div className="page-container">
        <h2>Loading Alerts...</h2>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>Price Alerts {alerts.length ? `(${alerts.length})` : ''}</h1>
        <button className="btn" onClick={() => setShowCreateModal(true)}>
          + Create Alert
        </button>
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className={filter === 'all' ? 'btn' : 'btn btn-ghost'} onClick={() => setFilter('all')}>
          All
        </button>
        <button className={filter === 'active' ? 'btn' : 'btn btn-ghost'} onClick={() => setFilter('active')}>
          Active
        </button>
        <button className={filter === 'triggered' ? 'btn' : 'btn btn-ghost'} onClick={() => setFilter('triggered')}>
          Triggered
        </button>

        <input
          className="filter-input"
          type="text"
          placeholder="Search by asset..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ marginLeft: 'auto', minWidth: '200px' }}
        />
      </div>

      {filteredAlerts.length === 0 && (
        <div className="empty-message">
          {searchQuery ? 'No alerts match your search.' : 'You have no alerts yet. Create one to get started!'}
        </div>
      )}

      <div className="devb-list">
        {filteredAlerts.map((alert) => (
          <div
            key={alert.id}
            className="devb-card"
            style={{
              borderLeft: alert.triggered ? '4px solid #10b981' : '4px solid transparent',
              opacity: alert.active ? 1 : 0.6
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
                  <span className="card-asset-id">{alert.assetSymbol || alert.assetId}</span>

                  {alert.triggered && (
                    <span style={{ background: '#10b981', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                      TRIGGERED
                    </span>
                  )}

                  {!alert.active && (
                    <span style={{ background: '#6b7280', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                      INACTIVE
                    </span>
                  )}
                </div>

                <strong>{alert.type === 'price_target' ? 'Price Target' : 'Percentage Change'}</strong>
                <div style={{ color: '#9ca3af', fontSize: 14 }}>
                  {getConditionText(alert)} {formatValue(alert)}
                  {alert.type === 'percentage_change' && ` (${alert.percentageTimeframe})`}
                </div>

                {alert.triggered && alert.triggeredAt && (
                  <div style={{ color: '#10b981', fontSize: 12, marginTop: 4 }}>
                    Triggered: {new Date(alert.triggeredAt).toLocaleString()}
                  </div>
                )}

                {alert.triggerCount > 0 && (
                  <div style={{ color: '#9ca3af', fontSize: 12 }}>
                    Triggered {alert.triggerCount} time{alert.triggerCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={() => handleTestAlert(alert.id)}>Test</button>

                {alert.triggered && (
                  <button className="btn btn-ghost" onClick={() => handleReset(alert.id)}>Reset</button>
                )}

                <button className="btn btn-ghost" onClick={() => handleToggleActive(alert.id, alert.active)}>
                  {alert.active ? 'Deactivate' : 'Activate'}
                </button>

                <button className="btn-danger" onClick={() => handleDelete(alert.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Alert Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="devb-card"
            style={{
              background: '#1f2937',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Create New Alert</h2>

            <form onSubmit={handleCreateAlert}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  Select Asset from Portfolio {portfolioAssets.length > 0 && `(${portfolioAssets.length} available)`}
                </label>

                {loadingAssets ? (
                  <div className="helper" style={{ padding: '8px' }}>Loading portfolio assets...</div>
                ) : portfolioAssets.length > 0 ? (
                  <select
                    className="filter-input"
                    value={formData.assetSymbol || ''}
                    onChange={(e) => {
                      const selectedAsset = portfolioAssets.find(a => a.symbol === e.target.value);
                      if (selectedAsset) {
                        setFormData({
                          ...formData,
                          assetSymbol: selectedAsset.symbol,
                          assetId: selectedAsset.assetId
                        });
                      }
                    }}
                    required
                  >
                    <option value="">-- Select an asset --</option>
                    {portfolioAssets.map(asset => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.symbol} {asset.name !== asset.symbol ? `(${asset.name})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="helper" style={{ padding: '8px', marginBottom: '8px' }}>
                    No assets found in your portfolios. Add assets to your portfolio first, or enter manually below.
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  Asset ID (e.g., bitcoin, ethereum)
                </label>
                <input
                  type="text"
                  className="filter-input"
                  value={formData.assetId}
                  onChange={(e) => setFormData({ ...formData, assetId: e.target.value })}
                  placeholder="bitcoin"
                  required
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: '600' }}>
                  Asset Symbol (e.g., BTC, ETH)
                </label>
                <input
                  type="text"
                  className="filter-input"
                  value={formData.assetSymbol}
                  onChange={(e) => setFormData({ ...formData, assetSymbol: e.target.value })}
                  placeholder="BTC"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  Alert Type
                </label>
                <select
                  className="filter-input"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value,
                      condition: e.target.value === 'price_target' ? 'above' : 'increase'
                    })
                  }
                >
                  <option value="price_target">Price Target</option>
                  <option value="percentage_change">Percentage Change</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  Condition
                </label>
                <select
                  className="filter-input"
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                >
                  {formData.type === 'price_target' ? (
                    <>
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </>
                  ) : (
                    <>
                      <option value="increase">Increase by</option>
                      <option value="decrease">Decrease by</option>
                    </>
                  )}
                </select>
              </div>

              {formData.type === 'percentage_change' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Timeframe
                  </label>
                  <select
                    className="filter-input"
                    value={formData.percentageTimeframe}
                    onChange={(e) => setFormData({ ...formData, percentageTimeframe: e.target.value })}
                  >
                    <option value="1h">1 Hour</option>
                    <option value="24h">24 Hours</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  {formData.type === 'price_target' ? 'Target Price (USD)' : 'Percentage Threshold (%)'}
                </label>
                <input
                  type="number"
                  className="filter-input"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  placeholder={formData.type === 'price_target' ? '50000' : '5'}
                  step={formData.type === 'price_target' ? '0.01' : '0.1'}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({
                      assetId: '',
                      assetSymbol: '',
                      type: 'price_target',
                      condition: 'above',
                      value: '',
                      percentageTimeframe: '24h'
                    });
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn">
                  Create Alert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
