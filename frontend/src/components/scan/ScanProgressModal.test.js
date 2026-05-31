import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ScanProgressModal from './ScanProgressModal';

describe('ScanProgressModal', () => {
  let container;
  let root;

  const baseProps = {
    loading: true,
    showCancelConfirm: false,
    showStopConfirm: false,
    isStoppingScan: false,
    scanErrorMessage: '',
    scanMessage: 'Scanning site structure...',
    scanProgress: { scanned: 12, queued: 4 },
    scanElapsed: 95,
    urlInput: 'https://example.com',
    onRequestCancel: jest.fn(),
    onRequestStop: jest.fn(),
    onStopScan: jest.fn(),
    onCancelScan: jest.fn(),
    onContinueScan: jest.fn(),
    onDismissScanError: jest.fn(),
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

  test('shows separate cancel and stop actions while scanning', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} />);
    });

    expect(container.textContent).toContain('Cancel');
    expect(container.textContent).toContain('Stop');
    expect(container.querySelector('.modal-footer')).not.toBeNull();

    const buttons = Array.from(container.querySelectorAll('button'));

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onRequestCancel).toHaveBeenCalledTimes(1);
    expect(baseProps.onRequestStop).toHaveBeenCalledTimes(1);
  });

  test('shows the existing cancel confirmation flow', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} showCancelConfirm />);
    });

    expect(container.textContent).toContain('Cancel Scan?');
    expect(container.textContent).toContain('Yes, Cancel Scan');
    expect(container.textContent).toContain('No, Continue Scanning');

    const buttons = Array.from(container.querySelectorAll('button'));

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onContinueScan).toHaveBeenCalledTimes(1);
    expect(baseProps.onCancelScan).toHaveBeenCalledTimes(1);
  });

  test('shows the stop confirmation flow', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} showStopConfirm />);
    });

    expect(container.textContent).toContain('Stop Scanning?');
    expect(container.textContent).toContain('Stop scanning and show current progress?');
    expect(container.textContent).toContain('Yes');
    expect(container.textContent).toContain('Cancel');

    const buttons = Array.from(container.querySelectorAll('button'));

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onContinueScan).toHaveBeenCalledTimes(1);
    expect(baseProps.onStopScan).toHaveBeenCalledTimes(1);
  });

  test('shows the stopping state and disables scan actions', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} isStoppingScan />);
    });

    expect(container.textContent).toContain('Stopping scan and preparing current results...');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(buttons[1].textContent).toBe('Stopping...');
  });

  test('shows the scan error state and lets the user dismiss it', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} loading={false} scanErrorMessage="This scan is no longer available in this browser session" />);
    });

    expect(container.textContent).toContain('Scan Failed');
    expect(container.textContent).toContain('This scan is no longer available in this browser session');
    const button = container.querySelector('button');
    expect(button).not.toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onDismissScanError).toHaveBeenCalledTimes(1);
  });
});
