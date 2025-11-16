import axios from 'axios';

// Dedicated Market Data client (proxied via Vite to port 5001 in dev)
const market = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' }
});

market.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const marketApi = {
  getPrice: (assetId, vs = 'usd') => market.get(`/market/prices/${assetId}`, { params: { vs } }),
  getPricesBatch: (assets = [], vs = 'usd') => market.get('/market/prices/batch', { params: { assets: assets.join(','), vs } }),
  getDashboardSummary: (assets = [], vs = 'usd') => market.get('/dashboard/summary', { params: { assets: assets.join(','), vs } }),
  searchAssets: (query) => market.get('/market/assets/search', { params: { query } }),
  getAssetDetails: (symbol, vs = 'usd') => market.get(`/market/assets/${symbol}/details`, { params: { vs } }),
  getAssetChart: (symbol, interval = '1d', limit = 100) => market.get(`/market/assets/${symbol}/chart`, { params: { interval, limit } }),
  getNews: (options = {}) => market.get('/news', { params: options }),
  getNewsForAsset: (symbol, limit = 20) => market.get(`/news/asset/${symbol}`, { params: { limit } }),
  getNewsSources: () => market.get('/news/sources')
};
