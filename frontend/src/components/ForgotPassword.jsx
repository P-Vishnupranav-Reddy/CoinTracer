import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to request password reset');
      }

      // Show success message with console reminder
      setMessage('Password reset requested. Check the server console (user-service terminal) for your reset link.');
      
      // Log the reset token for development
      if (data.resetToken) {
        console.log('Reset token:', data.resetToken);
        console.log('You can use this link:', `http://localhost:5173/reset-password?token=${data.resetToken}`);
      }

    } catch (err) {
      setError(err.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card" style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Forgot Password</h2>
        <p style={{ marginTop: 6, color: '#9ca3af', fontSize: 13 }}>
          Enter your email address to request a password reset. Check the server console for the reset link.
        </p>
      </div>

      {error && <div className="toast error" style={{ marginBottom: 10 }}>{error}</div>}
      {message && <div className="toast" style={{ marginBottom: 10, background: '#10b981', color: 'white' }}>{message}</div>}

      <form className="form" onSubmit={handleSubmit}>
        <input
          className="input"
          name="email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/login')}
            style={{ background: 'transparent', border: '1px solid #374151' }}
          >
            Back to Login
          </button>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </div>
      </form>
    </div>
  );
}
