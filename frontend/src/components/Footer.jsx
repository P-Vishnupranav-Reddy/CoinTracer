import React from 'react';

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '24px 0', marginTop: 'auto', background: 'rgba(10,14,26,0.4)' }}>
      <div style={{ width: 'min(1400px, 95vw)', margin: '0 auto', color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
        © {new Date().getFullYear()} CoinTracer — Professional cryptocurrency portfolio tracking and management.
      </div>
    </footer>
  );
}