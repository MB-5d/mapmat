import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import * as api from '../../api';
import * as avatarCrop from '../../utils/avatarCrop';
import ProfileDrawer from './ProfileDrawer';

jest.mock('react-easy-crop', () => {
  const React = require('react');
  return function MockCropper(props) {
    React.useEffect(() => {
      props.onCropComplete?.({}, { x: 0, y: 0, width: 128, height: 128 });
    }, []);
    return React.createElement('div', { 'data-testid': 'avatar-cropper' });
  };
});

jest.mock('../../api', () => ({
  updateProfile: jest.fn(),
  uploadMyAvatar: jest.fn(),
  removeMyAvatar: jest.fn(),
  deleteAccount: jest.fn(),
}));

jest.mock('../../utils/avatarCrop', () => ({
  createCroppedAvatarDataUrl: jest.fn(() => Promise.resolve('data:image/webp;base64,cropped')),
}));

describe('ProfileDrawer', () => {
  let container;
  let root;

  const baseUser = {
    id: 'u1',
    name: 'Maya',
    email: 'maya@example.com',
    hasPassword: true,
    authMode: 'password',
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    jest.clearAllMocks();
  });

  test('shows circular fallback avatar and username label when no avatar exists', () => {
    act(() => {
      root.render(
        <ProfileDrawer
          isOpen
          user={baseUser}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const avatar = container.querySelector('.account-hero-avatar');
    expect(avatar).not.toBeNull();
    expect(avatar.textContent).toContain('M');
    expect(avatar.className).toContain('ui-avatar--circle');
    expect(container.textContent).toContain('Username');
    expect(container.querySelector('.account-hero-email')).toBeNull();
    expect(container.querySelector('.account-hero-badge')).toBeNull();
    expect(container.querySelector('button[aria-label="Upload avatar"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Upload Avatar');
    expect(container.textContent).not.toContain('Remove Avatar');
    expect(container.textContent).not.toContain('ProfileUpload Avatar');
  });

  test('shows change and ghost remove controls in the avatar edit modal', async () => {
    await act(async () => {
      root.render(
        <ProfileDrawer
          isOpen
          user={{ ...baseUser, avatarUrl: '/uploads/avatars/maya.webp' }}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const editButton = container.querySelector('button[aria-label="Edit avatar"]');
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Edit Avatar');
    expect(container.textContent).toContain('Change Avatar');
    const removeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Remove Avatar')
    );
    expect(removeButton.className).toContain('ui-btn--type-ghost');
    expect(removeButton.className).toContain('ui-btn--style-danger');
    expect(removeButton.disabled).toBe(false);
  });

  test('uses Google avatar as fallback and keeps remove disabled until a custom avatar exists', async () => {
    await act(async () => {
      root.render(
        <ProfileDrawer
          isOpen
          user={{
            ...baseUser,
            avatarUrl: 'https://lh3.googleusercontent.com/a/avatar',
            avatarSource: 'google',
            hasCustomAvatar: false,
          }}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    expect(container.querySelector('.account-hero-avatar img')?.getAttribute('src')).toBe(
      'https://lh3.googleusercontent.com/a/avatar'
    );
    expect(container.querySelector('button[aria-label="Change avatar"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Change Avatar');
    expect(container.textContent).not.toContain('Remove Avatar');

    const editButton = container.querySelector('button[aria-label="Change avatar"]');
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="avatar-cropper"]')).toBeNull();
  });

  test('shows collapsed plan summary and expands plan actions', () => {
    const onOpenPlans = jest.fn();
    const onOpenBilling = jest.fn();

    act(() => {
      root.render(
        <ProfileDrawer
          isOpen
          user={{
            ...baseUser,
            entitlements: {
              account: { state: 'active' },
              plan: { name: 'Studio' },
              meters: {},
              limits: {},
            },
          }}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          onOpenPlans={onOpenPlans}
          onOpenBilling={onOpenBilling}
          showToast={jest.fn()}
        />
      );
    });

    const summaryButton = container.querySelector('.account-plan-summary');
    expect(summaryButton).not.toBeNull();
    expect(summaryButton.getAttribute('aria-expanded')).toBe('false');
    expect(summaryButton.textContent).toContain('Plan:');
    expect(summaryButton.textContent).toContain('Studio');
    expect(container.querySelector('.account-plan-status-badge')?.textContent).toContain('Active');
    expect(container.textContent).not.toContain('Switch plan');
    expect(container.textContent).not.toContain('Manage billing');

    act(() => {
      summaryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const planButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Switch plan')
    );
    const billingButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Manage billing')
    );

    expect(planButton).not.toBeNull();
    expect(billingButton).not.toBeNull();
    expect(billingButton.className).toContain('ui-btn--type-ghost');

    act(() => {
      planButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      billingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenPlans).toHaveBeenCalledTimes(1);
    expect(onOpenBilling).toHaveBeenCalledTimes(1);
  });

  test('keeps profile fields inactive until the edit control is used', () => {
    act(() => {
      root.render(
        <ProfileDrawer
          isOpen
          user={baseUser}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const usernameInput = container.querySelector('input[placeholder="Your username"]');
    const emailInput = container.querySelector('input[placeholder="Email address"]');
    expect(usernameInput.readOnly).toBe(true);
    expect(emailInput.readOnly).toBe(true);

    act(() => {
      container.querySelector('button[aria-label="Edit username"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usernameInput.readOnly).toBe(false);
    expect(emailInput.readOnly).toBe(true);
  });

  test('keeps password fields collapsed until opened', () => {
    act(() => {
      root.render(
        <ProfileDrawer
          isOpen
          user={baseUser}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const passwordSummary = container.querySelector('.profile-password-summary');
    expect(passwordSummary).not.toBeNull();
    expect(passwordSummary.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('input[placeholder="Enter current password"]')).toBeNull();

    act(() => {
      passwordSummary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(passwordSummary.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('input[placeholder="Enter current password"]')).not.toBeNull();
    expect(container.querySelector('input[placeholder="Must be at least 8 characters"]')).not.toBeNull();
    expect(container.querySelector('input[placeholder="Confirm new password"]')).not.toBeNull();
  });

  test('opens cropper from avatar edit and uploads cropped avatar', async () => {
    avatarCrop.createCroppedAvatarDataUrl.mockResolvedValue('data:image/webp;base64,cropped');
    api.uploadMyAvatar.mockResolvedValue({
      user: { ...baseUser, avatarUrl: '/uploads/avatars/new.webp' },
    });
    const onUpdate = jest.fn();
    const showToast = jest.fn();

    await act(async () => {
      root.render(
        <ProfileDrawer
          isOpen
          user={{ ...baseUser, avatarUrl: '/uploads/avatars/maya.webp' }}
          onClose={jest.fn()}
          onUpdate={onUpdate}
          onLogout={jest.fn()}
          showToast={showToast}
        />
      );
    });

    const editButton = container.querySelector('button[aria-label="Edit avatar"]');
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Edit Avatar');
    expect(container.textContent).not.toContain('Crop Avatar');
    expect(container.textContent).toContain('Position your image inside the circle.');
    expect(container.textContent).toContain('Change Avatar');
    expect(container.textContent).toContain('Remove Avatar');
    expect(container.querySelector('[data-testid="avatar-cropper"]')).not.toBeNull();

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save Avatar')
    );
    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(avatarCrop.createCroppedAvatarDataUrl).toHaveBeenCalledWith(
      expect.stringContaining('/uploads/avatars/maya.webp'),
      expect.objectContaining({ width: 128, height: 128 })
    );
    expect(api.uploadMyAvatar).toHaveBeenCalledWith({
      imageDataUrl: 'data:image/webp;base64,cropped',
    });
    expect(onUpdate).toHaveBeenCalledWith({ ...baseUser, avatarUrl: '/uploads/avatars/new.webp' });
    expect(showToast).toHaveBeenCalledWith('Avatar updated', 'success');
    expect(container.textContent).not.toContain('Avatar updated');
  });
});
