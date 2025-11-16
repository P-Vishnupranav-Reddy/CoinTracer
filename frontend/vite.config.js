import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API requests to user-service (port 3001)
      '/api/v1/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Market data service (port 5001)
      '/api/v1/market': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      // News service (market-data-service on port 5001)
      '/api/v1/news': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/api/v1/dashboard': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      // Portfolio + Exchanges to exchange_connections (port 5000)
      '/api/v1/portfolios': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/api/v1/exchanges': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Optional: Personalization through proxy (otherwise uses absolute URL in api_devB)
      '/api/v1/favorites': {
        target: 'http://localhost:3004',
        changeOrigin: true,
      },
    },
  },
})
