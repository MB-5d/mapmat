import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import SettingsDrawer from './SettingsDrawer';
import { LocaleProvider } from '../../contexts/LocaleContext';

describe('SettingsDrawer', () => {
  let container;
  let root;

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
    vi.clearAllMocks();
  });

  test('changes theme, map orientation, and page numbers', () => {
    const onThemeChange = vi.fn();
    const onMapOrientationChange = vi.fn();
    const onTogglePageNumbers = vi.fn();

    act(() => {
      root.render(
        <LocaleProvider>
          <SettingsDrawer
            isOpen
            onClose={vi.fn()}
            theme="auto"
            onThemeChange={onThemeChange}
            mapOrientation="vertical"
            onMapOrientationChange={onMapOrientationChange}
            showPageNumbers={false}
            onTogglePageNumbers={onTogglePageNumbers}
            consent={{ analytics: false, experienceResearch: false }}
          />
        </LocaleProvider>
      );
    });

    const lightButton = Array.from(container.querySelectorAll('.ui-segmented-control__option')).find((button) =>
      button.textContent.includes('Light')
    );
    const horizontalButton = Array.from(container.querySelectorAll('.ui-segmented-control__option')).find((button) =>
      button.textContent.includes('Horizontal')
    );
    const toggle = container.querySelector('.ui-toggle__input');

    act(() => {
      lightButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      horizontalButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onThemeChange).toHaveBeenCalledWith('light');
    expect(onMapOrientationChange).toHaveBeenCalledWith('horizontal');
    expect(onTogglePageNumbers).toHaveBeenCalledTimes(1);
  });

  test('shows cookie consent access and status', () => {
    const onOpenPrivacySettings = vi.fn();

    act(() => {
      root.render(
        <LocaleProvider>
          <SettingsDrawer
            isOpen
            onClose={vi.fn()}
            theme="auto"
            onThemeChange={vi.fn()}
            showPageNumbers={false}
            onTogglePageNumbers={vi.fn()}
            consent={{ analytics: true, experienceResearch: false }}
            onOpenPrivacySettings={onOpenPrivacySettings}
          />
        </LocaleProvider>
      );
    });

    expect(container.textContent).toContain('Cookie consent');
    expect(container.textContent).toContain('Some optional research tools are allowed.');

    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent.includes('Cookie consent settings')
    );

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenPrivacySettings).toHaveBeenCalledTimes(1);
  });

  test('switches language using the existing segmented control', () => {
    act(() => {
      root.render(
        <LocaleProvider>
          <SettingsDrawer
            isOpen
            onClose={vi.fn()}
            theme="auto"
            onThemeChange={vi.fn()}
            showPageNumbers={false}
            onTogglePageNumbers={vi.fn()}
            consent={{ analytics: false, experienceResearch: false }}
          />
        </LocaleProvider>
      );
    });

    const spanishButton = Array.from(container.querySelectorAll('.ui-segmented-control__option')).find((button) =>
      button.textContent.includes('Español')
    );

    act(() => {
      spanishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Configuración');
    expect(document.documentElement.lang).toBe('es');
  });
});
