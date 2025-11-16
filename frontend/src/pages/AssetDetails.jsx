import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { marketApi } from '../services/api_market';

const formatNumber = (num, opts = {}) => {
  if (num == null || isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, ...opts }).format(num);
};

const formatLargeNumber = (num) => {
  if (num == null || isNaN(num)) return '—';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

const CHART_INTERVALS = [
  { label: '1D', value: '1d', binanceInterval: '1h', limit: 24 },
  { label: '1W', value: '1w', binanceInterval: '4h', limit: 42 },
  { label: '1M', value: '1m', binanceInterval: '1d', limit: 30 },
  { label: '3M', value: '3m', binanceInterval: '1d', limit: 90 },
  { label: '1Y', value: '1y', binanceInterval: '1d', limit: 365 },
  { label: 'ALL', value: 'all', binanceInterval: '1w', limit: 520 }
];

export default function AssetDetails() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [assetData, setAssetData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState(CHART_INTERVALS[2]); // Default to 1M
  const [error, setError] = useState('');

  // Fetch asset details
  useEffect(() => {
    const fetchAssetDetails = async () => {
      if (!symbol) return;
      
      setLoading(true);
      setError('');
      
      try {
        const response = await marketApi.getAssetDetails(symbol);
        setAssetData(response.data);
      } catch (err) {
        console.error('Error fetching asset details:', err);
        setError(err.response?.data?.message || 'Failed to load asset details');
      } finally {
        setLoading(false);
      }
    };

    fetchAssetDetails();
  }, [symbol]);

  // Fetch chart data when interval changes
  useEffect(() => {
    const fetchChartData = async () => {
      if (!symbol) return;
      
      setChartLoading(true);
      
      try {
        const response = await marketApi.getAssetChart(
          symbol, 
          selectedInterval.binanceInterval,
          selectedInterval.limit
        );
        
        // Transform data for Recharts
        const transformed = response.data.data.map(candle => ({
          time: new Date(candle.time).toLocaleDateString(),
          price: candle.close,
          timestamp: candle.time
        }));
        
        setChartData(transformed);
      } catch (err) {
        console.error('Error fetching chart data:', err);
        // Don't show error for chart - just leave it empty
        setChartData([]);
      } finally {
        setChartLoading(false);
      }
    };

    if (assetData) {
      fetchChartData();
    }
  }, [symbol, selectedInterval, assetData]);

  if (loading) {
    return (
      <div style={{ padding: 22, maxWidth: 1400, margin: '0 auto' }}>
        <div className="helper">Loading asset details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 22, maxWidth: 1400, margin: '0 auto' }}>
        <div className="card">
          <div className="toast error">{error}</div>
          <button className="btn" onClick={() => navigate('/dashboard')} style={{ marginTop: 12 }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!assetData) return null;

  const { name, logo, description, links, market, tags } = assetData;

  return (
    <div style={{ padding: 22, maxWidth: 1400, margin: '0 auto' }}>
      {/* Back Button */}
      <button 
        className="btn ghost" 
        onClick={() => navigate('/dashboard')}
        style={{ marginBottom: 12 }}
      >
        ← Back to Dashboard
      </button>

      {/* Header Section */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          {logo && (
            <img 
              src={logo} 
              alt={name} 
              style={{ width: 48, height: 48, borderRadius: '50%' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
          <div>
            <h2 style={{ margin: 0 }}>{name} ({symbol})</h2>
            {tags && tags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {tags.slice(0, 5).map((tag, i) => (
                  <span key={i} className="chip" style={{ fontSize: 11 }}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Price and Stats */}
        {market && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <div className="helper">Price</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>
                ${formatNumber(market.price, { maximumFractionDigits: 6 })}
              </div>
              {market.percentChange24h != null && (
                <div style={{ 
                  color: market.percentChange24h >= 0 ? '#4ade80' : '#f87171',
                  fontSize: 14,
                  fontWeight: 600
                }}>
                  {market.percentChange24h >= 0 ? '+' : ''}{market.percentChange24h.toFixed(2)}% (24h)
                </div>
              )}
            </div>
            
            <div>
              <div className="helper">Market Cap</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {formatLargeNumber(market.marketCap)}
              </div>
              {market.marketCapDominance != null && (
                <div className="helper" style={{ fontSize: 12 }}>
                  {market.marketCapDominance.toFixed(2)}% dominance
                </div>
              )}
            </div>

            <div>
              <div className="helper">24h Volume</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {formatLargeNumber(market.volume24h)}
              </div>
              {market.volumeChange24h != null && (
                <div style={{ 
                  color: market.volumeChange24h >= 0 ? '#4ade80' : '#f87171',
                  fontSize: 12
                }}>
                  {market.volumeChange24h >= 0 ? '+' : ''}{market.volumeChange24h.toFixed(2)}%
                </div>
              )}
            </div>

            {market.fullyDilutedValuation != null && (
              <div>
                <div className="helper">Fully Diluted Valuation</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {formatLargeNumber(market.fullyDilutedValuation)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 12 }}>
        {/* Price Chart */}
        <div className="card" style={{ gridColumn: 'span 1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 600 }}>Price Chart</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {CHART_INTERVALS.map((interval) => (
                <button
                  key={interval.value}
                  className={`btn ghost ${selectedInterval.value === interval.value ? 'active' : ''}`}
                  onClick={() => setSelectedInterval(interval)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 13,
                    backgroundColor: selectedInterval.value === interval.value ? 'rgba(106, 163, 255, 0.1)' : 'transparent'
                  }}
                >
                  {interval.label}
                </button>
              ))}
            </div>
          </div>

          {chartLoading ? (
            <div className="helper" style={{ textAlign: 'center', padding: 40 }}>Loading chart...</div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }}
                  tickFormatter={(value, index) => {
                    // Show fewer labels for better readability
                    if (chartData.length > 50 && index % Math.floor(chartData.length / 10) !== 0) return '';
                    return value;
                  }}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }}
                  domain={['auto', 'auto']}
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8
                  }}
                  formatter={(value) => [`$${Number(value).toFixed(6)}`, 'Price']}
                />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#6aa3ff" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="helper" style={{ textAlign: 'center', padding: 40 }}>
              Chart data not available for this asset
            </div>
          )}
        </div>

        {/* Supply Info */}
        {market && (
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Supply Information</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {market.circulatingSupply != null && (
                <div>
                  <div className="helper">Circulating Supply</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {formatNumber(market.circulatingSupply)} {symbol}
                  </div>
                </div>
              )}
              
              {market.totalSupply != null && (
                <div>
                  <div className="helper">Total Supply</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {formatNumber(market.totalSupply)} {symbol}
                  </div>
                </div>
              )}
              
              {market.maxSupply != null ? (
                <div>
                  <div className="helper">Max Supply</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {formatNumber(market.maxSupply)} {symbol}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="helper">Max Supply</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>∞ (No limit)</div>
                </div>
              )}

              {market.percentChange1h != null && (
                <div>
                  <div className="helper">1h Change</div>
                  <div style={{ 
                    fontSize: 16, 
                    fontWeight: 600,
                    color: market.percentChange1h >= 0 ? '#4ade80' : '#f87171'
                  }}>
                    {market.percentChange1h >= 0 ? '+' : ''}{market.percentChange1h.toFixed(2)}%
                  </div>
                </div>
              )}

              {market.percentChange7d != null && (
                <div>
                  <div className="helper">7d Change</div>
                  <div style={{ 
                    fontSize: 16, 
                    fontWeight: 600,
                    color: market.percentChange7d >= 0 ? '#4ade80' : '#f87171'
                  }}>
                    {market.percentChange7d >= 0 ? '+' : ''}{market.percentChange7d.toFixed(2)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* About Section */}
      {description && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>About {name}</div>
          <div 
            className="helper" 
            style={{ lineHeight: 1.6, fontSize: 14 }}
            dangerouslySetInnerHTML={{ __html: description }}
          />
        </div>
      )}

      {/* Links Section */}
      {links && Object.values(links).some(link => link) && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Links</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {links.website && (
              <a href={links.website} target="_blank" rel="noopener noreferrer" className="btn ghost">
                🌐 Website
              </a>
            )}
            {links.whitepaper && (
              <a href={links.whitepaper} target="_blank" rel="noopener noreferrer" className="btn ghost">
                📄 Whitepaper
              </a>
            )}
            {links.twitter && (
              <a href={links.twitter} target="_blank" rel="noopener noreferrer" className="btn ghost">
                🐦 Twitter
              </a>
            )}
            {links.reddit && (
              <a href={links.reddit} target="_blank" rel="noopener noreferrer" className="btn ghost">
                💬 Reddit
              </a>
            )}
            {links.sourceCode && (
              <a href={links.sourceCode} target="_blank" rel="noopener noreferrer" className="btn ghost">
                💻 Source Code
              </a>
            )}
            {links.explorer && (
              <a href={links.explorer} target="_blank" rel="noopener noreferrer" className="btn ghost">
                🔍 Explorer
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
