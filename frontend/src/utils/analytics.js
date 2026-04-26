import {
  APP_ONLY_MODE,
  CLARITY_PROJECT_ID,
  ENABLE_ANALYTICS,
  GA_MEASUREMENT_ID,
  SENTRY_DSN,
} from './constants';

let analyticsInitialized = false;
let lastPagePath = '';

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
  if (window.clarity) return;
  (function clarityBootstrap(c, l, a, r, i, t, y) {
    c[a] = c[a] || function clarityQueue() { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r);
    t.async = 1;
    t.src = `https://www.clarity.ms/tag/${i}`;
    y = l.getElementsByTagName(r)[0];
    y.parentNode.insertBefore(t, y);
  }(window, document, 'clarity', 'script', CLARITY_PROJECT_ID));
}

function initGa() {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined') return;
  appendScript('ga4-js', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    app_name: 'Vellic',
  });
}

function initSentryBrowser() {
  if (!SENTRY_DSN || typeof window === 'undefined') return;
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

export function initAnalytics() {
  if (!ENABLE_ANALYTICS || analyticsInitialized || typeof window === 'undefined') return;
  analyticsInitialized = true;
  initClarity();
  initGa();
  initSentryBrowser();
}

export function identifyAnalyticsUser(user) {
  if (!ENABLE_ANALYTICS || typeof window === 'undefined') return;
  const userId = user?.id || null;
  const email = user?.email || null;
  const name = user?.name || null;

  if (window.gtag && userId) {
    window.gtag('set', 'user_properties', {
      user_id: userId,
      user_name: name || '',
      user_email: email || '',
    });
  }
  if (window.Sentry && userId) {
    window.Sentry.setUser({
      id: userId,
      email: email || undefined,
      username: name || undefined,
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
  if (window.gtag) {
    window.gtag('event', name, params);
  }
  if (window.clarity) {
    window.clarity('event', name);
  }
}

export function trackPageView(pathname, params = {}) {
  if (!ENABLE_ANALYTICS || typeof window === 'undefined' || !pathname || pathname === lastPagePath) return;
  lastPagePath = pathname;
  if (window.gtag && GA_MEASUREMENT_ID) {
    window.gtag('event', 'page_view', {
      page_path: pathname,
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
