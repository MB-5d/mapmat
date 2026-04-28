const loadAnalytics = () => {
  jest.resetModules();
  process.env.REACT_APP_ENABLE_ANALYTICS = 'true';
  process.env.REACT_APP_GA_MEASUREMENT_ID = 'G-TEST123';
  process.env.REACT_APP_CLARITY_PROJECT_ID = 'clarity-test';
  return require('./analytics');
};

describe('analytics consent gating', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    delete window.dataLayer;
    delete window.gtag;
    delete window.clarity;
    delete window.__mapmatGoogleConsentDefaulted;
  });

  afterEach(() => {
    delete process.env.REACT_APP_ENABLE_ANALYTICS;
    delete process.env.REACT_APP_GA_MEASUREMENT_ID;
    delete process.env.REACT_APP_CLARITY_PROJECT_ID;
  });

  test('does not load GA4 or Clarity before consent', () => {
    const { initAnalytics } = loadAnalytics();

    initAnalytics(null);

    expect(document.getElementById('ga4-js')).toBeNull();
    expect(document.querySelector('script[src*="clarity.ms"]')).toBeNull();
    expect(Array.from(window.dataLayer[0])).toEqual([
      'consent',
      'default',
      expect.objectContaining({
        analytics_storage: 'denied',
        ad_storage: 'denied',
        functionality_storage: 'granted',
        security_storage: 'granted',
      }),
    ]);
  });

  test('loads allowed tools only after matching consent', () => {
    const { initAnalytics } = loadAnalytics();

    initAnalytics({
      necessary: true,
      analytics: true,
      experienceResearch: false,
      marketing: false,
    });

    expect(document.getElementById('ga4-js')).not.toBeNull();
    expect(document.querySelector('script[src*="clarity.ms"]')).toBeNull();

    initAnalytics({
      necessary: true,
      analytics: true,
      experienceResearch: true,
      marketing: false,
    });

    expect(document.querySelector('script[src*="clarity.ms/tag/clarity-test"]')).not.toBeNull();
  });

  test('drops private event parameters before sending GA events', () => {
    const { initAnalytics, trackEvent } = loadAnalytics();

    initAnalytics({
      necessary: true,
      analytics: true,
      experienceResearch: false,
      marketing: false,
    });

    trackEvent('project_created', {
      project_id: 'private-id',
      project_name: 'Client Redesign',
      page_count: 12,
    });

    const eventArgs = Array.from(window.dataLayer[window.dataLayer.length - 1]);
    expect(eventArgs).toEqual(['event', 'project_created', { page_count: 12 }]);
  });
});
