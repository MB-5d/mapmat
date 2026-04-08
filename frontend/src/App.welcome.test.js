import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import App, { WELCOME_MODAL_STORAGE_KEY } from './App';
import * as api from './api';
import { ROUTE_SURFACES } from './utils/appRoutes';

jest.mock('./api', () => ({
  getMe: jest.fn(),
  getShare: jest.fn(),
}));

describe('App welcome modal', () => {
  let container;
  let root;

  const baseRoute = {
    surface: ROUTE_SURFACES.APP,
    section: 'home',
    mapId: null,
  };

  const renderApp = async (currentRoute = baseRoute) => {
    await act(async () => {
      root.render(<App currentRoute={currentRoute} navigateToRoute={jest.fn()} />);
      await Promise.resolve();
    });
  };

  const getWelcomeModal = () => container.querySelector('.welcome-modal');

  const getButton = (label) => Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent.trim() === label
  );

  const getDontShowAgainCheckbox = () => container.querySelector('.welcome-modal-checkbox input[type="checkbox"]');

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
    api.getMe.mockRejectedValue(new Error('Not authenticated'));
    api.getShare.mockResolvedValue({ share: {} });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
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
    expect(container.textContent).toContain('Welcome to Map Mat');
    expect(container.textContent).toContain('Ready to Map');
  });

  test('does not appear once dismissal is persisted', async () => {
    window.localStorage.setItem(WELCOME_MODAL_STORAGE_KEY, 'true');

    await renderApp();

    expect(getWelcomeModal()).toBeNull();
  });

  test('checking the box and clicking Close persists dismissal', async () => {
    await renderApp();

    act(() => {
      getDontShowAgainCheckbox().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      getButton('Close').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(window.localStorage.getItem(WELCOME_MODAL_STORAGE_KEY)).toBe('true');
    expect(getWelcomeModal()).toBeNull();
  });

  test('checking the box and clicking OK persists dismissal', async () => {
    await renderApp();

    act(() => {
      getDontShowAgainCheckbox().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      getButton('OK').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(window.localStorage.getItem(WELCOME_MODAL_STORAGE_KEY)).toBe('true');
    expect(getWelcomeModal()).toBeNull();
  });

  test('leaving the box unchecked does not persist dismissal', async () => {
    await renderApp();

    act(() => {
      getButton('Close').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

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
    expect(container.textContent).not.toContain('Welcome to Map Mat');
  });

  test('localStorage failures do not crash the app', async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    await renderApp();

    act(() => {
      getDontShowAgainCheckbox().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      getButton('Close').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(setItemSpy).toHaveBeenCalled();
    expect(getWelcomeModal()).toBeNull();
    expect(container.textContent).toContain('Ready to Map');
  });
});
