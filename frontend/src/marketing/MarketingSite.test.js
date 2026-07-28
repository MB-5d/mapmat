import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import MarketingSite from './MarketingSite';
import { parseCurrentRoute, ROUTE_SURFACES } from '../utils/appRoutes';

describe('MarketingSite', () => {
  let container;
  let root;

  const renderAt = (path, navigateToRoute = jest.fn()) => {
    window.history.pushState({}, '', path);
    const route = parseCurrentRoute(window.location);
    act(() => {
      root.render(<MarketingSite route={route} navigateToRoute={navigateToRoute} onOpenApp={jest.fn()} />);
    });
    return { route, navigateToRoute };
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    window.history.pushState({}, '', '/');
  });

  test('renders the active marketing preview page and nav state', () => {
    renderAt('/marketing-preview/features');

    expect(container.textContent).toContain('Scan, create, edit, review, capture, and export.');
    expect(container.textContent).toContain('Comparison matrix');
    expect(container.textContent).toContain('Create or import maps');
    expect(container.textContent).toContain('Templates and assistant');
    expect(container.querySelector('.marketing-header__nav a[aria-current="page"]')?.textContent).toBe('Features');
    expect(container.textContent).not.toContain('Map Insights');
  });

  test('uses the logo as the overview link and omits overview from the top nav', () => {
    renderAt('/marketing-preview');

    expect(container.querySelector('.marketing-header__brand')?.getAttribute('href')).toBe('/marketing-preview');
    expect(Array.from(container.querySelectorAll('.marketing-header__nav > a')).map((link) => link.textContent.trim()))
      .not.toContain('Overview');
  });

  test('keeps parent nav active for child node routes', () => {
    renderAt('/marketing-preview/features/site-scanning');

    expect(container.textContent).toContain('Start from the live site, not a blank diagram.');
    expect(container.querySelector('.marketing-header__nav a[aria-current="page"]')?.textContent).toBe('Features');
  });

  test('uses real links and intercepts marketing navigation for SPA routing', () => {
    const navigateToRoute = jest.fn();
    renderAt('/marketing-preview', navigateToRoute);
    const examplesLink = Array.from(container.querySelectorAll('a')).find((link) => (
      link.getAttribute('href') === '/marketing-preview/examples'
    ));

    act(() => {
      examplesLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(examplesLink.getAttribute('href')).toBe('/marketing-preview/examples');
    expect(navigateToRoute).toHaveBeenCalledWith(expect.objectContaining({
      surface: ROUTE_SURFACES.MARKETING,
      marketingPageId: 'examples',
    }));
  });

  test('applies route-aware metadata', () => {
    renderAt('/marketing-preview/pricing');

    expect(document.title).toBe('Pricing | Vellic');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('plan direction');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://vellic.io/marketing-preview/pricing');
  });

  test('routes phone-sized page CTAs to the start handoff', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const navigateToRoute = jest.fn();
    renderAt('/marketing-preview/features', navigateToRoute);

    act(() => {
      container.querySelector('.marketing-node__primary-link').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
    });

    expect(navigateToRoute).toHaveBeenCalledWith(expect.objectContaining({
      surface: ROUTE_SURFACES.MARKETING,
      marketingPageId: 'start',
    }));
  });
});
