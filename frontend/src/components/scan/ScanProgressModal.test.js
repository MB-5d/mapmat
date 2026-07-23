import fs from 'fs';
import path from 'path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import ScanProgressModal from './ScanProgressModal';

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');

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
    expect(container.textContent).toContain('Pages captured');
    expect(container.textContent).toContain('384 of 407');
    const pagesSection = container.querySelector('.scan-chart-section--pages');
    const findingsSection = container.querySelector('.scan-chart-section--findings');
    expect(pagesSection.querySelector('.scan-queue-note').textContent).toContain('23remaining');
    expect(findingsSection.querySelector('.scan-queue-note')).toBeNull();
    expect(findingsSection.querySelector('.scan-findings-bar')).not.toBeNull();
    expect(findingsSection.querySelector('.scan-findings-empty').textContent).toBe('No findings yet');
    expect(pagesSection.querySelector('.scan-inline-note').textContent).toBe('(94%)');
    expect(container.textContent).not.toContain('1357Scanned');
  });

  test('uses the discovered total when it is larger than the active queue', () => {
    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanProgress={{
            scanned: 30,
            mapped: 30,
            queued: 0,
            discovered: 48,
            sequence: 14,
          }}
        />
      );
    });

    expect(container.textContent).toContain('30 of 48');
    expect(container.querySelector('.scan-queue-note').textContent).toContain('18remaining');
  });

  test('uses stable backend phase messages instead of rotating status copy', () => {
    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanMessage="Older rotating message"
          scanProgress={{ scanned: 12, mapped: 10, queued: 4, discovered: 16, phase: 'scanning' }}
        />
      );
    });

    expect(container.textContent).toContain('Capturing pages...');
    expect(container.textContent).not.toContain('Older rotating message');
  });

  test('uses the requested scan chart dimensions and spacing', () => {
    expect(appCss).toMatch(/\.scan-url \{[\s\S]*margin: 0 0 40px;/);
    expect(appCss).toMatch(/\.scan-time-chart \{[\s\S]*--scan-time-ring-size: 192px;[\s\S]*--scan-time-ring-thickness: 16px;[\s\S]*margin: 0 auto 32px;/);
    expect(appCss).toMatch(/\.scan-time-donut::after \{[\s\S]*inset: var\(--scan-time-ring-thickness\);/);
    expect(appCss).toMatch(/\.scan-chart-section \+ \.scan-chart-section \{[\s\S]*margin-top: 32px;/);
    expect(appCss).toMatch(/\.scan-progress-track,\n\.scan-findings-bar \{[\s\S]*height: 32px;[\s\S]*border-radius: 6px;/);
    expect(appCss).toMatch(/\.scan-inline-note \{[\s\S]*color: var\(--color-text-secondary\);[\s\S]*font-size: 12px;[\s\S]*font-weight: 500;/);
  });

  test('places elapsed below the time value', () => {
    act(() => {
      root.render(<ScanProgressModal {...baseProps} />);
    });

    const centerItems = Array.from(container.querySelectorAll('.scan-time-center > span'))
      .map((item) => item.textContent);
    expect(centerItems.slice(0, 2)).toEqual(['1:35', 'Elapsed']);
  });

  test('uses shared finding tone tokens for findings colors', () => {
    expect(appCss).toMatch(/\.scan-findings-segment \{[\s\S]*background: var\(--ui-tone-accent-current, var\(--ui-color-primary\)\);/);
    expect(appCss).toMatch(/\.scan-finding-dot \{[\s\S]*background: var\(--ui-tone-accent-current, var\(--color-text-secondary\)\);/);
  });

  test('shows only found issue categories in the findings bar', () => {
    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanProgress={{
            scanned: 20,
            mapped: 18,
            queued: 2,
            findings: {
              brokenLinks: 3,
              duplicates: 0,
              errorPages: 2,
              inactivePages: 1,
            },
            totalFindings: 6,
          }}
        />
      );
    });

    expect(container.textContent).toContain('6issues');
    expect(container.textContent).toContain('Broken links');
    expect(container.textContent).toContain('Error');
    expect(container.textContent).toContain('Inactive');
    expect(container.querySelector('.scan-chart-section--findings .scan-inline-note').textContent).toBe('issues');
    expect(container.textContent).not.toContain('Duplicate');

    const segments = Array.from(container.querySelectorAll('.scan-findings-segment'));
    expect(segments).toHaveLength(3);
    expect(segments[0].style.width).toBe('50%');
    expect(segments[0].className).toContain('ui-tone--red');
    expect(segments[1].className).toContain('ui-tone--red');
    expect(segments[2].className).toContain('ui-tone--slate');
    expect(container.querySelector('.scan-finding-dot--brokenLinks')?.className).toContain('ui-tone--red');
  });

  test('does not invent an estimate before enough progress is known', () => {
    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanElapsed={34}
          scanProgress={{ scanned: 1, mapped: 1, queued: 0 }}
        />
      );
    });

    expect(container.textContent).toContain('0:34');
    expect(container.querySelector('.scan-time-total').textContent).toBe('0:34');

    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanElapsed={94}
          scanProgress={{ scanned: 1, mapped: 1, queued: 0 }}
        />
      );
    });

    expect(container.textContent).toContain('1:34');
    expect(container.querySelector('.scan-time-total').textContent).toBe('1:34');
  });

  test('shows an unknown estimate until pages begin completing', () => {
    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanElapsed={18}
          scanProgress={{ scanned: 0, mapped: 0, queued: 1, discovered: 1 }}
        />
      );
    });

    expect(container.querySelector('.scan-time-total').textContent).toBe('--');
    expect(container.querySelector('.scan-time-chart').getAttribute('aria-label')).toContain('still being estimated');
  });

  test('uses completed pages and remaining work for a real estimate', () => {
    act(() => {
      root.render(
        <ScanProgressModal
          {...baseProps}
          scanElapsed={20}
          scanProgress={{ scanned: 4, mapped: 4, queued: 6, discovered: 10 }}
        />
      );
    });

    expect(container.querySelector('.scan-time-total').textContent).toBe('0:50');
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
