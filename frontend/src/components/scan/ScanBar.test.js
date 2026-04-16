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

    act(() => {
      root.render(
        <div className="search-container">
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
            onClearUrl={jest.fn()}
            showClearUrl={false}
          />
        </div>
      );
    });

    const urlInput = container.querySelector('.search-container input:not([type="checkbox"])');
    const depthSelect = container.querySelector('.layers-panel-select-input');
    const scanButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Scan')
    );

    expect(urlInput.className).toContain('ui-input');
    expect(depthSelect.className).toContain('ui-select');
    expect(scanButton.className).toContain('ui-btn');
  });
});
