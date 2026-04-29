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
    expect(container.textContent).toContain('Upload Avatar');
    expect(container.textContent).not.toContain('ProfileUpload Avatar');
  });

  test('uses change and ghost remove controls when avatar exists', () => {
    act(() => {
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

    expect(container.textContent).toContain('Change Avatar');
    const removeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Remove Avatar')
    );
    expect(removeButton.className).toContain('ui-btn--type-ghost');
  });

  test('opens cropper from avatar edit and uploads cropped avatar', async () => {
    avatarCrop.createCroppedAvatarDataUrl.mockResolvedValue('data:image/webp;base64,cropped');
    api.uploadMyAvatar.mockResolvedValue({
      user: { ...baseUser, avatarUrl: '/uploads/avatars/new.webp' },
    });
    const onUpdate = jest.fn();

    await act(async () => {
      root.render(
        <ProfileDrawer
          isOpen
          user={{ ...baseUser, avatarUrl: '/uploads/avatars/maya.webp' }}
          onClose={jest.fn()}
          onUpdate={onUpdate}
          onLogout={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const editButton = container.querySelector('button[aria-label="Edit avatar"]');
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Crop Avatar');
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
  });
});
