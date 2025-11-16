import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const res = await fetch('/api/v1/auth/profile', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('token');
          window.dispatchEvent(new Event('authChanged'));
          navigate('/login');
          return;
        }
        throw new Error(data.message || 'Failed to fetch profile');
      }

      setUser(data.user);
      setEditForm({
        name: data.user.name || '',
        birthday: data.user.birthday || '',
        phone_number: data.user.phone_number || '',
        country: data.user.country || '',
      });
    } catch (err) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      // Reset form to current user data
      setEditForm({
        name: user.name || '',
        birthday: user.birthday || '',
        phone_number: user.phone_number || '',
        country: user.country || '',
      });
    }
    setIsEditing(!isEditing);
    setSuccessMessage('');
  };

  const handleInputChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/auth/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to update profile');
      }

      setUser(data.user);
      setIsEditing(false);
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Please enter your password to confirm');
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/auth/account', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: deletePassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete account');
      }

      // Clear token and redirect to login
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('authChanged'));
      navigate('/login');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem' }}>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem' }}>
        <div className="toast error">{error}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 24 }}>Profile</h1>
        <button
          className="btn"
          onClick={handleEditToggle}
          style={{ background: isEditing ? 'transparent' : '#3b82f6', border: isEditing ? '1px solid #374151' : 'none' }}
        >
          {isEditing ? 'Cancel' : 'Edit Profile'}
        </button>
      </div>

      {successMessage && (
        <div className="toast success" style={{ marginBottom: '1rem' }}>
          {successMessage}
        </div>
      )}

      {/* Profile Information Card */}
      <div style={{
        background: '#1f2937',
        borderRadius: 8,
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid #374151'
      }}>
        <h2 style={{ fontSize: 18, marginBottom: '1rem' }}>Account Information</h2>
        
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
              Email
            </label>
            <div style={{ fontSize: 15 }}>{user?.email || 'N/A'}</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
              Name
            </label>
            {isEditing ? (
              <input
                className="input"
                type="text"
                value={editForm.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Your name"
              />
            ) : (
              <div style={{ fontSize: 15 }}>{user?.name || 'Not set'}</div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
              Birthday
            </label>
            {isEditing ? (
              <input
                className="input"
                type="date"
                value={editForm.birthday}
                onChange={(e) => handleInputChange('birthday', e.target.value)}
              />
            ) : (
              <div style={{ fontSize: 15 }}>
                {user?.birthday ? new Date(user.birthday).toLocaleDateString() : 'Not set'}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
              Phone Number
            </label>
            {isEditing ? (
              <input
                className="input"
                type="tel"
                value={editForm.phone_number}
                onChange={(e) => handleInputChange('phone_number', e.target.value)}
                placeholder="Your phone number"
              />
            ) : (
              <div style={{ fontSize: 15 }}>{user?.phone_number || 'Not set'}</div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
              Country
            </label>
            {isEditing ? (
              <input
                className="input"
                type="text"
                value={editForm.country}
                onChange={(e) => handleInputChange('country', e.target.value)}
                placeholder="Your country"
              />
            ) : (
              <div style={{ fontSize: 15 }}>{user?.country || 'Not set'}</div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
              Member Since
            </label>
            <div style={{ fontSize: 15 }}>
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
              User ID
            </label>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#9ca3af' }}>
              {user?.id || 'N/A'}
            </div>
          </div>
        </div>

        {isEditing && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #374151' }}>
            <button
              className="btn"
              onClick={handleSaveProfile}
              disabled={saving}
              style={{ background: '#10b981', border: 'none' }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Danger Zone Card */}
      <div style={{
        background: '#1f2937',
        borderRadius: 8,
        padding: '1.5rem',
        border: '1px solid #ef4444'
      }}>
        <h2 style={{ fontSize: 18, marginBottom: '0.5rem', color: '#ef4444' }}>Danger Zone</h2>
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: '1rem' }}>
          Once you delete your account, there is no going back. This will permanently delete all your data including portfolios, transactions, and exchange connections.
        </p>
        
        <button
          className="btn"
          onClick={() => setShowDeleteModal(true)}
          style={{ background: '#ef4444', border: 'none' }}
        >
          Delete Account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#1f2937',
            borderRadius: 8,
            padding: '2rem',
            maxWidth: 480,
            width: '90%',
            border: '1px solid #374151',
          }}>
            <h2 style={{ fontSize: 20, marginBottom: '1rem', color: '#ef4444' }}>
              Confirm Account Deletion
            </h2>
            <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: '1rem' }}>
              This action cannot be undone. All your data will be permanently deleted.
            </p>
            <p style={{ fontSize: 14, marginBottom: '1rem' }}>
              Please enter your password to confirm:
            </p>

            {deleteError && (
              <div className="toast error" style={{ marginBottom: '1rem' }}>
                {deleteError}
              </div>
            )}

            <input
              className="input"
              type="password"
              placeholder="Enter your password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              style={{ marginBottom: '1rem' }}
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setDeleteError('');
                }}
                style={{ background: 'transparent', border: '1px solid #374151' }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleDeleteAccount}
                style={{ background: '#ef4444', border: 'none' }}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
