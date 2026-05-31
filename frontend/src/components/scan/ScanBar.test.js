import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';

import ScanBar from './ScanBar';

describe('ScanBar', () => {
  let container;
  let root;

  const defaultOptions = {
    subdomains: false,
    orphanPages: false,
    inactivePages: true,
    errorPages: true,
    duplicates: true,
    authenticatedPages: false,
    files: false,
    brokenLinks: false,
    crosslinks: false,
  };

  const renderScanBar = (props = {}) => {
    const optionsRef = createRef();
    const defaults = {
      canEdit: true,
      urlInput: 'https://example.com',
      onUrlInputChange: jest.fn(),
      onUrlKeyDown: jest.fn(),
      options: defaultOptions,
      showOptions: false,
      optionsRef,
      onToggleOptions: jest.fn(),
      onOptionChange: jest.fn(),
      scanLayerAvailability: {},
      scanLayerVisibility: {},
      onToggleScanLayer: jest.fn(),
      onScan: jest.fn(),
      scanDisabled: false,
      scanTitle: 'Run scan',
      sharedTitle: '',
      optionsDisabled: false,
      onClearUrl: jest.fn(),
      showClearUrl: false,
    };

    act(() => {
      root.render(
        <div className="search-container scan-bar-shell">
          <ScanBar {...defaults} {...props} />
        </div>
      );
    });

    return { ...defaults, ...props };
  };

  const getScanButton = () => Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent.includes('Scan')
  );

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

  test('uses shared input and button primitives for standard scan controls', () => {
    const onClearUrl = jest.fn();

    renderScanBar({
      showOptions: true,
      onClearUrl,
      showClearUrl: true,
    });

    const urlInput = container.querySelector('.search-container input:not([type="checkbox"])');
    const scanButton = getScanButton();
    const optionsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Options')
    );
    const clearButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Clear URL'
    );

    expect(urlInput.className).toContain('ui-input');
    expect(container.querySelector('.scan-options-depth-select-input')).toBeNull();
    expect(container.textContent).not.toContain('Scan depth');
    expect(container.querySelector('.scan-options-depth-label')).toBeNull();
    expect(container.textContent).not.toContain('during testing');
    expect(container.textContent).not.toContain('Not ready for testing yet');
    expect(container.textContent).not.toContain('Authenticated Pages');
    expect(container.querySelector('.layers-panel-hint')).toBeNull();
    expect(container.querySelectorAll('.scan-options-group')).toHaveLength(4);
    expect(scanButton.className).toContain('ui-btn');
    expect(scanButton.className).toContain('ui-btn--type-primary');
    expect(scanButton.className).toContain('ui-btn--style-brand');
    expect(optionsButton.className).toContain('ui-btn');
    expect(optionsButton.className).toContain('ui-btn--type-secondary');
    expect(optionsButton.className).toContain('ui-btn--style-brand');
    expect(clearButton.className).toContain('ui-icon-btn');
    expect(clearButton.className).toContain('ui-icon-btn--type-ghost');
    expect(clearButton.className).toContain('ui-icon-btn--style-mono');
  });

  test('shows standard status options enabled by default', () => {
    renderScanBar({ showOptions: true });

    ['Inactive pages', 'Error pages', 'Duplicates'].forEach((label) => {
      const item = Array.from(container.querySelectorAll('.scan-options-checkbox')).find((entry) =>
        entry.textContent.includes(label)
      );
      expect(item?.querySelector('input')?.checked).toBe(true);
    });
  });

  test('disables the scan action when the URL is invalid', () => {
    const onScan = jest.fn();
    renderScanBar({
      urlInput: 'not-a-url',
      onScan,
      scanDisabled: true,
      scanTitle: 'Enter a valid URL to scan',
    });

    const scanButton = getScanButton();
    expect(scanButton.disabled).toBe(true);
    expect(scanButton.title).toBe('Enter a valid URL to scan');

    scanButton.click();
    expect(onScan).not.toHaveBeenCalled();
  });
});
