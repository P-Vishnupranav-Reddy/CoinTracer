import axios from 'axios';

// Base is relative; vite proxy will direct to the right backend
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const exchangeApi = {
  // Portfolios
  createPortfolio: (name, description) => api.post('/portfolios', { name, description }),
  getPortfolios: () => api.get('/portfolios'),
  getPortfolio: (portfolioId) => api.get(`/portfolios/${portfolioId}`),
  updatePortfolio: (portfolioId, name, description) => api.put(`/portfolios/${portfolioId}`, { name, description }),
  deletePortfolio: (portfolioId) => api.delete(`/portfolios/${portfolioId}`),
  getAllocation: (portfolioId) => api.get(`/portfolios/${portfolioId}/allocation`),
  exportCSV: (portfolioId) => api.get(`/portfolios/${portfolioId}/export/csv`, { responseType: 'blob' }),
  getPortfolioWithPnL: (portfolioId) => api.get(`/portfolios/${portfolioId}/pnl`),
  getTransactionsByType: (portfolioId, type) => api.get(`/portfolios/${portfolioId}/transactions/filter`, { params: { type } }),
  getConversionHistory: (portfolioId, limit = 100) => api.get(`/portfolios/${portfolioId}/conversions`, { params: { limit } }),
  getSpotTradingHistory: (portfolioId, limit = 100) => api.get(`/portfolios/${portfolioId}/spot-trades`, { params: { limit } }),

  // Transactions
  getTransactions: (portfolioId, params) => api.get(`/portfolios/${portfolioId}/transactions`, { params }),
  addTransaction: (portfolioId, data) => api.post(`/portfolios/${portfolioId}/transactions`, data),
  updateTransaction: (portfolioId, transactionId, data) => api.put(`/portfolios/${portfolioId}/transactions/${transactionId}`, data),
  deleteTransaction: (portfolioId, transactionId) => api.delete(`/portfolios/${portfolioId}/transactions/${transactionId}`),

  // Exchanges
  getSupportedExchanges: () => api.get('/exchanges/supported-exchanges'),
  connectExchange: (data) => api.post('/exchanges/connections', data),
  getConnections: () => api.get('/exchanges/connections'),
  disconnectExchange: (connectionId) => api.delete(`/exchanges/connections/${connectionId}`),
  syncExchange: (connectionId) => api.post(`/exchanges/connections/${connectionId}/sync`),
  getSyncStatus: (connectionId) => api.get(`/exchanges/connections/${connectionId}/status`),
  getExchangeBalances: (connectionId) => api.get(`/exchanges/connections/${connectionId}/balances`),
  getAveragePrices: (connectionId) => api.get(`/exchanges/connections/${connectionId}/average-prices`),
  getBreakevenPrices: (connectionId) => api.get(`/exchanges/connections/${connectionId}/breakeven-prices`),
};
