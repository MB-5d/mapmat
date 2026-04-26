import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import App, { WELCOME_MODAL_STORAGE_KEY } from './App';
import * as api from './api';
import { ROUTE_SURFACES } from './utils/appRoutes';

jest.mock('./api', () => ({
  getMe: jest.fn(),
  getShare: jest.fn(),
  getProjects: jest.fn(),
  getMaps: jest.fn(),
  getHistory: jest.fn(),
  getPendingMapInvites: jest.fn(),
  getPendingAccessRequests: jest.fn(),
  login: jest.fn(),
  signup: jest.fn(),
}));

describe('App blank home and welcome modal', () => {
  let container;
  let root;

  const baseRoute = {
    surface: ROUTE_SURFACES.APP,
    section: 'home',
    mapId: null,
  };

  const flushAsync = async (cycles = 6) => {
    for (let index = 0; index < cycles; index += 1) {
      await Promise.resolve();
    }
  };

  const renderApp = async (currentRoute = baseRoute) => {
    await act(async () => {
      root.render(<App currentRoute={currentRoute} navigateToRoute={jest.fn()} />);
      await flushAsync();
    });
  };

  const click = async (element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushAsync();
    });
  };

  const changeValue = (element, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      element.constructor.prototype,
      'value',
    )?.set;
    valueSetter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const submitAuthForm = async ({ email, password }) => {
    const emailInput = container.querySelector('input[type="email"]');
    const passwordInput = container.querySelector('input[type="password"]');
    const form = container.querySelector('.auth-form');

    await act(async () => {
      changeValue(emailInput, email);
      changeValue(passwordInput, password);
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsync(8);
    });
  };

  const suppressWelcomeModal = () => {
    window.localStorage.setItem(WELCOME_MODAL_STORAGE_KEY, 'true');
  };

  const getWelcomeModal = () => container.querySelector('.welcome-modal');
  const getAuthModal = () => container.querySelector('.auth-modal');
  const getProjectsDrawer = () => container.querySelector('.projects-drawer');
  const getSaveMapModal = () => container.querySelector('.save-map-modal');
  const getDontShowAgainCheckbox = () => container.querySelector('.welcome-modal-checkbox input[type="checkbox"]');
  const getButton = (label) => Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent.trim() === label
  );
  const getBlankCardButton = (label) => Array.from(container.querySelectorAll('.blank-card')).find(
    (button) => button.querySelector('.blank-card-title')?.textContent.trim() === label
  );

  const defaultUser = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    authMode: 'password',
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();

    api.getMe.mockRejectedValue(new Error('Not authenticated'));
    api.getShare.mockResolvedValue({ share: {} });
    api.getProjects.mockResolvedValue({ projects: [] });
    api.getMaps.mockResolvedValue({ maps: [] });
    api.getHistory.mockResolvedValue({ history: [] });
    api.getPendingMapInvites.mockResolvedValue({ invites: [] });
    api.getPendingAccessRequests.mockResolvedValue({ accessRequests: [] });
    api.login.mockResolvedValue({ user: defaultUser });
    api.signup.mockResolvedValue({ user: defaultUser });

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    jest.restoreAllMocks();
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  test('appears on first eligible app load when no dismissal key exists', async () => {
    await renderApp();

    expect(getWelcomeModal()).not.toBeNull();
    expect(container.textContent).toContain('Welcome to Vellic');
    expect(container.textContent).toContain('Make site or software structure visual, actionable, and easy to review');
    expect(container.textContent).toContain('Scan a site, import a sitemap, or start from scratch');
    expect(container.querySelector('.welcome-modal .modal-header h3')?.textContent).toBe('Welcome to Vellic');
    expect(container.querySelector('.welcome-modal-copy h2')).toBeNull();
  });

  test('renders updated blank-home copy and an enabled modify card', async () => {
    suppressWelcomeModal();

    await renderApp();

    expect(container.textContent).toContain('Start with a URL');
    expect(container.textContent).toContain('Scan a site, then shape the map from the canvas.');
    expect(container.textContent).toContain('Start a new map from scratch');
    expect(container.textContent).toContain('Make updates to existing maps');
    expect(container.textContent).toContain('Use existing sitemap files');
    expect(container.textContent).toContain('(drag in here or click to select)');
    expect(getBlankCardButton('Modify')).not.toBeNull();
    expect(getBlankCardButton('Modify').disabled).toBe(false);
  });

  test('logged-in create still opens the existing create-map flow', async () => {
    suppressWelcomeModal();
    api.getMe.mockResolvedValue({ user: defaultUser });

    await renderApp();
    await click(getBlankCardButton('Create'));

    expect(getSaveMapModal()).not.toBeNull();
    expect(container.textContent).toContain('Create Map');
  });

  test('logged-in modify opens the projects panel', async () => {
    suppressWelcomeModal();
    api.getMe.mockResolvedValue({ user: defaultUser });

    await renderApp();
    await click(getBlankCardButton('Modify'));

    expect(getProjectsDrawer()).not.toBeNull();
    expect(container.textContent).toContain('Projects & Maps');
  });

  test('logged-out modify opens auth with contextual supporting copy', async () => {
    suppressWelcomeModal();

    await renderApp();
    await click(getBlankCardButton('Modify'));

    expect(getAuthModal()).not.toBeNull();
    expect(container.textContent).toContain('Log in or sign up to select and modify maps.');
  });

  test('successful auth from modify auto-opens the projects panel', async () => {
    suppressWelcomeModal();

    await renderApp();
    await click(getBlankCardButton('Modify'));
    await submitAuthForm({
      email: defaultUser.email,
      password: 'password123',
    });

    expect(api.login).toHaveBeenCalledWith(defaultUser.email, 'password123');
    expect(getProjectsDrawer()).not.toBeNull();
    expect(container.textContent).toContain('Projects & Maps');
    expect(container.textContent).not.toContain('Log in or sign up to select and modify maps.');
  });

  test('auth opened from create does not reuse the modify-specific message', async () => {
    suppressWelcomeModal();

    await renderApp();
    await click(getBlankCardButton('Create'));

    expect(getAuthModal()).not.toBeNull();
    expect(container.textContent).not.toContain('Log in or sign up to select and modify maps.');
  });

  test('does not appear once dismissal is persisted', async () => {
    api.getMe.mockResolvedValue({ user: defaultUser });
    window.localStorage.setItem(WELCOME_MODAL_STORAGE_KEY, 'true');

    await renderApp();

    expect(getWelcomeModal()).toBeNull();
  });

  test('logged-out users still see the modal even if dismissal is persisted', async () => {
    window.localStorage.setItem(WELCOME_MODAL_STORAGE_KEY, 'true');

    await renderApp();

    expect(getWelcomeModal()).not.toBeNull();
    expect(getDontShowAgainCheckbox().disabled).toBe(true);
  });

  test('checking the box and clicking Close persists dismissal for logged-in users', async () => {
    api.getMe.mockResolvedValue({ user: defaultUser });
    await renderApp();

    await click(getDontShowAgainCheckbox());
    await click(getButton('Close'));

    expect(window.localStorage.getItem(WELCOME_MODAL_STORAGE_KEY)).toBe('true');
    expect(getWelcomeModal()).toBeNull();
  });

  test('checking the box and clicking OK persists dismissal for logged-in users', async () => {
    api.getMe.mockResolvedValue({ user: defaultUser });
    await renderApp();

    await click(getDontShowAgainCheckbox());
    await click(getButton('OK'));

    expect(window.localStorage.getItem(WELCOME_MODAL_STORAGE_KEY)).toBe('true');
    expect(getWelcomeModal()).toBeNull();
  });

  test('leaving the box unchecked does not persist dismissal', async () => {
    await renderApp();

    await click(getButton('Close'));

    expect(window.localStorage.getItem(WELCOME_MODAL_STORAGE_KEY)).toBeNull();
    expect(getWelcomeModal()).toBeNull();
  });

  test.each([
    {
      label: 'share surface',
      route: {
        surface: ROUTE_SURFACES.SHARE,
        shareId: 'share-1',
        accessLevel: 'view',
      },
    },
    {
      label: 'invite acceptance flow',
      route: {
        surface: ROUTE_SURFACES.APP,
        section: 'invite_accept',
        inviteToken: 'invite-1',
        mapId: null,
      },
    },
    {
      label: 'map access gate flow',
      route: {
        surface: ROUTE_SURFACES.APP,
        section: 'map',
        mapId: 'map-1',
      },
    },
  ])('does not appear on $label', async ({ route }) => {
    await renderApp(route);

    expect(getWelcomeModal()).toBeNull();
    expect(container.textContent).not.toContain('Welcome to Vellic');
  });

  test('localStorage failures do not crash the app', async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    await renderApp();

    await click(getDontShowAgainCheckbox());
    await click(getButton('Close'));

    expect(setItemSpy).toHaveBeenCalled();
    expect(getWelcomeModal()).toBeNull();
    expect(container.textContent).toContain('Start with a URL');
  });
});
