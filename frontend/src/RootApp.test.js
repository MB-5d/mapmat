import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import RootApp from './RootApp';

jest.mock('./App', () => function MockApp() {
  return <div>App surface</div>;
});

jest.mock('./LandingPage', () => function MockLandingPage() {
  return <div>Marketing surface</div>;
});

jest.mock('./components/admin/AdminConsole', () => function MockAdminConsole() {
  return <div>Admin surface</div>;
});

jest.mock('./components/consent/ConsentDrawer', () => function MockConsentDrawer() {
  return null;
});

jest.mock('./components/consent/ConsentSettingsModal', () => function MockConsentSettingsModal() {
  return null;
});

jest.mock('./contexts/ConsentContext', () => ({
  useConsent: () => ({
    consent: { analytics: false },
    hasStoredConsent: false,
  }),
}));

jest.mock('./utils/analytics', () => ({
  initAnalytics: jest.fn(),
  trackPageView: jest.fn(),
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
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(pointer: coarse)' ? coarsePointer : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
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
    jest.clearAllMocks();
    window.history.pushState({}, '', '/');
  });

  test('keeps the marketing site available on phone-sized screens', () => {
    setViewport({
      width: 390,
      height: 844,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    renderRoot();

    expect(container.textContent).toContain('Marketing surface');
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
