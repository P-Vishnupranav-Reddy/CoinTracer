import axios from 'axios';

// Alerts service client (proxied via Vite to port 5002 in dev)
const alertsApi = axios.create({
  baseURL: '/api/v1/alerts',
  headers: { 'Content-Type': 'application/json' }
});

// Add auth token to requests
alertsApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const alertsService = {
  // Get all alerts
  getAlerts: (params = {}) => alertsApi.get('', { params }),

  // Get a specific alert
  getAlert: (alertId) => alertsApi.get(`/${alertId}`),

  // Create alert
  createAlert: (alertData) => alertsApi.post('', alertData),

  // Update alert
  updateAlert: (alertId, updateData) => alertsApi.put(`/${alertId}`, updateData),

  // Delete alert
  deleteAlert: (alertId) => alertsApi.delete(`/${alertId}`),

  // Reset triggered alert
  resetAlert: (alertId) => alertsApi.post(`/${alertId}/reset`),

  // Test alert (check if it would trigger without saving)
  testAlert: (alertId) => alertsApi.post(`/${alertId}/test`)
};
