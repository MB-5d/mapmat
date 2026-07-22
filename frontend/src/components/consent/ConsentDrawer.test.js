import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ConsentDrawer from './ConsentDrawer';
import ConsentSettingsModal from './ConsentSettingsModal';
import {
  CONSENT_PROMPT_SEEN_KEY,
  CONSENT_STORAGE_KEY,
  ConsentProvider,
} from '../../contexts/ConsentContext';

describe('ConsentDrawer', () => {
  let container;
  let root;

  beforeEach(() => {
    window.localStorage.clear();
    clearConsentCookies();
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
    clearConsentCookies();
  });

  const clearConsentCookies = () => {
    document.cookie = `${CONSENT_STORAGE_KEY}=; Max-Age=0; Path=/`;
    document.cookie = `${CONSENT_PROMPT_SEEN_KEY}=; Max-Age=0; Path=/`;
  };

  const renderConsentUi = ({ translateText } = {}) => {
    act(() => {
      root.render(
        <ConsentProvider>
          <ConsentDrawer translateText={translateText} />
          <ConsentSettingsModal translateText={translateText} />
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
      'Accept cookies',
      'Cookie settings',
    ]);
    expect(Array.from(container.querySelectorAll('.consent-drawer__actions button')).map((button) => button.type)).toEqual([
      'button',
      'button',
    ]);

    clickButton('Accept cookies');

    const saved = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    expect(saved).toMatchObject({
      necessary: true,
      analytics: true,
      experienceResearch: true,
      marketing: false,
      version: '2026-04-27',
    });
    expect(document.cookie).toContain(CONSENT_STORAGE_KEY);
    expect(document.cookie).toContain(CONSENT_PROMPT_SEEN_KEY);
    expect(container.textContent).not.toContain('Help us improve Vellic');
  });

  test('localizes drawer button labels without changing click behavior', () => {
    const translations = {
      'Help us improve Vellic': 'Ayúdanos a mejorar Vellic',
      'We use necessary storage to keep Vellic working. With your permission, we also use analytics and session feedback tools to understand what is useful, confusing, or broken to improve the site and app for you. We do not use these cookies for marketing, advertising, retargeting, or selling personal data.': 'Usamos almacenamiento necesario para mantener Vellic funcionando.',
      'Accept cookies': 'Aceptar cookies',
      'Cookie settings': 'Configuración de cookies',
    };
    renderConsentUi({ translateText: (source) => translations[source] || source });

    expect(Array.from(container.querySelectorAll('.consent-drawer__actions button')).map((button) => button.textContent.trim())).toEqual([
      'Aceptar cookies',
      'Configuración de cookies',
    ]);

    clickButton('Aceptar cookies');

    const saved = JSON.parse(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    expect(saved.analytics).toBe(true);
    expect(container.textContent).not.toContain('Ayúdanos a mejorar Vellic');
  });

  test('opens settings and saves granular choices', () => {
    renderConsentUi();

    clickButton('Cookie settings');
    expect(container.textContent).toContain('Privacy settings');
    expect(container.textContent).toContain('Reject all optional');
    expect(container.textContent).not.toContain('Accept research cookies');
    expect(container.querySelector('.consent-drawer')).not.toBeNull();

    const toggles = container.querySelectorAll('.consent-toggle-row input');
    const rows = container.querySelectorAll('.consent-toggle-row');
    expect(rows[0].className).toContain('consent-toggle-row--locked-on');
    expect(rows[3].className).toContain('consent-toggle-row--locked-off');
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
