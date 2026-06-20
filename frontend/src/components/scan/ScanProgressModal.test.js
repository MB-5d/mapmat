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

  test('shows cancel and stop actions while scanning', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} />);
    });

    expect(container.textContent).toContain('Cancel');
    expect(container.textContent).toContain('Stop');
    expect(container.querySelector('.modal-footer')).not.toBeNull();

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].className).toContain('ui-btn--type-secondary');
    expect(buttons[1].className).toContain('ui-btn--style-danger');

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onRequestCancel).toHaveBeenCalledTimes(1);
    expect(baseProps.onRequestStop).toHaveBeenCalledTimes(1);
  });

  test('shows scan allowance context while scanning', () => {
    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanLimitNote="This scan can include up to 1,050 pages from your current billing period."
        />
      );
    });

    expect(container.textContent).toContain('This scan can include up to 1,050 pages');
    expect(container.querySelector('.scan-limit-note')).not.toBeNull();
  });

  test('shows captured page count when scan progress includes mapped pages', () => {
    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanProgress={{ scanned: 1357, mapped: 384, queued: 23 }}
        />
      );
    });

    expect(container.textContent).toContain('384');
    expect(container.textContent).toContain('Captured');
    expect(container.textContent).not.toContain('1357Scanned');
  });

  test('shows the existing cancel confirmation flow', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} showCancelConfirm />);
    });

    expect(container.textContent).toContain('Cancel scan?');
    expect(container.textContent).toContain('Yes, cancel scan');
    expect(container.textContent).toContain('No, continue scanning');

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons[0].className).toContain('ui-btn--style-mono');
    expect(buttons[1].className).toContain('ui-btn--style-danger');

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

    expect(container.textContent).toContain('Stop scanning?');
    expect(container.textContent).toContain('Stop scanning and show the pages captured so far?');
    expect(container.textContent).toContain('Stop');
    expect(container.textContent).toContain('Cancel');

    const buttons = Array.from(container.querySelectorAll('button'));

    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onContinueScan).toHaveBeenCalledTimes(1);
    expect(baseProps.onStopScan).toHaveBeenCalledTimes(1);
  });

  test('shows the stopping state on the progress actions', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} isStoppingScan />);
    });

    expect(container.textContent).toContain('Stopping scan and preparing current results...');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[1].className).toContain('ui-btn--style-danger');
    expect(buttons[1].textContent).toBe('Stopping...');
  });

  test('shows the scan error state and lets the user dismiss it', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} loading={false} scanErrorMessage="This scan is no longer available in this browser session" />);
    });

    expect(container.textContent).toContain('Scan failed');
    expect(container.textContent).toContain('This scan is no longer available in this browser session');
    const button = container.querySelector('button');
    expect(button).not.toBeNull();

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(baseProps.onDismissScanError).toHaveBeenCalledTimes(1);
  });
});
