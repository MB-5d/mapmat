import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import Topbar from './Topbar';
import { AuthProvider } from '../../contexts/AuthContext';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');

describe('Topbar', () => {
  let container;
  let root;

  const renderTopbar = (authValue = {}) => {
    const authHandlers = {
      onShowProfile: jest.fn(),
      onShowBilling: jest.fn(),
      onShowSettings: jest.fn(),
      onShowSupport: jest.fn(),
      onLogout: jest.fn(),
      onLogin: jest.fn(),
      onSignup: jest.fn(),
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
    expect(trigger.className).toContain('topbar-account-trigger');
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
    expect(container.textContent).toContain('Maps');
    expect(container.textContent).toContain('Support');
    expect(container.textContent).not.toContain('Projects');
    expect(container.querySelectorAll('.account-menu-item-badge')).toHaveLength(2);
  });

  test('opens support from the account menu', () => {
    const auth = renderTopbar();

    const trigger = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Matthew')
    );

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const supportButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Support')
    );

    act(() => {
      supportButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(auth.onShowSupport).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.account-menu')).toBeNull();
  });

  test('uses a primary brand login button when logged out', () => {
    const auth = renderTopbar({ isLoggedIn: false });

    const loginButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Sign up / log in')
    );

    expect(loginButton).not.toBeNull();
    expect(loginButton.className).toContain('ui-btn');
    expect(loginButton.className).toContain('ui-btn--type-primary');
    expect(loginButton.className).toContain('ui-btn--style-brand');
    expect(loginButton.className).toContain('ui-btn--md');
    expect(loginButton.className).toContain('topbar-login-btn');
    expect(loginButton.className).not.toContain('ui-btn--type-ghost');
    expect(loginButton.className).not.toContain('ui-btn--style-mono');
    expect(container.querySelector('.topbar-account-trigger')).toBeNull();

    act(() => {
      loginButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(auth.onSignup).toHaveBeenCalledTimes(1);
    expect(auth.onLogin).not.toHaveBeenCalled();
  });

  test('keeps the account trigger bubble filled instead of transparent', () => {
    const baseRule = appCss.match(/\.topbar-account-trigger\.ui-btn\s*{([^}]+)}/)?.[1] || '';
    const hoverRule = appCss.match(/\.topbar-account-trigger\.ui-btn:hover:not\(:disabled\),\s*\.topbar-account-trigger\.ui-btn\[aria-expanded="true"\]\s*{([^}]+)}/)?.[1] || '';

    expect(baseRule).toContain('background: var(--ui-color-surface);');
    expect(baseRule).toContain('border-color: var(--ui-color-border);');
    expect(baseRule).toContain('box-shadow: var(--shadow-canvas-control);');
    expect(baseRule).not.toContain('transparent');
    expect(hoverRule).toContain('background: var(--ui-color-surface-muted);');
    expect(hoverRule).not.toContain('transparent');
  });

  test('uses the canvas control shadow for app-home topbar bubbles', () => {
    const scanHoverRule = appCss.match(/\.topbar--app-home \.topbar-center \.scan-bar-shell:hover\s*{([^}]+)}/)?.[1] || '';
    const scanFocusRule = appCss.match(/\.topbar--app-home \.topbar-center \.scan-bar-shell:focus-within\s*{([^}]+)}/)?.[1] || '';
    const accountFocusRule = appCss.match(/\.topbar-account-trigger\.ui-btn:focus-visible\s*{([^}]+)}/)?.[1] || '';

    expect(scanHoverRule).toContain('box-shadow: var(--shadow-canvas-control);');
    expect(scanFocusRule).toContain('box-shadow: var(--shadow-canvas-control), var(--ui-focus-ring);');
    expect(accountFocusRule).toContain('box-shadow: var(--shadow-canvas-control), var(--ui-focus-ring);');
  });

  test('uses floating bubbles on the default workspace without showing the top scan bar', () => {
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
            onShowBilling: jest.fn(),
            onShowSettings: jest.fn(),
            onLogout: jest.fn(),
            onLogin: jest.fn(),
          }}
        >
          <Topbar
            canEdit
            appHome
            showScanBar={false}
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
          />
        </AuthProvider>
      );
    });

    expect(container.querySelector('.topbar.topbar--floating.topbar--app-home')).not.toBeNull();
    expect(container.querySelector('.topbar .brand')).not.toBeNull();
    expect(container.querySelector('.topbar .brand-logo')?.getAttribute('viewBox')).toBe('0 0 214 64');
    expect(container.querySelector('.topbar-account-trigger')).not.toBeNull();
    expect(container.querySelector('.topbar .scan-bar-shell')).toBeNull();
  });

  test('makes the map logo clickable only when a saved-map clear handler is provided', () => {
    const onMapLogoClick = jest.fn();

    act(() => {
      root.render(
        <AuthProvider
          value={{
            isLoggedIn: true,
            currentUser: { name: 'Matthew' },
            onShowProfile: jest.fn(),
            onShowBilling: jest.fn(),
            onShowSettings: jest.fn(),
            onLogout: jest.fn(),
            onLogin: jest.fn(),
          }}
        >
          <Topbar
            canEdit
            hasMap
            mapName="Saved map"
            onMapLogoClick={onMapLogoClick}
            urlInput=""
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
          />
        </AuthProvider>
      );
    });

    const logoButton = container.querySelector('button.canvas-map-brand-mark');
    expect(logoButton).not.toBeNull();

    act(() => {
      logoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onMapLogoClick).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <AuthProvider
          value={{
            isLoggedIn: true,
            currentUser: { name: 'Matthew' },
            onShowProfile: jest.fn(),
            onShowBilling: jest.fn(),
            onShowSettings: jest.fn(),
            onLogout: jest.fn(),
            onLogin: jest.fn(),
          }}
        >
          <Topbar
            canEdit
            hasMap
            mapName="Unsaved map"
            urlInput=""
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
          />
        </AuthProvider>
      );
    });

    expect(container.querySelector('button.canvas-map-brand-mark')).toBeNull();
    expect(container.querySelector('span.canvas-map-brand-mark')).not.toBeNull();
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
