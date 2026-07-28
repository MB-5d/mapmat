import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import RootApp from './RootApp';

vi.mock('./App', () => ({
  default: function MockApp() {
    return <div>App surface</div>;
  },
}));

vi.mock('./marketing/MarketingSite', () => ({
  default: function MockMarketingSite() {
    return <div>Marketing preview surface</div>;
  },
}));

vi.mock('./marketing/MarketingPreviewV2', () => ({
  default: function MockMarketingPreviewV2() {
    return <div>Marketing preview v2 surface</div>;
  },
}));

vi.mock('./components/admin/AdminConsole', () => ({
  default: function MockAdminConsole() {
    return <div>Admin surface</div>;
  },
}));

vi.mock('./components/consent/ConsentDrawer', () => ({
  default: function MockConsentDrawer() {
    return null;
  },
}));

vi.mock('./components/consent/ConsentSettingsModal', () => ({
  default: function MockConsentSettingsModal() {
    return null;
  },
}));

vi.mock('./contexts/ConsentContext', () => ({
  useConsent: () => ({
    consent: { analytics: false },
    hasStoredConsent: false,
  }),
}));

vi.mock('./utils/analytics', () => ({
  initAnalytics: vi.fn(),
  trackPageView: vi.fn(),
}));

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('RootApp device support gate', () => {
  let container;
  let root;

  const renderRoot = () => {
    act(() => {
      root.render(<RootApp />);
    });
  };

  const setViewport = ({ width, height, userAgent, maxTouchPoints = 0, coarsePointer = false }) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints });
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(pointer: coarse)' ? coarsePointer : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
  });

  test('keeps the public marketing site available on phone-sized screens', () => {
    setViewport({
      width: 390,
      height: 844,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('Marketing preview v2 surface');
    expect(container.textContent).not.toContain('Use desktop or tablet landscape');
  });

  test('keeps the marketing preview available on phone-sized screens', () => {
    window.history.pushState({}, '', '/marketing-preview/features');
    setViewport({
      width: 390,
      height: 844,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('Marketing preview surface');
    expect(container.textContent).not.toContain('Use desktop or tablet landscape');
  });

  test('keeps the canonical marketing preview v2 available on phone-sized screens', () => {
    window.history.pushState({}, '', '/features');
    setViewport({
      width: 390,
      height: 844,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('Marketing preview v2 surface');
    expect(container.textContent).not.toContain('Use desktop or tablet landscape');
  });

  test('keeps the marketing preview available on phone-sized screens', () => {
    window.history.pushState({}, '', '/marketing-preview/features');
    setViewport({
      width: 390,
      height: 844,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('Marketing preview surface');
    expect(container.textContent).not.toContain('Use desktop or tablet landscape');
  });

  test('keeps the marketing preview v2 available on phone-sized screens', () => {
    window.history.pushState({}, '', '/marketing-preview-v2/features');
    setViewport({
      width: 390,
      height: 844,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('Marketing preview v2 surface');
    expect(container.textContent).not.toContain('Use desktop or tablet landscape');
  });

  test('blocks app routes on phone-sized screens', () => {
    window.history.pushState({}, '', '/app');
    setViewport({
      width: 390,
      height: 844,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('Use desktop or tablet landscape');
    expect(container.textContent).toContain('Vellic works best on desktop or tablet landscape. Please use a larger screen.');
    expect(container.textContent).not.toContain('App surface');
  });

  test('allows app routes on iPad landscape', () => {
    window.history.pushState({}, '', '/app');
    setViewport({
      width: 1024,
      height: 768,
      userAgent: IPAD_SAFARI_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('App surface');
    expect(container.textContent).not.toContain('Use desktop or tablet landscape');
  });

  test('unblocks app routes after rotating a tablet to landscape', () => {
    window.history.pushState({}, '', '/app');
    setViewport({
      width: 768,
      height: 1024,
      userAgent: IPAD_SAFARI_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();
    expect(container.textContent).toContain('Use desktop or tablet landscape');

    setViewport({
      width: 1024,
      height: 768,
      userAgent: IPAD_SAFARI_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(container.textContent).toContain('App surface');
    expect(container.textContent).not.toContain('Use desktop or tablet landscape');
  });

  test('blocks admin routes on phone-sized screens', () => {
    window.history.pushState({}, '', '/admin');
    setViewport({
      width: 390,
      height: 844,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('Use desktop or tablet landscape');
    expect(container.textContent).not.toContain('Admin surface');
  });
});
