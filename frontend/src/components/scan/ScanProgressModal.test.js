import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ScanProgressModal from './ScanProgressModal';

describe('ScanProgressModal', () => {
  let container;
  let root;

  const baseProps = {
    loading: true,
    showCancelConfirm: false,
    isStoppingScan: false,
    scanMessage: 'Scanning site structure...',
    scanProgress: { scanned: 12, queued: 4 },
    scanElapsed: 95,
    urlInput: 'https://example.com',
    onRequestCancel: jest.fn(),
    onStopScan: jest.fn(),
    onCancelScan: jest.fn(),
    onContinueScan: jest.fn(),
  };

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

  test('shows stop, cancel, and continue actions in the confirmation state', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} showCancelConfirm />);
    });

    expect(container.textContent).toContain('Stop and Show Current Results');
    expect(container.textContent).toContain('Cancel and Discard');
    expect(container.textContent).toContain('Keep Scanning');

    const buttons = Array.from(container.querySelectorAll('button'));

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onStopScan).toHaveBeenCalledTimes(1);
    expect(baseProps.onCancelScan).toHaveBeenCalledTimes(1);
    expect(baseProps.onContinueScan).toHaveBeenCalledTimes(1);
  });

  test('shows the stopping state and disables the main action button', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} isStoppingScan />);
    });

    expect(container.textContent).toContain('Stopping scan and preparing current results...');
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Preparing current results...');
  });
});
