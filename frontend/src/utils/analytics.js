import {
  APP_ONLY_MODE,
  CLARITY_PROJECT_ID,
  ENABLE_ANALYTICS,
  GA_MEASUREMENT_ID,
  SENTRY_DSN,
} from './constants';

let gaInitialized = false;
let clarityInitialized = false;
let sentryInitialized = false;
let lastPagePath = '';
let currentConsent = null;

const SAFE_EVENT_PARAM_KEYS = new Set([
  'authenticated_pages',
  'autosaved',
  'count',
  'depth',
  'has_rating',
  'has_target',
  'intent',
  'mentions',
  'page_count',
  'partial',
  'partial_reason',
  'phase',
  'reply',
  'role',
  'route_section',
  'scope',
  'type',
]);

function appendScript(id, src) {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById(id);
  if (existing) return existing;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
  return script;
}

function initClarity() {
  if (!CLARITY_PROJECT_ID || typeof window === 'undefined') return;
  if (clarityInitialized) return;
  clarityInitialized = true;
  (function clarityBootstrap(c, l, a, r, i, t, y) {
    c[a] = c[a] || function clarityQueue() { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r);
    t.async = 1;
    t.src = `https://www.clarity.ms/tag/${i}`;
    y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
  }(window, document, 'clarity', 'script', CLARITY_PROJECT_ID));
  updateClarityConsent(true);
}

function setGoogleConsentDefaults() {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  if (window.__mapmatGoogleConsentDefaulted) return;
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
  });
  window.__mapmatGoogleConsentDefaulted = true;
}

function updateGoogleConsent(consent) {
  if (typeof window === 'undefined') return;
  setGoogleConsentDefaults();
  window.gtag('consent', 'update', {
    analytics_storage: consent?.analytics ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
  });
}

function updateClarityConsent(allowed) {
  if (typeof window === 'undefined' || !window.clarity) return;
  window.clarity('consentv2', {
    ad_Storage: 'denied',
    analytics_Storage: allowed ? 'granted' : 'denied',
  });
  if (!allowed) {
    window.clarity('consent', false);
  }
}

function initGa(consent) {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined') return;
  updateGoogleConsent(consent);
  if (gaInitialized) return;
  gaInitialized = true;
  appendScript('ga4-js', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`);
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    app_name: 'Map Mat',
  });
}

function initSentryBrowser() {
  if (!SENTRY_DSN || typeof window === 'undefined') return;
  if (sentryInitialized) return;
  sentryInitialized = true;
  appendScript('sentry-browser-js', 'https://browser.sentry-cdn.com/7.120.3/bundle.tracing.min.js');
  const tryInit = () => {
    if (!window.Sentry || window.__mapmatSentryInitialized) return;
    window.Sentry.init({
      dsn: SENTRY_DSN,
      environment: APP_ONLY_MODE ? 'staging' : 'development',
      tracesSampleRate: 0.2,
    });
    window.__mapmatSentryInitialized = true;
  };
  window.setTimeout(tryInit, 1000);
}

function getSafePagePath(pathname, params = {}) {
  const surface = String(params.surface || '').trim().toLowerCase();
  const section = String(params.section || '').trim().toLowerCase();
  if (surface && section) return `/${surface}/${section}`;
  if (surface) return `/${surface}`;

  try {
    const url = new URL(pathname, window.location.origin);
    const firstSegment = url.pathname.split('/').filter(Boolean)[0] || '';
    return firstSegment ? `/${firstSegment}` : '/';
  } catch (error) {
    return '/';
  }
}

function sanitizeEventParams(params = {}) {
  return Object.entries(params).reduce((safeParams, [key, value]) => {
    if (!SAFE_EVENT_PARAM_KEYS.has(key)) return safeParams;
    if (value === null || value === undefined) return safeParams;
    if (typeof value === 'number' || typeof value === 'boolean') {
      safeParams[key] = value;
      return safeParams;
    }
    safeParams[key] = String(value).slice(0, 80);
    return safeParams;
  }, {});
}

export function initAnalytics(consent = null) {
  if (typeof window === 'undefined') return;
  setGoogleConsentDefaults();
  currentConsent = consent;

  if (!ENABLE_ANALYTICS || !consent) return;

  updateGoogleConsent(consent);
  updateClarityConsent(consent.experienceResearch);

  initSentryBrowser();
  if (consent.analytics) initGa(consent);
  if (consent.experienceResearch) initClarity();
}

export function identifyAnalyticsUser(user) {
  if (!ENABLE_ANALYTICS || typeof window === 'undefined') return;
  const userId = user?.id || null;

  if (currentConsent?.analytics && window.gtag && userId) {
    window.gtag('set', 'user_properties', {
      user_id: userId,
    });
  }
  if (window.Sentry && userId) {
    window.Sentry.setUser({
      id: userId,
    });
  }
}

export function clearAnalyticsUser() {
  if (typeof window === 'undefined') return;
  if (window.Sentry) {
    window.Sentry.setUser(null);
  }
}

export function trackEvent(name, params = {}) {
  if (!ENABLE_ANALYTICS || typeof window === 'undefined' || !name) return;
  const safeParams = sanitizeEventParams(params);
  if (currentConsent?.analytics && window.gtag) {
    window.gtag('event', name, safeParams);
  }
  if (currentConsent?.experienceResearch && window.clarity) {
    window.clarity('event', name);
  }
}

export function trackPageView(pathname, params = {}) {
  if (!ENABLE_ANALYTICS || typeof window === 'undefined' || !currentConsent?.analytics || !pathname) return;
  const safePagePath = getSafePagePath(pathname, params);
  if (safePagePath === lastPagePath) return;
  lastPagePath = safePagePath;
  if (window.gtag && GA_MEASUREMENT_ID) {
    window.gtag('event', 'page_view', {
      page_path: safePagePath,
      ...params,
    });
  }
}

export function captureFrontendError(error, context = {}) {
  if (typeof window === 'undefined' || !window.Sentry || !error) return;
  window.Sentry.captureException(error, {
    extra: context,
  });
}
