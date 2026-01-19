import React, { useState } from 'react';
import { AlertTriangle, Loader2, User, X } from 'lucide-react';

import * as api from '../../api';

const ProfileModal = ({ user, onClose, onUpdate, onLogout, showToast }) => {
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const updateData = {};
      if (name !== user.name) {
        updateData.name = name;
      }
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          setError('New passwords do not match');
          setLoading(false);
          return;
        }
        if (!currentPassword) {
          setError('Current password is required to change password');
          setLoading(false);
          return;
        }
        updateData.currentPassword = currentPassword;
        updateData.newPassword = newPassword;
      }

      if (Object.keys(updateData).length === 0) {
        setLoading(false);
        return;
      }

      const { user: updatedUser } = await api.updateProfile(updateData);
      onUpdate(updatedUser);
      setSuccess('Profile updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setError('Password is required to delete account');
      return;
    }
    setLoading(true);
    setError('');

    try {
      await api.deleteAccount(deletePassword);
      showToast('Account deleted', 'success');
      onLogout();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete account');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-md modal-scrollable profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header-media">
          <div className="modal-header-media-icon">
            <User size={32} />
          </div>
          <div className="modal-header-media-content">
            <h3 className="modal-header-media-title">{user?.name}</h3>
            <span className="modal-header-media-subtitle">{user?.email}</span>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          {!showDeleteConfirm ? (
            <form onSubmit={handleUpdateProfile} className="profile-form">
              {error && <div className="auth-error">{error}</div>}
              {success && <div className="auth-success">{success}</div>}

              <div className="form-section">
                <h4>Profile</h4>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </div>

              <div className="form-section">
                <h4>Change Password</h4>
                <div className="form-group">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    minLength={6}
                  />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="modal-btn primary"
                disabled={loading}
              >
                {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
                Save Changes
              </button>

              <div className="form-section danger-zone">
                <h4>Danger Zone</h4>
                <p>Deleting your account will permanently remove all your projects, maps, and data.</p>
                <button
                  type="button"
                  className="modal-btn danger"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete Account
                </button>
              </div>
            </form>
          ) : (
            <div className="delete-confirm">
              <div className="delete-warning">
                <AlertTriangle size={48} />
                <h4>Delete Account?</h4>
                <p>This action cannot be undone. All your projects, maps, and scan history will be permanently deleted.</p>
              </div>

              {error && <div className="auth-error">{error}</div>}

              <div className="form-group">
                <label>Enter your password to confirm</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  autoFocus
                />
              </div>

              <div className="delete-actions">
                <button
                  className="modal-btn danger"
                  onClick={handleDeleteAccount}
                  disabled={loading || !deletePassword}
                >
                  {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
                  Yes, Delete My Account
                </button>
                <button
                  className="modal-btn secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword('');
                    setError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
