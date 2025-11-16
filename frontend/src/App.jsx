import React from 'react';
// 1. Import router components we will need
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';

// 2. Import Dev A's components
import Header from './components/Header';
import Footer from './components/Footer';
import Register from './components/Register';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';

// 3. Import Your new pages
import { FavoritesPage } from './pages/FavoritesPage';
import { ExchangeConnections } from './pages/ExchangeConnections';
import { Transactions } from './pages/Transactions';
import Profile from './pages/Profile';
import { NewsPage } from './pages/NewsPage';
import AssetDetails from './pages/AssetDetails';

// 4. (Helper) Auth Layout
// This is Dev A's original split-screen layout.
// It will now ONLY be used for the /login and /register pages.
const AuthLayout = () => (
  <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
    <div className="app-shell" style={{ width: '100%', maxWidth: 1100, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      {/* Left Side: Marketing */}
      <div className="app-hero">
        <div className="brand">
          <div className="logo">CT</div>
          <div>
            <div className="app-title">CoinTracer</div>
            <div className="app-sub">Track, analyze and visualize crypto holdings effortlessly. Secure auth that unblocks the team.</div>
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <h3 style={{ margin: 0 }}>Why CoinTracer?</h3>
          <p className="helper" style={{ maxWidth: 520 }}>
            Lightweight, secure authentication to protect user data while enabling rapid product development.
          </p>
        </div>
      </div>

      {/* Right Side: The Page (Login or Register) */}
      <div>
        <Outlet /> {/* <Outlet> will render either <Login> or <Register> */}
      </div>
    </div>
  </main>
);

// 5. (Helper) Protected Routes
// Checks token presence AND validity (exp) to avoid stale sessions.
const ProtectedRoutes = () => {
  const token = localStorage.getItem('token');

  const isTokenValid = () => {
    if (!token) return false;
    try {
      const [, payloadB64] = token.split('.');
      if (!payloadB64) return false;
      const payload = JSON.parse(atob(payloadB64));
      // exp is in seconds; compare to current time (seconds)
      if (payload?.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const ok = isTokenValid();
  if (!ok) {
    // Clear any stale/invalid token before redirect
    if (token) {
      try { 
        localStorage.removeItem('token'); 
      } catch (e) {
        console.error('Failed to remove token:', e);
      }
      window.dispatchEvent(new Event('authChanged'));
    }
    return <Navigate to="/login" replace />;
  }

  return (
    <main style={{ flex: 1, padding: '2rem 1rem' }}>
      <Outlet />
    </main>
  );
};

// 6. The Main App Component
export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      
      <Routes>
        {/* Default route should land on Login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        {/* --- Public Auth Routes --- */}
        {/* These routes use the special 'AuthLayout' */}
        <Route element={<AuthLayout />}>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>

        {/* --- Protected App Routes --- */}
        {/* These routes are protected and use the full-width layout */}
        <Route element={<ProtectedRoutes />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/asset/:symbol" element={<AssetDetails />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/news" element={<NewsPage/>}/>
          <Route path="/exchanges" element={<ExchangeConnections />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        {/* --- Catch-all (404) --- */}
        {/* If no route matches, redirect to Login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      
      <Footer />
    </div>
  );
}

