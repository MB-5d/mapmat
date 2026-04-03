import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Loader2, Trash2, User } from 'lucide-react';

import * as api from '../../api';
import AccountDrawer from './AccountDrawer';
import { resolveApiAssetUrl } from '../../utils/assets';

const ProfileDrawer = ({ isOpen, user, onClose, onUpdate, onLogout, showToast }) => {
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const wasOpenRef = useRef(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setName(user?.name || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setDeletePassword('');
      setShowDeleteConfirm(false);
      setError('');
      setSuccess('');
      setLoading(false);
      setAvatarLoading(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, user]);

  const avatarUrl = resolveApiAssetUrl(user?.avatarUrl);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (user?.authMode === 'demo') {
        setError('Demo profile is read-only.');
        setLoading(false);
        return;
      }

      const updateData = {};
      const trimmedName = name.trim();
      if (trimmedName && trimmedName !== user.name) {
        updateData.name = trimmedName;
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
      onUpdate?.(updatedUser);
      setSuccess('Profile updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (updatedUser?.name) setName(updatedUser.name);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setError('Upload a PNG, JPG, or WebP image.');
      return;
    }

    setError('');
    setSuccess('');
    setAvatarLoading(true);

    try {
      const imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });
      const { user: updatedUser } = await api.uploadMyAvatar({ imageDataUrl });
      onUpdate?.(updatedUser);
      setSuccess('Avatar updated');
    } catch (err) {
      setError(err.message || 'Failed to upload avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setError('');
    setSuccess('');
    setAvatarLoading(true);
    try {
      const { user: updatedUser } = await api.removeMyAvatar();
      onUpdate?.(updatedUser);
      setSuccess('Avatar removed');
    } catch (err) {
      setError(err.message || 'Failed to remove avatar');
    } finally {
      setAvatarLoading(false);
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
      if (user?.authMode === 'demo') {
        setError('Demo account cannot be deleted.');
        setLoading(false);
        return;
      }
      await api.deleteAccount(deletePassword);
      showToast?.('Account deleted', 'success');
      onLogout?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to delete account');
      setLoading(false);
    }
  };

  return (
    <AccountDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Profile"
      subtitle="Manage your account"
      className="profile-drawer"
    >
      <div className="account-hero">
        <div className="account-hero-avatar account-hero-avatar-image">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            <User size={20} />
          )}
        </div>
        <div className="account-hero-details">
          <div className="account-hero-name">{user?.name || 'Your account'}</div>
          <div className="account-hero-email">{user?.email || ''}</div>
        </div>
        <div className="account-hero-badge">Active</div>
      </div>

      {!showDeleteConfirm ? (
        <form onSubmit={handleUpdateProfile} className="profile-form">
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <div className="form-section">
            <h4>Profile</h4>
            <div className="profile-avatar-controls">
              <button
                type="button"
                className="modal-btn secondary"
                onClick={() => avatarInputRef.current?.click()}
                disabled={!user || avatarLoading}
              >
                {avatarLoading ? <Loader2 size={18} className="btn-spinner" /> : <ImagePlus size={16} />}
                Upload Avatar
              </button>
              <button
                type="button"
                className="modal-btn secondary"
                onClick={handleRemoveAvatar}
                disabled={!user || avatarLoading || !avatarUrl}
              >
                {avatarLoading ? <Loader2 size={18} className="btn-spinner" /> : <Trash2 size={16} />}
                Remove Avatar
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden-file-input"
                onChange={handleAvatarFile}
              />
            </div>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={!user || loading}
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
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
                disabled={!user || loading}
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
                disabled={!user || loading}
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={!user || loading}
              />
            </div>
          </div>

          <button
            type="submit"
            className="modal-btn primary"
            disabled={loading || !user}
          >
            {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
            Save Changes
          </button>

          <div className="form-section danger-zone">
            <h4>Delete account</h4>
            <p>Deleting your account will permanently remove all your projects, maps, and data.</p>
            <button
              type="button"
              className="modal-btn danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading || !user}
            >
              Delete Account
            </button>
          </div>
        </form>
      ) : (
        <div className="account-danger">
          <div className="account-danger-header">
            <AlertTriangle size={36} />
            <div>
              <div className="account-danger-title">Delete Account?</div>
              <div className="account-danger-subtitle">
                This action cannot be undone. All projects, maps, and scan history will be deleted.
              </div>
            </div>
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
              disabled={loading}
            />
          </div>
          <div className="account-danger-actions">
            <button
              type="button"
              className="modal-btn danger"
              onClick={handleDeleteAccount}
              disabled={loading || !deletePassword}
            >
              {loading ? <Loader2 size={18} className="btn-spinner" /> : null}
              Yes, Delete My Account
            </button>
            <button
              type="button"
              className="modal-btn secondary"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletePassword('');
                setError('');
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </AccountDrawer>
  );
};

export default ProfileDrawer;
