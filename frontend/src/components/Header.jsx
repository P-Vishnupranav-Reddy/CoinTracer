import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { GlobalSearchBar } from './GlobalSearchBar';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  useEffect(() => {
    const syncAuth = () => setIsLoggedIn(!!localStorage.getItem('token'));
    window.addEventListener('storage', syncAuth);
    window.addEventListener('authChanged', syncAuth);
    return () => {
      window.removeEventListener('storage', syncAuth);
      window.removeEventListener('authChanged', syncAuth);
    };
  }, []);
  return (
    <header style={{ background: 'rgba(10,14,26,0.8)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
      <div style={{ width: 'min(1400px, 95vw)', margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
          <div className="logo" style={{ width: 44, height: 44, borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>CT</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>CoinTracer</div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAuthPage ? (
            // Always show logged-out header actions on auth pages
            <>
              <Link to="/login" className="link" style={{ padding: '8px 12px' }}>Sign in</Link>
              <Link to="/register" className="btn" style={{ padding: '8px 12px' }}>Get started</Link>
            </>
          ) : isLoggedIn ? (
            <>
              <div style={{ minWidth: 280 }}>
                <GlobalSearchBar />
              </div>
              <Link to="/dashboard" className="link" style={{ padding: '8px 12px' }}>Dashboard</Link>
              <Link to="/favorites" className="link" style={{ padding: '8px 12px' }}>Favorites</Link>
              <Link to="/transactions" className="link" style={{ padding: '8px 12px' }}>Transactions</Link>
              <Link to="/exchanges" className="link" style={{ padding: '8px 12px' }}>Exchanges</Link>
              <Link to="/profile" className="link" style={{ padding: '8px 12px' }}>Profile</Link>
              <Link to="/news" className="link" style={{padding:'8px 12px'}}>News</Link>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  try { 
                    localStorage.removeItem('token'); 
                  } catch (e) {
                    console.error('Failed to remove token:', e);
                  }
                  window.dispatchEvent(new Event('authChanged'));
                  navigate('/login');
                }}
                style={{ padding: '8px 12px' }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="link" style={{ padding: '8px 12px' }}>Sign in</Link>
              <Link to="/register" className="btn" style={{ padding: '8px 12px' }}>Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}