import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Register() {
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
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');
      if (data.token) {
        // Persist token and notify app header/auth listeners (same-tab updates)
        localStorage.setItem('token', data.token);
        window.dispatchEvent(new Event('authChanged'));
        navigate('/dashboard');
      } else {
        // If backend doesn't return a token on signup, send user to login
        navigate('/login');
      }
    } catch (err) {
      setError(err.message || 'Registration error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card" style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Create your CoinTracer account</h2>
        <p style={{ marginTop: 6, color: '#9ca3af', fontSize: 13 }}>Secure sign up — get started tracking crypto.</p>
      </div>

      {error && <div className="toast error" style={{ marginBottom: 10 }}>{error}</div>}

      <form className="form" onSubmit={handleSubmit}>
        <input className="input" name="email" type="email" placeholder="Email" value={formData.email} onChange={handleChange} required />
        <input className="input" name="password" type="password" placeholder="Password (min 8 chars)" value={formData.password} onChange={handleChange} minLength={8} required />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <div className="helper">By creating an account you agree to our <span className="link">terms</span>.</div>
          <button className="btn" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
        </div>
      </form>
    </div>
  );
}