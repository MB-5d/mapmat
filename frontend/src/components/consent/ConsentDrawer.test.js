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
    const button = findButton(label);
    expect(button).toBeTruthy();
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const findButton = (label) => (
    Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent.trim() === label
    )
  );

  test('shows the slim notice until cookies are accepted', () => {
    renderConsentUi();

    expect(container.textContent).toContain('Help us improve Vellic');
    expect(container.textContent).toContain('Accept cookies');
    expect(container.textContent).toContain('Cookie settings');
    expect(container.querySelector('.consent-drawer').textContent).not.toContain('Reject all optional');
    expect(Array.from(container.querySelectorAll('.consent-drawer__actions button')).map((button) => button.textContent.trim())).toEqual([
      'Cookie settings',
      'Accept cookies',
    ]);
    expect(Array.from(container.querySelectorAll('.consent-drawer__actions button')).map((button) => button.type)).toEqual([
      'button',
      'button',
    ]);

    const acceptButton = findButton('Accept cookies');
    act(() => {
      acceptButton.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });

    const saved = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    expect(saved).toMatchObject({
      necessary: true,
      analytics: true,
      experienceResearch: true,
      marketing: false,
      version: '2026-04-27',
    });
    expect(container.textContent).not.toContain('Help us improve Vellic');
  });

  test('opens settings and saves granular choices', () => {
    renderConsentUi();

    clickButton('Cookie settings');
    expect(container.textContent).toContain('Privacy settings');
    expect(container.textContent).toContain('Reject all optional');
    expect(container.textContent).not.toContain('Accept research cookies');
    expect(container.querySelector('.consent-drawer')).not.toBeNull();
    expect(container.querySelector('.consent-drawer').className).toContain('consent-drawer--settings-open');

    const toggles = container.querySelectorAll('.consent-toggle-row input');
    expect(toggles[0].checked).toBe(true);
    expect(toggles[0].disabled).toBe(true);
    expect(toggles[1].checked).toBe(true);
    expect(toggles[2].checked).toBe(true);
    expect(toggles[3].checked).toBe(false);
    expect(toggles[3].disabled).toBe(true);

    act(() => {
      toggles[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const actionButtons = Array.from(container.querySelectorAll('.consent-settings-modal__actions button'));
    expect(actionButtons.map((button) => button.textContent.trim())).toEqual([
      'Save choices',
      'Reject all optional',
    ]);
    expect(actionButtons[1].className).toContain('ui-btn--style-brand');

    clickButton('Save choices');

    const saved = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    expect(saved.analytics).toBe(true);
    expect(saved.experienceResearch).toBe(false);
    expect(saved.marketing).toBe(false);
    expect(container.textContent).not.toContain('Help us improve Vellic');
  });
});
