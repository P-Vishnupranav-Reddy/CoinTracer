import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      if (data.token) {
        localStorage.setItem('token', data.token);
        window.dispatchEvent(new Event('authChanged'));
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card" style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Welcome back to CoinTracer</h2>
        <p style={{ marginTop: 6, color: '#9ca3af', fontSize: 13 }}>Sign in to access your dashboard and portfolios.</p>
      </div>

      {error && <div className="toast error" style={{ marginBottom: 10 }}>{error}</div>}

      <form className="form" onSubmit={handleSubmit}>
        <input className="input" name="email" type="email" placeholder="Email" value={formData.email} onChange={handleChange} required />
        <input className="input" name="password" type="password" placeholder="Password" value={formData.password} onChange={handleChange} required />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <div className="helper">
            <span className="link" onClick={() => navigate('/forgot-password')} style={{ cursor: 'pointer' }}>
              Forgot password?
            </span>
          </div>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}