import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import MarketingScanBar, { isMarketingPhoneViewport } from './MarketingScanBar';

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('MarketingScanBar', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  test('validates and opens the app scan URL on desktop', () => {
    const openApp = vi.fn();
    act(() => {
      root.render(<MarketingScanBar onOpenApp={openApp} />);
    });

    const input = container.querySelector('input');
    expect(container.querySelector('.scan-btn')?.disabled).toBe(true);

    act(() => {
      setInputValue(input, 'example.com');
    });

    expect(container.querySelector('.scan-btn')?.disabled).toBe(false);

    act(() => {
      container.querySelector('.scan-btn').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    const openedUrl = new URL(openApp.mock.calls[0][0]);
    expect(openedUrl.origin).toBe('https://app.vellic.io');
    expect(openedUrl.pathname).toBe('/app');
    expect(openedUrl.searchParams.get('intent')).toBe('scan');
    expect(openedUrl.searchParams.get('url')).toBe('https://example.com/');
    expect(openedUrl.searchParams.get('inactivePages')).toBe('true');
  });

  test('routes phones to the marketing start handoff', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const navigate = vi.fn();
    act(() => {
      root.render(<MarketingScanBar onNavigate={navigate} onOpenApp={vi.fn()} />);
    });

    const input = container.querySelector('input');
    act(() => {
      setInputValue(input, 'vellic.io');
      container.querySelector('.scan-btn').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(navigate).toHaveBeenCalledWith('/marketing-preview/start?url=https%3A%2F%2Fvellic.io%2F');
  });

  test('allows a phone scan override without routing to the start handoff', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const phoneScan = vi.fn();
    const navigate = vi.fn();
    act(() => {
      root.render(<MarketingScanBar onNavigate={navigate} onPhoneScan={phoneScan} onOpenApp={vi.fn()} />);
    });

    const input = container.querySelector('input');
    act(() => {
      setInputValue(input, 'vellic.io');
      container.querySelector('.scan-btn').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(phoneScan).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://vellic.io/',
      appUrl: expect.stringContaining('https%3A%2F%2Fvellic.io%2F'),
    }));
  });

  test('shows an accessible validation error for invalid URLs', () => {
    act(() => {
      root.render(<MarketingScanBar onOpenApp={vi.fn()} />);
    });

    const input = container.querySelector('input');
    act(() => {
      setInputValue(input, 'not a url');
      container.querySelector('.scan-btn').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(container.textContent).toContain('Enter a public website URL');
    expect(container.querySelector('.marketing-scan-bar__app-shell')?.className).toContain('is-invalid');
  });

  test('detects phone-sized marketing viewports', () => {
    expect(isMarketingPhoneViewport({ width: 390 })).toBe(true);
    expect(isMarketingPhoneViewport({ width: 1024 })).toBe(false);
  });
});
