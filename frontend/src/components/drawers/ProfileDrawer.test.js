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
  getAccountEditors: jest.fn(() => Promise.resolve({ editors: [] })),
  removeAccountEditor: jest.fn(() => Promise.resolve({ entitlements: null })),
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

  const openProfileDetails = () => {
    const summary = container.querySelector('button[aria-controls="profile-fields-details"]');
    expect(summary).not.toBeNull();
    act(() => {
      summary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return summary;
  };

  beforeEach(() => {
    api.getAccountEditors.mockImplementation(() => new Promise(() => {}));
    api.removeAccountEditor.mockResolvedValue({ entitlements: null });
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
    expect(container.querySelector('.account-hero-avatar-edit-icon')).not.toBeNull();
    expect(avatar.textContent).toContain('M');
    expect(avatar.className).toContain('ui-avatar--circle');
    const profileSummary = container.querySelector('button[aria-controls="profile-fields-details"]');
    expect(profileSummary).not.toBeNull();
    expect(profileSummary.getAttribute('aria-expanded')).toBe('false');
    expect(profileSummary.textContent).toContain('Profile details');
    expect(container.querySelector('input[placeholder="Your username"]')).toBeNull();
    expect(container.querySelector('.account-hero-email')).toBeNull();
    expect(container.querySelector('.account-hero-badge')).toBeNull();
    expect(container.querySelector('button[aria-label="Upload avatar"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Upload Avatar');
    expect(container.textContent).not.toContain('Remove avatar');
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

    expect(container.textContent).toContain('Edit avatar');
    expect(container.textContent).toContain('Change avatar');
    const changeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Change avatar')
    );
    expect(changeButton.className).toContain('ui-btn--type-secondary');
    expect(changeButton.className).toContain('ui-btn--style-mono');
    const removeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Remove avatar')
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
    expect(container.textContent).not.toContain('Change avatar');
    expect(container.textContent).not.toContain('Remove avatar');

    const editButton = container.querySelector('button[aria-label="Change avatar"]');
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="avatar-cropper"]')).toBeNull();
  });

  test('opens plan summary by default and shows owner plan actions', () => {
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

    const summaryButton = container.querySelector('button[aria-controls="account-plan-details"]');
    expect(summaryButton).not.toBeNull();
    expect(summaryButton.getAttribute('aria-expanded')).toBe('true');
    expect(summaryButton.textContent).toContain('Plan:');
    expect(summaryButton.textContent).toContain('Studio');
    expect(container.querySelector('.account-plan-status-badge')?.textContent).toContain('Active');
    expect(container.querySelector('.account-plan-actions')).not.toBeNull();

    const upgradeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.trim() === 'Upgrade'
    );
    const billingButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.trim() === 'Manage billing'
    );
    const switchButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.trim() === 'Switch'
    );
    const pagesButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.trim() === 'Pages'
    );
    const screenshotsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.trim() === 'Screenshots'
    );

    expect(upgradeButton).not.toBeNull();
    expect(billingButton).not.toBeNull();
    expect(switchButton).toBeUndefined();
    expect(pagesButton).toBeUndefined();
    expect(screenshotsButton).toBeUndefined();
    expect(upgradeButton.className).toContain('ui-btn--type-primary');
    expect(billingButton.className).toContain('ui-btn--type-link');
    expect(billingButton.className).toContain('ui-btn--style-mono');
    expect(billingButton.className).not.toContain('ui-btn--style-brand');
    expect(billingButton.querySelector('.ui-btn__icon--end')).not.toBeNull();

    act(() => {
      upgradeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      billingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenPlans).toHaveBeenCalledTimes(1);
    expect(onOpenBilling).toHaveBeenCalledTimes(1);
  });

  test('shows available amounts before used amounts in the plan overview', () => {
    act(() => {
      root.render(
        <ProfileDrawer
          isOpen
          user={{
            ...baseUser,
            entitlements: {
              account: { state: 'active' },
	              plan: { name: 'Test Unlimited' },
	              meters: {
	                activePages: {
	                  meter: 'active_pages',
	                  limit: 100,
	                  remaining: 88,
	                  used: 12,
	                  unlimited: false,
                },
	                screenshotCredits: {
                  meter: 'screenshot_credits',
                  included: null,
                  remaining: null,
                  used: 1035,
	                  unlimited: true,
	                },
	                downloads: {
	                  meter: 'organized_exports',
	                  included: 5,
	                  remaining: 4,
	                  used: 1,
	                  unlimited: false,
	                },
	              },
              limits: {
                activeProjects: {
                  limit: null,
                  remaining: null,
                  used: 3,
                  unlimited: true,
                },
                activeMaps: {
                  limit: null,
                  remaining: null,
                  used: 2,
                  unlimited: true,
                },
	                editors: {
	                  limit: 5,
	                  remaining: 4,
	                  used: 1,
                  unlimited: false,
                },
              },
            },
          }}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          onOpenPlans={jest.fn()}
          onOpenBilling={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    const summaryButton = container.querySelector('button[aria-controls="account-plan-details"]');
    expect(summaryButton.getAttribute('aria-expanded')).toBe('true');

    const table = container.querySelector('.account-usage-table');
    expect(table).not.toBeNull();
    expect(table.querySelector('thead')?.textContent).toContain('Available');
    expect(table.querySelector('thead')?.textContent).toContain('Used');

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const rowFor = (label) => rows.find((row) => row.querySelector('th')?.textContent === label);
    const cellText = (row, index) => row.querySelectorAll('td')[index]?.textContent;

    expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual([
      'Editors',
      'Projects',
      'Maps',
      'Pages',
      'Downloads',
      'Screenshots',
    ]);
    expect(cellText(rowFor('Editors'), 0)).toBe('4');
    expect(cellText(rowFor('Editors'), 1)).toBe('1');
    expect(rowFor('Projects').querySelector('[aria-label="Unlimited"]')).not.toBeNull();
    expect(cellText(rowFor('Projects'), 1)).toBe('3');
    expect(rowFor('Maps').querySelector('[aria-label="Unlimited"]')).not.toBeNull();
    expect(cellText(rowFor('Maps'), 1)).toBe('2');
    expect(cellText(rowFor('Pages'), 0)).toBe('88');
    expect(cellText(rowFor('Pages'), 1)).toBe('12');
    expect(cellText(rowFor('Downloads'), 0)).toBe('4');
    expect(cellText(rowFor('Downloads'), 1)).toBe('1');
    expect(rowFor('Screenshots').querySelector('[aria-label="Unlimited"]')).not.toBeNull();
    expect(cellText(rowFor('Screenshots'), 1)).toBe('1,035');
  });

  test('shows and removes account editors for owners', async () => {
    api.getAccountEditors.mockResolvedValueOnce({
      editors: [
        { id: 'membership-owner', role: 'owner', name: 'Maya', email: 'maya@example.com' },
        { id: 'membership-editor', role: 'editor', name: 'Eli', email: 'eli@example.com' },
      ],
    });
    api.removeAccountEditor.mockResolvedValueOnce({
      entitlements: {
        account: { state: 'active', ownerUserId: 'u1', membershipRole: 'owner' },
        plan: { name: 'Studio' },
        meters: {},
        limits: {},
      },
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const onUpdate = jest.fn();
    const showToast = jest.fn();

    await act(async () => {
      root.render(
        <ProfileDrawer
          isOpen
          user={{
            ...baseUser,
            entitlements: {
              account: { state: 'active', ownerUserId: 'u1', membershipRole: 'owner' },
              plan: { name: 'Studio' },
              meters: {},
              limits: {},
            },
          }}
          onClose={jest.fn()}
          onUpdate={onUpdate}
          onLogout={jest.fn()}
          showToast={showToast}
        />
      );
    });

    expect(api.getAccountEditors).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Editors');
    expect(container.textContent).toContain('Eli');
    expect(container.textContent).toContain('eli@example.com');
    expect(container.querySelector('button[aria-label="Remove Maya"]')).toBeNull();

    const removeButton = container.querySelector('button[aria-label="Remove Eli"]');
    expect(removeButton).not.toBeNull();
    expect(removeButton.className).toContain('ui-btn--type-ghost');
    expect(removeButton.className).toContain('ui-btn--style-danger');

    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(confirmSpy).toHaveBeenCalledWith('Remove Eli from this account?');
    expect(api.removeAccountEditor).toHaveBeenCalledWith('membership-editor');
    expect(container.textContent).not.toContain('Eli');
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      entitlements: expect.objectContaining({
        plan: expect.objectContaining({ name: 'Studio' }),
      }),
    }));
    expect(showToast).toHaveBeenCalledWith('Editor removed', 'success');

    confirmSpy.mockRestore();
  });

  test('hides plan details from editors and commenters', () => {
    const renderWithRole = (membershipRole) => {
      act(() => {
        root.render(
          <ProfileDrawer
            isOpen
            user={{
              ...baseUser,
              entitlements: {
                account: { state: 'active', ownerUserId: 'owner-1', membershipRole },
                plan: { name: 'Studio' },
                meters: {},
                limits: {},
              },
            }}
            onClose={jest.fn()}
            onUpdate={jest.fn()}
            onLogout={jest.fn()}
            onOpenPlans={jest.fn()}
            onOpenBilling={jest.fn()}
            showToast={jest.fn()}
          />
        );
      });

      expect(container.querySelector('button[aria-controls="account-plan-details"]')).toBeNull();
      expect(container.querySelector('.account-plan-actions')).toBeNull();
    };

    renderWithRole('editor');
    renderWithRole('commenter');
  });

  test('shows plan details for account owners', () => {
    act(() => {
      root.render(
        <ProfileDrawer
          isOpen
          user={{
            ...baseUser,
            entitlements: {
              account: { state: 'active', ownerUserId: 'owner-1', membershipRole: 'owner' },
              plan: { name: 'Studio' },
              meters: {},
              limits: {},
            },
          }}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          onOpenPlans={jest.fn()}
          onOpenBilling={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    expect(container.querySelector('button[aria-controls="account-plan-details"]')).not.toBeNull();
    expect(container.querySelector('.account-plan-actions')).not.toBeNull();
  });

  test('keeps only one profile accordion open at a time', () => {
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
          showToast={jest.fn()}
        />
      );
    });

    const planSummary = container.querySelector('button[aria-controls="account-plan-details"]');
    const profileSummary = container.querySelector('button[aria-controls="profile-fields-details"]');
    const passwordSummary = container.querySelector('button[aria-controls="profile-password-details"]');
    const deleteSummary = container.querySelector('button[aria-controls="profile-delete-details"]');

    expect(planSummary.getAttribute('aria-expanded')).toBe('true');
    expect(profileSummary.getAttribute('aria-expanded')).toBe('false');
    expect(passwordSummary.getAttribute('aria-expanded')).toBe('false');
    expect(deleteSummary.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      profileSummary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(planSummary.getAttribute('aria-expanded')).toBe('false');
    expect(profileSummary.getAttribute('aria-expanded')).toBe('true');
    expect(passwordSummary.getAttribute('aria-expanded')).toBe('false');
    expect(deleteSummary.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      passwordSummary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(planSummary.getAttribute('aria-expanded')).toBe('false');
    expect(profileSummary.getAttribute('aria-expanded')).toBe('false');
    expect(passwordSummary.getAttribute('aria-expanded')).toBe('true');
    expect(deleteSummary.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      deleteSummary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(planSummary.getAttribute('aria-expanded')).toBe('false');
    expect(profileSummary.getAttribute('aria-expanded')).toBe('false');
    expect(passwordSummary.getAttribute('aria-expanded')).toBe('false');
    expect(deleteSummary.getAttribute('aria-expanded')).toBe('true');
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

    const profileSummary = openProfileDetails();
    expect(profileSummary.getAttribute('aria-expanded')).toBe('true');

    const usernameInput = container.querySelector('input[placeholder="Your username"]');
    const emailInput = container.querySelector('input[placeholder="Email address"]');
    expect(usernameInput.readOnly).toBe(true);
    expect(emailInput.readOnly).toBe(true);

    act(() => {
      container.querySelector('button[aria-label="Edit username"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usernameInput.readOnly).toBe(false);
    expect(emailInput.readOnly).toBe(true);

    act(() => {
      container.querySelector('button[aria-label="Edit email"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(usernameInput.readOnly).toBe(true);
    expect(emailInput.readOnly).toBe(false);
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

    const passwordSummary = container.querySelector('button[aria-controls="profile-password-details"]');
    expect(passwordSummary).not.toBeNull();
    expect(passwordSummary.closest('.ui-accordion')).not.toBeNull();
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

  test('lets password fields be shown and hidden independently', () => {
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

    const passwordSummary = container.querySelector('button[aria-controls="profile-password-details"]');
    act(() => {
      passwordSummary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const inputs = Array.from(container.querySelectorAll('.profile-password-details input'));
    const toggles = Array.from(container.querySelectorAll('.profile-password-toggle'));
    expect(inputs).toHaveLength(3);
    expect(toggles).toHaveLength(3);
    expect(inputs.map((input) => input.type)).toEqual(['password', 'password', 'password']);

    act(() => {
      toggles[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(inputs[0].type).toBe('text');
    expect(inputs[1].type).toBe('password');
    expect(toggles[0].getAttribute('aria-label')).toBe('Hide password');

    act(() => {
      toggles[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(inputs[0].type).toBe('password');
    expect(toggles[0].getAttribute('aria-label')).toBe('Show password');
  });

  test('keeps save disabled until profile fields change', () => {
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

    openProfileDetails();

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save changes')
    );
    const usernameInput = container.querySelector('input[placeholder="Your username"]');
    expect(saveButton.disabled).toBe(true);
    expect(saveButton.className).toContain('ui-btn--style-brand');
    expect(saveButton.className).not.toContain('ui-btn--style-mono');

    act(() => {
      container.querySelector('button[aria-label="Edit username"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter.call(usernameInput, 'Maya F.');
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(saveButton.disabled).toBe(false);
    expect(saveButton.className).toContain('ui-btn--style-brand');
  });

  test('keeps save disabled when user data loads after drawer opens', () => {
    act(() => {
      root.render(
        <ProfileDrawer
          isOpen
          user={null}
          onClose={jest.fn()}
          onUpdate={jest.fn()}
          onLogout={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

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

    openProfileDetails();

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save changes')
    );
    expect(container.querySelector('input[placeholder="Your username"]').value).toBe(baseUser.name);
    expect(container.querySelector('input[placeholder="Email address"]').value).toBe(baseUser.email);
    expect(saveButton.disabled).toBe(true);
  });

  test('enables save when email changes and submits profile email', async () => {
    api.updateProfile.mockResolvedValue({
      user: { ...baseUser, email: 'new@example.com' },
    });
    const onUpdate = jest.fn();

    await act(async () => {
      root.render(
        <ProfileDrawer
          isOpen
          user={baseUser}
          onClose={jest.fn()}
          onUpdate={onUpdate}
          onLogout={jest.fn()}
          showToast={jest.fn()}
        />
      );
    });

    openProfileDetails();

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save changes')
    );
    const emailInput = container.querySelector('input[placeholder="Email address"]');
    expect(saveButton.disabled).toBe(true);

    act(() => {
      container.querySelector('button[aria-label="Edit email"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter.call(emailInput, 'new@example.com');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(emailInput.readOnly).toBe(false);
    expect(saveButton.disabled).toBe(false);

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(api.updateProfile).toHaveBeenCalledWith({ email: 'new@example.com' });
    expect(onUpdate).toHaveBeenCalledWith({ ...baseUser, email: 'new@example.com' });
  });

  test('keeps delete account collapsed until opened and confirms inline', () => {
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

    const deleteSummary = container.querySelector('button[aria-controls="profile-delete-details"]');
    expect(deleteSummary).not.toBeNull();
    expect(deleteSummary.closest('.ui-accordion')).not.toBeNull();
    expect(deleteSummary.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Deleting your account will permanently remove');

    act(() => {
      deleteSummary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(deleteSummary.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Deleting your account will permanently remove');

    const deleteButton = Array.from(container.querySelectorAll('.profile-delete-details button')).find((button) =>
      button.textContent.includes('Delete account')
    );
    act(() => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('This action cannot be undone');
    expect(container.querySelector('input[placeholder="Your password"]')).not.toBeNull();
  });

  test('opens cropper from avatar edit and saves cropped avatar with profile changes', async () => {
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

    expect(container.textContent).toContain('Edit avatar');
    expect(container.textContent).not.toContain('Crop avatar');
    expect(container.textContent).toContain('Position your image inside the circle.');
    expect(container.textContent).toContain('Change avatar');
    expect(container.textContent).toContain('Remove avatar');
    expect(container.querySelector('[data-testid="avatar-cropper"]')).not.toBeNull();

    const profileSaveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save changes')
    );
    expect(profileSaveButton.disabled).toBe(true);

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save avatar')
    );
    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(avatarCrop.createCroppedAvatarDataUrl).toHaveBeenCalledWith(
      expect.stringContaining('/uploads/avatars/maya.webp'),
      expect.objectContaining({ width: 128, height: 128 })
    );
    expect(api.uploadMyAvatar).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(profileSaveButton.disabled).toBe(false);

    await act(async () => {
      profileSaveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(api.uploadMyAvatar).toHaveBeenCalledWith({
      imageDataUrl: 'data:image/webp;base64,cropped',
    });
    expect(onUpdate).toHaveBeenCalledWith({ ...baseUser, avatarUrl: '/uploads/avatars/new.webp' });
    expect(showToast).toHaveBeenCalledWith('Profile updated', 'success');
    expect(container.textContent).not.toContain('Avatar updated');
  });
});
