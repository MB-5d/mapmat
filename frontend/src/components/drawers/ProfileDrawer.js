import React, { useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { AlertTriangle, ExternalLink, Eye, EyeOff, ImagePlus, Infinity as InfinityIcon, Trash2, User } from 'lucide-react';

import * as api from '../../api';
import AccountDrawer from './AccountDrawer';
import Accordion from '../ui/Accordion';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { EditIcon } from '../ui/icons';
import Field from '../ui/Field';
import Modal from '../ui/Modal';
import TextInput from '../ui/TextInput';
import { createCroppedAvatarDataUrl } from '../../utils/avatarCrop';
import { resolveApiAssetUrl } from '../../utils/assets';
import classNames from '../../utils/classNames';
import { MIN_PASSWORD_LENGTH } from '../../utils/constants';

const AVATAR_SOURCE_MAX_BYTES = 8 * 1024 * 1024;

function hasUsageValue(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function formatUsageNumber(value) {
  if (!hasUsageValue(value)) return '--';
  return Number(value || 0).toLocaleString();
}

function getRemainingUsageValue(item) {
  if (!item) return 0;
  if (item.remaining !== null && item.remaining !== undefined) {
    return Math.max(0, Number(item.remaining || 0));
  }
  const included = Number(item.included ?? item.limit ?? 0);
  const extra = Number(item.grantRemaining ?? item.grantExtra ?? 0);
  return Math.max(0, included + extra - Number(item.used || 0));
}

function isTrialEnded(entitlements) {
  const trial = entitlements?.trial;
  if (!trial || trial.active || trial.state !== 'active' || !trial.endsAt) return false;
  const endsAt = new Date(trial.endsAt);
  return Number.isFinite(endsAt.getTime()) && endsAt.getTime() <= Date.now();
}

function getAvailableUsageValue(item) {
  if (!item) return null;
  if (item.unlimited) return 'unlimited';
  const canDeriveRemaining = hasUsageValue(item.remaining)
    || hasUsageValue(item.included)
    || hasUsageValue(item.limit)
    || hasUsageValue(item.grantRemaining)
    || hasUsageValue(item.grantExtra)
    || hasUsageValue(item.used);
  return canDeriveRemaining ? getRemainingUsageValue(item) : null;
}

function UsageAmount({ value }) {
  if (value === 'unlimited') {
    return (
      <span className="account-usage-infinity" aria-label="Unlimited" title="Unlimited">
        <InfinityIcon size={14} aria-hidden="true" />
      </span>
    );
  }
  return <span>{formatUsageNumber(value)}</span>;
}

function formatStatusLabel(value) {
  return String(value || 'active')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPlanStatusBadge({ accountState, entitlements, isArchived, trialEnded }) {
  if (isArchived) return { label: 'Archived', style: 'warning' };
  if (trialEnded) return { label: 'Trial ended', style: 'warning' };
  if (entitlements?.trial?.active) return { label: 'Trial', style: 'info' };
  if (String(accountState || '').toLowerCase() === 'active') return { label: 'Active', style: 'success' };
  return { label: formatStatusLabel(accountState), style: 'neutral' };
}

const ProfileDrawer = ({
  isOpen,
  user,
  onClose,
  onUpdate,
  onLogout,
  onOpenPlans,
  onOpenBilling,
  billingLoading = false,
  showToast,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visiblePasswordFields, setVisiblePasswordFields] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState('');
  const [avatarCrop, setAvatarCrop] = useState({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarCropPixels, setAvatarCropPixels] = useState(null);
  const [pendingAvatarDataUrl, setPendingAvatarDataUrl] = useState('');
  const [pendingAvatarRemoved, setPendingAvatarRemoved] = useState(false);
  const [openProfileAccordion, setOpenProfileAccordion] = useState('plan');
  const [activeProfileField, setActiveProfileField] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const wasOpenRef = useRef(false);
  const initializedUserIdRef = useRef(null);
  const avatarInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);

  useEffect(() => {
    const userId = user?.id || null;
    if (isOpen && (!wasOpenRef.current || (userId && initializedUserIdRef.current !== userId))) {
      setName(user?.name || '');
      setEmail(user?.email || '');
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
      setPendingAvatarDataUrl('');
      setPendingAvatarRemoved(false);
      setOpenProfileAccordion('plan');
      setActiveProfileField(null);
      initializedUserIdRef.current = userId;
    }
    if (!isOpen) {
      initializedUserIdRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, user?.email, user?.id, user?.name]);

  const avatarUrl = resolveApiAssetUrl(user?.avatarUrl);
  const avatarInitial = String(user?.name || user?.email || 'A').trim().charAt(0).toUpperCase();
  const hasPassword = !!user?.hasPassword;
  const avatarSource = user?.avatarSource || (user?.avatarUrl ? 'custom' : null);
  const hasCustomAvatar = user?.hasCustomAvatar !== undefined
    ? Boolean(user.hasCustomAvatar)
    : avatarSource === 'custom';
  const hasPendingAvatarChange = Boolean(pendingAvatarDataUrl || pendingAvatarRemoved);
  const displayAvatarUrl = pendingAvatarRemoved ? '' : (pendingAvatarDataUrl || avatarUrl);
  const hasDisplayAvatar = !!displayAvatarUrl;
  const canRemoveAvatar = Boolean(pendingAvatarDataUrl || hasCustomAvatar);
  const entitlements = user?.entitlements || null;
  const planName = entitlements?.plan?.name || 'Free';
  const accountState = entitlements?.account?.state || 'active';
  const isArchived = entitlements?.archived;
  const trialEnded = isTrialEnded(entitlements);
  const planStatus = getPlanStatusBadge({ accountState, entitlements, isArchived, trialEnded });
  const isPrimaryBillingOwner = !entitlements?.account?.ownerUserId
    || entitlements.account.ownerUserId === user?.id;
  const accountRole = String(entitlements?.account?.membershipRole || '').trim().toLowerCase();
  const canViewPlanDetails = isPrimaryBillingOwner || accountRole === 'owner' || accountRole === 'editor';
  const planDetailsOpen = openProfileAccordion === 'plan';
  const profileDetailsOpen = openProfileAccordion === 'profile';
  const passwordDetailsOpen = openProfileAccordion === 'password';
  const deleteDetailsOpen = openProfileAccordion === 'delete';
  const usageRows = [
    { label: 'Editors', item: entitlements?.limits?.editors || entitlements?.limits?.seats },
    { label: 'Projects', item: entitlements?.limits?.activeProjects },
    { label: 'Maps', item: entitlements?.limits?.activeMaps || entitlements?.meters?.activeMaps },
    { label: 'Pages', item: entitlements?.meters?.activePages || entitlements?.meters?.crawlPages },
    { label: 'Downloads', item: entitlements?.meters?.downloads || entitlements?.meters?.organizedExports },
    { label: 'Screenshots', item: entitlements?.meters?.screenshotCredits },
  ].filter((row) => row.item);
  const hasNameChange = Boolean(user) && name.trim() !== String(user?.name || '').trim();
  const hasEmailChange = Boolean(user) && email.trim().toLowerCase() !== String(user?.email || '').trim().toLowerCase();
  const hasPasswordDraft = Boolean(currentPassword || newPassword || confirmPassword);
  const renderPasswordToggle = (field, visible) => (
    <button
      type="button"
      className="auth-password-toggle profile-password-toggle"
      onClick={() => setVisiblePasswordFields((current) => ({
        ...current,
        [field]: !current[field],
      }))}
      disabled={!user || loading}
      aria-label={visible ? 'Hide password' : 'Show password'}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
  const hasProfileChanges = hasNameChange || hasEmailChange || hasPasswordDraft || hasPendingAvatarChange;
  const canSaveChanges = Boolean(user && !loading && hasProfileChanges);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const updateData = {};
      const trimmedName = name.trim();
      if (trimmedName && trimmedName !== user.name) {
        updateData.name = trimmedName;
      }
      const trimmedEmail = email.trim().toLowerCase();
      if (hasEmailChange) {
        updateData.email = trimmedEmail;
      }
      if (newPassword) {
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
          setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
          setLoading(false);
          return;
        }
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

      if (Object.keys(updateData).length === 0 && !hasPendingAvatarChange) {
        setLoading(false);
        return;
      }

      let updatedUser = user;
      if (Object.keys(updateData).length > 0) {
        const response = await api.updateProfile(updateData);
        updatedUser = response.user;
      }
      if (pendingAvatarDataUrl) {
        const response = await api.uploadMyAvatar({ imageDataUrl: pendingAvatarDataUrl });
        updatedUser = response.user;
      } else if (pendingAvatarRemoved) {
        const response = await api.removeMyAvatar();
        updatedUser = response.user;
      }
      onUpdate?.(updatedUser);
      setActiveProfileField(null);
      if (showToast) {
        showToast('Profile updated', 'success');
      } else {
        setSuccess('Profile updated successfully');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPendingAvatarDataUrl('');
      setPendingAvatarRemoved(false);
      if (updatedUser?.name) setName(updatedUser.name);
      if (updatedUser?.email) setEmail(updatedUser.email);
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
    if (pendingAvatarDataUrl) {
      openAvatarCrop(pendingAvatarDataUrl);
      return;
    }
    if (hasCustomAvatar && avatarUrl && !pendingAvatarRemoved) {
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

  const activateProfileField = (field) => {
    setActiveProfileField(field);
    const focusInput = () => {
      const inputRef = field === 'name' ? nameInputRef : emailInputRef;
      inputRef.current?.focus();
      inputRef.current?.select?.();
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(focusInput);
      return;
    }

    setTimeout(focusInput, 0);
  };

  const handlePlanDetailsOpenChange = (open) => {
    setOpenProfileAccordion(open ? 'plan' : null);
    setActiveProfileField(null);
  };

  const handleProfileDetailsOpenChange = (open) => {
    setOpenProfileAccordion(open ? 'profile' : null);
    if (!open) {
      setActiveProfileField(null);
    }
  };

  const handlePasswordDetailsOpenChange = (open) => {
    setOpenProfileAccordion(open ? 'password' : null);
    setActiveProfileField(null);
  };

  const handleDeleteDetailsOpenChange = (open) => {
    setOpenProfileAccordion(open ? 'delete' : null);
    setActiveProfileField(null);
    if (!open) {
      setShowDeleteConfirm(false);
      setDeletePassword('');
    }
  };

  const handleSaveAvatarCrop = async () => {
    setError('');
    setSuccess('');
    setAvatarLoading(true);

    try {
      const imageDataUrl = await createCroppedAvatarDataUrl(avatarCropSrc, avatarCropPixels);
      setPendingAvatarDataUrl(imageDataUrl);
      setPendingAvatarRemoved(false);
      setAvatarCropSrc('');
    } catch (err) {
      setError(err.message || 'Failed to crop avatar');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setError('');
    setSuccess('');
    setAvatarLoading(true);
    try {
      setPendingAvatarDataUrl('');
      setPendingAvatarRemoved(true);
      setAvatarCropSrc('');
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
          aria-label={canRemoveAvatar ? 'Edit avatar' : (hasDisplayAvatar ? 'Change avatar' : 'Upload avatar')}
        >
          <Avatar
            className="account-hero-avatar account-hero-avatar-image"
            src={displayAvatarUrl}
            label={avatarInitial}
            icon={<User size={20} />}
            size="lg"
            shape="circle"
            aria-hidden="true"
          />
          <span className="account-hero-avatar-edit-icon" aria-hidden="true">
            <EditIcon size={13} />
          </span>
        </button>
        <div className="account-hero-details">
          <div className="account-hero-name">{user?.name || 'Your account'}</div>
        </div>
      </div>

      <form onSubmit={handleUpdateProfile} className="profile-form">
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {entitlements && canViewPlanDetails ? (
            <Accordion
              id="account-plan-details"
              open={planDetailsOpen}
              onOpenChange={handlePlanDetailsOpenChange}
              title={<>Plan: <strong>{planName}</strong></>}
              meta={(
                <Badge
                  className="account-plan-status-badge"
                  type="hollow"
                  badgeStyle={planStatus.style}
                  size="sm"
                >
                  {planStatus.label}
                </Badge>
              )}
              contentClassName="account-plan-details"
            >
              {isArchived ? (
                <div className="account-plan-notice">
                  This account is archived. Existing work can be viewed, but new scans, screenshots, downloads, invites, and shares are locked.
                </div>
              ) : trialEnded ? (
                <div className="account-plan-notice">
                  Your trial has ended. The account is now limited to Free plan allowances unless upgraded.
                </div>
              ) : entitlements.trial?.active && entitlements.trial?.organizedDownloadsAllowed === false ? (
                <div className="account-plan-notice">
                  Screenshot capture is included during this trial. Organized screenshot downloads require a paid plan.
                </div>
              ) : null}
              <div className="account-usage-list">
                <table className="account-usage-table">
                  <thead>
                    <tr>
                      <th scope="col"> </th>
                      <th scope="col">Available</th>
                      <th scope="col">Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageRows.map(({ label, item }) => (
                      <tr key={item.meter || label}>
                        <th scope="row">{label}</th>
                        <td><UsageAmount value={getAvailableUsageValue(item)} /></td>
                        <td><UsageAmount value={hasUsageValue(item.used) ? item.used : null} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isPrimaryBillingOwner ? (
                <div className="account-plan-actions">
	                <Button
	                  type="button"
	                  variant="secondary"
	                  buttonStyle="mono"
	                  size="sm"
	                  onClick={onOpenPlans}
	                  disabled={!user}
	                >
	                  Switch
	                </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    buttonStyle="mono"
                    size="sm"
                    onClick={() => onOpenPlans?.('page-credits')}
                    disabled={!user}
                  >
                    Add pages
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    buttonStyle="mono"
                    size="sm"
                    onClick={() => onOpenPlans?.('screenshot-credits')}
                    disabled={!user}
                  >
                    Add screenshots
                  </Button>
	                <Button
	                  type="button"
	                  variant="ghost"
	                  size="sm"
	                  onClick={onOpenBilling}
	                  disabled={!user || !onOpenBilling}
	                  loading={billingLoading}
	                  endIcon={<ExternalLink size={14} />}
	                >
	                  Manage
	                </Button>
	              </div>
              ) : null}
	            </Accordion>
          ) : null}

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden-file-input"
            onChange={handleAvatarFile}
          />

          <Accordion
            id="profile-fields-details"
            open={profileDetailsOpen}
            onOpenChange={handleProfileDetailsOpenChange}
            title={<strong>Profile details</strong>}
            contentClassName="profile-fields-section"
          >
            <Field label="Username">
              <TextInput
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your username"
                readOnly={activeProfileField !== 'name'}
                disabled={!user || loading}
                inputClassName="profile-inline-edit-input"
                shellClassName={classNames(
                  'profile-inline-edit-shell',
                  activeProfileField === 'name' && 'is-active'
                )}
                rightElement={(
                  <button
                    type="button"
                    className="profile-inline-edit-button"
                    aria-label="Edit username"
                    onClick={() => activateProfileField('name')}
                  >
                    <EditIcon size={14} />
                  </button>
                )}
              />
            </Field>
            <Field label="Email">
              <TextInput
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                readOnly={activeProfileField !== 'email'}
                disabled={!user || loading}
                inputClassName="profile-inline-edit-input"
                shellClassName={classNames(
                  'profile-inline-edit-shell',
                  activeProfileField === 'email' && 'is-active'
                )}
                rightElement={(
                  <button
                    type="button"
                    className="profile-inline-edit-button"
                    aria-label="Edit email"
                    onClick={() => activateProfileField('email')}
                  >
                    <EditIcon size={14} />
                  </button>
                )}
              />
            </Field>
          </Accordion>

          <Accordion
            id="profile-password-details"
            open={passwordDetailsOpen}
            onOpenChange={handlePasswordDetailsOpenChange}
            title={<strong>{hasPassword ? 'Change password' : 'Set password'}</strong>}
            contentClassName="profile-password-details"
          >
            {!hasPassword ? (
              <p className="field-hint">You signed in without a password. Set one here if you want email/password login too.</p>
            ) : null}
            {hasPassword ? (
              <Field label="Current password">
                <TextInput
                  type={visiblePasswordFields.current ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  disabled={!user || loading}
                  rightElement={renderPasswordToggle('current', visiblePasswordFields.current)}
                />
              </Field>
            ) : null}
            <Field label="New password">
              <TextInput
                type={visiblePasswordFields.new ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={`Must be at least ${MIN_PASSWORD_LENGTH} characters`}
                minLength={MIN_PASSWORD_LENGTH}
                disabled={!user || loading}
                rightElement={renderPasswordToggle('new', visiblePasswordFields.new)}
              />
            </Field>
            <Field label="Confirm new password">
              <TextInput
                type={visiblePasswordFields.confirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={!user || loading}
                rightElement={renderPasswordToggle('confirm', visiblePasswordFields.confirm)}
              />
            </Field>
          </Accordion>

          <Accordion
            id="profile-delete-details"
            open={deleteDetailsOpen}
            onOpenChange={handleDeleteDetailsOpenChange}
            title={<strong>Delete account</strong>}
            contentClassName="profile-delete-details"
          >
            {!showDeleteConfirm ? (
              <>
                <p className="profile-delete-copy">Deleting your account will permanently remove all your projects, maps, and data.</p>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={loading || !user}
                >
                  Delete account
                </Button>
              </>
            ) : (
              <div className="account-danger">
                <div className="account-danger-header">
                  <AlertTriangle size={36} />
                  <div>
                    <div className="account-danger-title">Delete account?</div>
                    <div className="account-danger-subtitle">
                      This action cannot be undone. All projects, maps, and scan history will be deleted.
                    </div>
                  </div>
                </div>
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
                    Yes, delete my account
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    buttonStyle="mono"
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
          </Accordion>

          <div className="profile-form-actions">
            <Button
              className="profile-save-button"
              type="submit"
              variant="primary"
              disabled={!canSaveChanges}
              loading={loading && hasProfileChanges}
            >
              Save changes
            </Button>
          </div>
        </form>
      <Modal
        show={!!avatarCropSrc}
        onClose={() => !avatarLoading && setAvatarCropSrc('')}
        title="Edit avatar"
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
              Save avatar
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
        <p className="avatar-crop-caption">Position your image inside the circle.</p>
        <Field className="avatar-crop-zoom-field" label="Zoom">
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
        <div className="avatar-crop-source-actions">
          <Button
            type="button"
            variant="secondary"
            buttonStyle="mono"
            size="sm"
            onClick={() => avatarInputRef.current?.click()}
            disabled={!user || avatarLoading}
          >
            {!avatarLoading ? <ImagePlus size={16} /> : null}
            {hasDisplayAvatar ? 'Change avatar' : 'Upload avatar'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            buttonStyle="danger"
            size="sm"
            onClick={handleRemoveAvatar}
            disabled={!user || avatarLoading || !canRemoveAvatar}
            loading={avatarLoading}
          >
            {!avatarLoading ? <Trash2 size={16} /> : null}
            Remove avatar
          </Button>
        </div>
      </Modal>
    </AccountDrawer>
  );
};

export default ProfileDrawer;
