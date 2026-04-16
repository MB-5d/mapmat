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
        />
      );
    });

    const lightButton = Array.from(container.querySelectorAll('.settings-segment-option')).find((button) =>
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
});
