import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import Topbar from './Topbar';
import { AuthProvider } from '../../contexts/AuthContext';

describe('Topbar', () => {
  let container;
  let root;

  const renderTopbar = (authValue = {}) => {
    const authHandlers = {
      onShowProfile: jest.fn(),
      onShowBilling: jest.fn(),
      onShowSettings: jest.fn(),
      onLogout: jest.fn(),
      onLogin: jest.fn(),
    };
    act(() => {
      root.render(
        <AuthProvider
          value={{
            isLoggedIn: true,
            currentUser: {
              name: 'Matthew',
              avatarUrl: 'https://example.com/avatar.png',
            },
            ...authHandlers,
            ...authValue,
          }}
        >
          <Topbar
            canEdit
            urlInput="https://example.com"
            onUrlInputChange={jest.fn()}
            onUrlKeyDown={jest.fn()}
            scanOptions={{}}
            showScanOptions={false}
            scanOptionsRef={{ current: null }}
            onToggleScanOptions={jest.fn()}
            onScanOptionChange={jest.fn()}
            scanLayerAvailability={{}}
            scanLayerVisibility={{}}
            onToggleScanLayer={jest.fn()}
            onScan={jest.fn()}
            scanDisabled={false}
            scanTitle="Run scan"
            optionsDisabled={false}
            onClearUrl={jest.fn()}
            showClearUrl={false}
            sharedTitle=""
            onShowProjects={jest.fn()}
            onShowHistory={jest.fn()}
            onShowInvites={jest.fn()}
            onShowAccessRequests={jest.fn()}
            pendingInviteCount={3}
            pendingAccessRequestCount={2}
          />
        </AuthProvider>
      );
    });
    return { ...authHandlers, ...authValue };
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

  test('uses shared button styling for the account trigger and keeps badges inside the menu', () => {
    renderTopbar();

    const trigger = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Matthew')
    );

    expect(trigger.className).toContain('ui-btn');
    expect(trigger.className).toContain('ui-btn--type-ghost');
    expect(trigger.className).toContain('ui-btn--style-mono');
    const avatar = trigger.querySelector('.user-btn-avatar');
    expect(avatar).not.toBeNull();
    expect(avatar.className).toContain('ui-avatar');
    expect(container.querySelector('.account-menu-badge')).toBeNull();

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(Array.from(container.querySelectorAll('.ui-menu-section-header')).map((node) => node.textContent)).toEqual([
      'Collaboration',
      'Workspace',
      'Account',
    ]);
    expect(container.querySelectorAll('.account-menu-item-badge')).toHaveLength(2);
  });

  test('opens billing from the account menu', () => {
    const auth = renderTopbar();

    const trigger = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Matthew')
    );
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const billingButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Billing')
    );
    expect(billingButton).not.toBeNull();
    expect(billingButton.className).toContain('account-menu-item--external');
    expect(billingButton.querySelector('.account-menu-external-icon')).not.toBeNull();

    act(() => {
      billingButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(auth.onShowBilling).toHaveBeenCalledTimes(1);
  });
});
