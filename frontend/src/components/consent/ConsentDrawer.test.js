import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ConsentDrawer from './ConsentDrawer';
import ConsentSettingsModal from './ConsentSettingsModal';
import { CONSENT_STORAGE_KEY, ConsentProvider } from '../../contexts/ConsentContext';

describe('ConsentDrawer', () => {
  let container;
  let root;

  beforeEach(() => {
    window.localStorage.clear();
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
    window.localStorage.clear();
  });

  const renderConsentUi = () => {
    act(() => {
      root.render(
        <ConsentProvider>
          <ConsentDrawer />
          <ConsentSettingsModal />
        </ConsentProvider>
      );
    });
  };

  const clickButton = (label) => {
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent.trim() === label
    );
    expect(button).toBeTruthy();
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  test('shows the slim notice until optional cookies are rejected', () => {
    renderConsentUi();

    expect(container.textContent).toContain('Help us improve Vellic');

    clickButton('Reject all optional');

    const saved = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    expect(saved).toMatchObject({
      necessary: true,
      analytics: false,
      experienceResearch: false,
      marketing: false,
      version: '2026-04-27',
    });
    expect(container.textContent).not.toContain('Help us improve Vellic');
  });

  test('opens settings and saves granular choices', () => {
    renderConsentUi();

    clickButton('Manage settings');
    expect(container.textContent).toContain('Privacy Settings');

    const toggles = container.querySelectorAll('.consent-toggle-row input');
    act(() => {
      toggles[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    clickButton('Save choices');

    const saved = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    expect(saved.analytics).toBe(true);
    expect(saved.experienceResearch).toBe(false);
    expect(saved.marketing).toBe(false);
    expect(container.textContent).not.toContain('Help us improve Vellic');
  });
});
