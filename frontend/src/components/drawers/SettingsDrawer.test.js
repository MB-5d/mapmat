import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import SettingsDrawer from './SettingsDrawer';

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
    jest.clearAllMocks();
  });

  test('changes theme and toggles page numbers', () => {
    const onThemeChange = jest.fn();
    const onTogglePageNumbers = jest.fn();

    act(() => {
      root.render(
        <SettingsDrawer
          isOpen
          onClose={jest.fn()}
          theme="auto"
          onThemeChange={onThemeChange}
          showPageNumbers={false}
          onTogglePageNumbers={onTogglePageNumbers}
          consent={{ analytics: false, experienceResearch: false }}
        />
      );
    });

    const lightButton = Array.from(container.querySelectorAll('.ui-segmented-control__option')).find((button) =>
      button.textContent.includes('Light')
    );
    const toggle = container.querySelector('.ui-toggle__input');

    act(() => {
      lightButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onThemeChange).toHaveBeenCalledWith('light');
    expect(onTogglePageNumbers).toHaveBeenCalledTimes(1);
  });

  test('shows cookie consent access and status', () => {
    const onOpenPrivacySettings = jest.fn();

    act(() => {
      root.render(
        <SettingsDrawer
          isOpen
          onClose={jest.fn()}
          theme="auto"
          onThemeChange={jest.fn()}
          showPageNumbers={false}
          onTogglePageNumbers={jest.fn()}
          consent={{ analytics: true, experienceResearch: false }}
          onOpenPrivacySettings={onOpenPrivacySettings}
        />
      );
    });

    expect(container.textContent).toContain('Cookie Consent');
    expect(container.textContent).toContain('Some optional research tools are allowed.');

    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent.includes('Cookie Consent Settings')
    );

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenPrivacySettings).toHaveBeenCalledTimes(1);
  });
});
