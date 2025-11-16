import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to reset password');
      }

      setMessage(data.message);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);

    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Invalid Reset Link</h2>
          <p style={{ marginTop: 6, color: '#9ca3af', fontSize: 13 }}>
            This password reset link is invalid or has expired.
          </p>
        </div>
        <button className="btn" onClick={() => navigate('/forgot-password')}>
          Request New Reset Link
        </button>
      </div>
    );
  }

  return (
    <div className="auth-card" style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Reset Password</h2>
        <p style={{ marginTop: 6, color: '#9ca3af', fontSize: 13 }}>
          Enter your new password below.
        </p>
      </div>

      {error && <div className="toast error" style={{ marginBottom: 10 }}>{error}</div>}
      {message && (
        <div className="toast" style={{ marginBottom: 10, background: '#10b981', color: 'white' }}>
          {message} Redirecting to login...
        </div>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <input
          className="input"
          name="password"
          type="password"
          placeholder="New Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <input
          className="input"
          name="confirmPassword"
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
        />
        
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/login')}
            style={{ background: 'transparent', border: '1px solid #374151' }}
          >
            Cancel
          </button>
          <button className="btn" type="submit" disabled={loading || !token}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
