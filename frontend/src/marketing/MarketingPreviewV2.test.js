import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import MarketingPreviewV2 from './MarketingPreviewV2';
import { parseCurrentRoute, ROUTE_SURFACES } from '../utils/appRoutes';

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('MarketingPreviewV2', () => {
  let container;
  let root;
  let scrollIntoView;
  let originalScrollTo;
  let scrollTo;

  const renderAt = (path, navigateToRoute = jest.fn(), props = {}) => {
    window.history.pushState({}, '', path);
    const route = parseCurrentRoute(window.location);
    act(() => {
      root.render(
        <MarketingPreviewV2
          route={route}
          navigateToRoute={navigateToRoute}
          onOpenApp={jest.fn()}
          {...props}
        />
      );
    });
    return { route, navigateToRoute };
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    scrollIntoView = jest.fn();
    scrollTo = jest.fn();
    originalScrollTo = window.scrollTo;
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    window.scrollTo = scrollTo;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    delete window.HTMLElement.prototype.scrollIntoView;
    window.scrollTo = originalScrollTo;
    window.history.pushState({}, '', '/');
    jest.clearAllMocks();
  });

  test('renders a direct V2 section route with route-aware metadata', () => {
    renderAt('/marketing-preview-v2/features');

    expect(container.textContent).toContain('Scan, create, edit, review, capture, export.');
    expect(container.textContent).toContain('Live site crawl from URL');
    expect(container.textContent).toContain('Create / import');
    expect(container.querySelector('#marketing-v2-features')?.textContent).toContain('Templates and assistant');
    expect(container.querySelector('.marketing-v2-header__nav a[aria-current="page"]')?.textContent).toBe('Features');
    expect(document.title).toBe('Features | Vellic Marketing Preview V2');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://vellic.io/marketing-preview-v2/features');
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
  });

  test('uses real nav links and intercepts V2 routing for SPA navigation', () => {
    const navigateToRoute = jest.fn();
    renderAt('/marketing-preview-v2', navigateToRoute);
    const examplesLink = Array.from(container.querySelectorAll('a')).find((link) => (
      link.getAttribute('href') === '/marketing-preview-v2/examples'
    ));

    act(() => {
      examplesLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(examplesLink.getAttribute('href')).toBe('/marketing-preview-v2/examples');
    expect(navigateToRoute).toHaveBeenCalledWith(expect.objectContaining({
      surface: ROUTE_SURFACES.MARKETING,
      marketingPreviewVersion: 'v2',
      marketingPageId: 'examples',
    }));
  });

  test('opens the app scan URL on desktop', () => {
    const openApp = jest.fn();
    renderAt('/marketing-preview-v2', jest.fn(), { onOpenApp: openApp });

    const input = container.querySelector('.marketing-scan-bar input');
    act(() => {
      setInputValue(input, 'example.com');
      container.querySelector('.marketing-scan-bar .scan-btn').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
    });

    const openedUrl = new URL(openApp.mock.calls[0][0]);
    expect(openedUrl.origin).toBe('https://app.vellic.io');
    expect(openedUrl.pathname).toBe('/app');
    expect(openedUrl.searchParams.get('intent')).toBe('scan');
    expect(openedUrl.searchParams.get('url')).toBe('https://example.com/');
  });

  test('routes phone scan CTA to the V2 start section', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const navigateToRoute = jest.fn();
    renderAt('/marketing-preview-v2', navigateToRoute);

    const input = container.querySelector('.marketing-scan-bar input');
    act(() => {
      setInputValue(input, 'vellic.io');
      container.querySelector('.marketing-scan-bar .scan-btn').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
    });

    expect(navigateToRoute).toHaveBeenCalledWith(expect.objectContaining({
      surface: ROUTE_SURFACES.MARKETING,
      marketingPreviewVersion: 'v2',
      marketingPageId: 'start',
      search: '?url=https%3A%2F%2Fvellic.io%2F',
    }));
  });

  test('keeps upcoming and start handoff content on the one-page concept', () => {
    renderAt('/marketing-preview-v2/start?url=https%3A%2F%2Fexample.com%2F');

    expect(container.textContent).toContain('Templates and assistant');
    expect(container.textContent).toContain('Tree testing / navigation prototyping');
    expect(container.textContent).toContain('Copy app link');
    expect(container.textContent).toContain('Open app anyway');
  });
});
