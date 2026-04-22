import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import Topbar from './Topbar';
import { AuthProvider } from '../../contexts/AuthContext';

describe('Topbar', () => {
  let container;
  let root;

  const renderTopbar = (authValue = {}) => {
    act(() => {
      root.render(
        <AuthProvider
          value={{
            isLoggedIn: true,
            currentUser: {
              name: 'Matthew',
              avatarUrl: 'https://example.com/avatar.png',
            },
            onShowProfile: jest.fn(),
            onShowSettings: jest.fn(),
            onLogout: jest.fn(),
            onLogin: jest.fn(),
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
            scanDepth={2}
            onScanDepthChange={jest.fn()}
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
    expect(trigger.querySelector('.user-btn-avatar')).not.toBeNull();
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
});
