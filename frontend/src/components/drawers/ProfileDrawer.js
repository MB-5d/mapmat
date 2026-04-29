import React, { useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { AlertTriangle, ImagePlus, PencilLine, Trash2, User } from 'lucide-react';

import * as api from '../../api';
import AccountDrawer from './AccountDrawer';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';
import TextInput from '../ui/TextInput';
import { createCroppedAvatarDataUrl } from '../../utils/avatarCrop';
import { resolveApiAssetUrl } from '../../utils/assets';

const AVATAR_SOURCE_MAX_BYTES = 8 * 1024 * 1024;

const ProfileDrawer = ({ isOpen, user, onClose, onUpdate, onLogout, showToast }) => {
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState('');
  const [avatarCrop, setAvatarCrop] = useState({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarCropPixels, setAvatarCropPixels] = useState(null);
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
      setAvatarCropSrc('');
      setAvatarCrop({ x: 0, y: 0 });
      setAvatarZoom(1);
      setAvatarCropPixels(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, user]);

  const avatarUrl = resolveApiAssetUrl(user?.avatarUrl);
  const avatarInitial = String(user?.name || user?.email || 'A').trim().charAt(0).toUpperCase();
  const hasPassword = !!user?.hasPassword;
  const hasAvatar = !!avatarUrl;

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
        if (hasPassword && !currentPassword) {
          setError('Current password is required to change password');
          setLoading(false);
          return;
        }
        if (currentPassword) {
          updateData.currentPassword = currentPassword;
        }
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

  const resetAvatarCrop = () => {
    setAvatarCrop({ x: 0, y: 0 });
    setAvatarZoom(1);
    setAvatarCropPixels(null);
  };

  const openAvatarCrop = (src) => {
    resetAvatarCrop();
    setAvatarCropSrc(src);
  };

  const handleAvatarEditClick = () => {
    if (hasAvatar) {
      openAvatarCrop(avatarUrl);
      return;
    }
    avatarInputRef.current?.click();
  };

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setError('Upload a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > AVATAR_SOURCE_MAX_BYTES) {
      setError('Choose an avatar image under 8 MB.');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });
      openAvatarCrop(imageDataUrl);
    } catch (err) {
      setError(err.message || 'Failed to read avatar image');
    }
  };

  const handleSaveAvatarCrop = async () => {
    setError('');
    setSuccess('');
    setAvatarLoading(true);

    try {
      const imageDataUrl = await createCroppedAvatarDataUrl(avatarCropSrc, avatarCropPixels);
      const { user: updatedUser } = await api.uploadMyAvatar({ imageDataUrl });
      onUpdate?.(updatedUser);
      setSuccess('Avatar updated');
      setAvatarCropSrc('');
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
    if (hasPassword && !deletePassword) {
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
        <button
          type="button"
          className="account-hero-avatar-edit"
          onClick={handleAvatarEditClick}
          disabled={!user || avatarLoading}
          aria-label={hasAvatar ? 'Edit avatar' : 'Upload avatar'}
        >
          <Avatar
            className="account-hero-avatar account-hero-avatar-image"
            src={avatarUrl}
            label={avatarInitial}
            icon={<User size={20} />}
            size="lg"
            shape="circle"
            aria-hidden="true"
          />
          <span className="account-hero-avatar-edit-icon" aria-hidden="true">
            <PencilLine size={13} />
          </span>
        </button>
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
            <div className="profile-avatar-controls">
              <Button
                type="button"
                variant="secondary"
                onClick={() => avatarInputRef.current?.click()}
                disabled={!user || avatarLoading}
                loading={avatarLoading}
              >
                {!avatarLoading ? <ImagePlus size={16} /> : null}
                {hasAvatar ? 'Change Avatar' : 'Upload Avatar'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemoveAvatar}
                disabled={!user || avatarLoading || !avatarUrl}
                loading={avatarLoading}
              >
                {!avatarLoading ? <Trash2 size={16} /> : null}
                Remove Avatar
              </Button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden-file-input"
                onChange={handleAvatarFile}
              />
            </div>
            <Field label="Username">
              <TextInput
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your username"
                disabled={!user || loading}
              />
            </Field>
            <Field label="Email">
              <TextInput
                type="email"
                value={user?.email || ''}
                disabled
              />
            </Field>
          </div>

          <div className="form-section">
            <h4>{hasPassword ? 'Change Password' : 'Set Password'}</h4>
            {!hasPassword ? (
              <p className="field-hint">You signed in without a password. Set one here if you want email/password login too.</p>
            ) : null}
            {hasPassword ? (
              <Field label="Current Password">
                <TextInput
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  disabled={!user || loading}
                />
              </Field>
            ) : null}
            <Field label="New Password">
              <TextInput
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                minLength={6}
                disabled={!user || loading}
              />
            </Field>
            <Field label="Confirm New Password">
              <TextInput
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={!user || loading}
              />
            </Field>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={loading || !user}
            loading={loading}
          >
            Save Changes
          </Button>

          <div className="form-section danger-zone">
            <h4>Delete account</h4>
            <p>Deleting your account will permanently remove all your projects, maps, and data.</p>
            <Button
              type="button"
              variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading || !user}
            >
              Delete Account
            </Button>
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
          {hasPassword ? (
            <Field label="Enter your password to confirm">
              <TextInput
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                autoFocus
                disabled={loading}
              />
            </Field>
          ) : (
            <div className="field-hint">This account does not have a password yet. You can delete it from your current signed-in session.</div>
          )}
          <div className="account-danger-actions">
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteAccount}
              disabled={loading || (hasPassword && !deletePassword)}
              loading={loading}
            >
              Yes, Delete My Account
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletePassword('');
                setError('');
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <Modal
        show={!!avatarCropSrc}
        onClose={() => !avatarLoading && setAvatarCropSrc('')}
        title={hasAvatar ? 'Crop Avatar' : 'Upload Avatar'}
        subtitle="Position your image inside the circle."
        size="sm"
        className="avatar-crop-modal"
        bodyClassName="avatar-crop-modal-body"
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAvatarCropSrc('')}
              disabled={avatarLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveAvatarCrop}
              disabled={!avatarCropPixels || avatarLoading}
              loading={avatarLoading}
            >
              Save Avatar
            </Button>
          </>
        )}
      >
        <div className="avatar-crop-stage">
          <Cropper
            image={avatarCropSrc}
            crop={avatarCrop}
            zoom={avatarZoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            objectFit="cover"
            onCropChange={setAvatarCrop}
            onZoomChange={setAvatarZoom}
            onCropComplete={(_, croppedAreaPixels) => setAvatarCropPixels(croppedAreaPixels)}
          />
        </div>
        <Field label="Zoom">
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={avatarZoom}
            onChange={(event) => setAvatarZoom(Number(event.target.value))}
            className="avatar-crop-zoom"
            disabled={avatarLoading}
          />
        </Field>
      </Modal>
    </AccountDrawer>
  );
};

export default ProfileDrawer;
