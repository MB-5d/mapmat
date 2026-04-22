import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';

import ScanBar from './ScanBar';

describe('ScanBar', () => {
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

  test('uses shared input, select, and button primitives for standard scan controls', () => {
    const optionsRef = createRef();
    const onClearUrl = jest.fn();

    act(() => {
      root.render(
        <div className="search-container scan-bar-shell">
          <ScanBar
            canEdit
            urlInput="https://example.com"
            onUrlInputChange={jest.fn()}
            onUrlKeyDown={jest.fn()}
            options={{
              subdomains: false,
              orphanPages: false,
              inactivePages: false,
              errorPages: false,
              duplicates: false,
              authenticatedPages: false,
              files: false,
              brokenLinks: false,
              crosslinks: false,
            }}
            showOptions
            optionsRef={optionsRef}
            onToggleOptions={jest.fn()}
            onOptionChange={jest.fn()}
            scanLayerAvailability={{}}
            scanLayerVisibility={{}}
            onToggleScanLayer={jest.fn()}
            scanDepth={2}
            onScanDepthChange={jest.fn()}
            onScan={jest.fn()}
            scanDisabled={false}
            scanTitle="Run scan"
            sharedTitle=""
            optionsDisabled={false}
            onClearUrl={onClearUrl}
            showClearUrl
          />
        </div>
      );
    });

    const urlInput = container.querySelector('.search-container input:not([type="checkbox"])');
    const depthSelect = container.querySelector('.layers-panel-select-input');
    const scanButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Scan')
    );
    const optionsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Options')
    );
    const clearButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Clear URL'
    );

    expect(urlInput.className).toContain('ui-input');
    expect(depthSelect.className).toContain('ui-select');
    expect(scanButton.className).toContain('ui-btn');
    expect(scanButton.className).toContain('ui-btn--type-primary');
    expect(scanButton.className).toContain('ui-btn--style-brand');
    expect(optionsButton.className).toContain('ui-btn');
    expect(optionsButton.className).toContain('ui-btn--type-secondary');
    expect(optionsButton.className).toContain('ui-btn--style-mono');
    expect(clearButton.className).toContain('ui-icon-btn');
    expect(clearButton.className).toContain('ui-icon-btn--type-ghost');
    expect(clearButton.className).toContain('ui-icon-btn--style-mono');
  });
});
