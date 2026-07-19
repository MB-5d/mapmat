import React, { useCallback, useEffect, useState } from 'react';

import App from './App';
import AdminConsole from './components/admin/AdminConsole';
import ConsentDrawer from './components/consent/ConsentDrawer';
import ConsentSettingsModal from './components/consent/ConsentSettingsModal';
import MarketingPreviewV2 from './marketing/MarketingPreviewV2';
import MarketingSite from './marketing/MarketingSite';
import { initAnalytics, trackPageView } from './utils/analytics';
import { useConsent } from './contexts/ConsentContext';
import { LocaleProvider, useLocale } from './contexts/LocaleContext';
import {
  ROUTE_SURFACES,
  buildRouteUrl,
  createMarketingPreviewV2Route,
  parseCurrentRoute,
} from './utils/appRoutes';
import { getAppDeviceSupport } from './utils/deviceSupport';

function DeviceSupportBlocker({ message }) {
  const { t } = useLocale();
  return (
    <main className="device-support-blocker" aria-labelledby="device-support-blocker-title">
      <section className="device-support-blocker__panel">
        <div className="device-support-blocker__eyebrow">{t('Screen size not supported')}</div>
        <h1 id="device-support-blocker-title">{t('Use desktop or tablet landscape')}</h1>
        <p>{t(message)}</p>
      </section>
    </main>
  );
}

function isBrowserReload() {
  const navigationEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
  return navigationEntry?.type === 'reload' || window.performance?.navigation?.type === 1;
}

function getInitialRoute() {
  const route = parseCurrentRoute(window.location);
  if (route.marketingPreviewVersion !== 'v2' || !isBrowserReload()) return route;
  const homeRoute = createMarketingPreviewV2Route('home');
  window.history.replaceState({}, '', buildRouteUrl(homeRoute));
  window.scrollTo?.(0, 0);
  return homeRoute;
}

function RootApp() {
  const [route, setRoute] = useState(getInitialRoute);
  const [deviceSupport, setDeviceSupport] = useState(() => getAppDeviceSupport());
  const { consent, hasStoredConsent } = useConsent();

  const navigateToRoute = useCallback((nextRoute, { replace = false } = {}) => {
    const resolvedRoute = typeof nextRoute === 'function' ? nextRoute(parseCurrentRoute(window.location)) : nextRoute;
    const nextUrl = buildRouteUrl(resolvedRoute);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
    }
    setRoute(parseCurrentRoute(window.location));
  }, []);

  useEffect(() => {
    const handlePopState = () => setRoute(parseCurrentRoute(window.location));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const updateDeviceSupport = () => setDeviceSupport(getAppDeviceSupport());
    window.addEventListener('resize', updateDeviceSupport);
    window.addEventListener('orientationchange', updateDeviceSupport);
    window.visualViewport?.addEventListener?.('resize', updateDeviceSupport);
    return () => {
      window.removeEventListener('resize', updateDeviceSupport);
      window.removeEventListener('orientationchange', updateDeviceSupport);
      window.visualViewport?.removeEventListener?.('resize', updateDeviceSupport);
    };
  }, []);

  useEffect(() => {
    if (!route.legacyShareQuery) return;
    navigateToRoute(
      {
        surface: ROUTE_SURFACES.SHARE,
        shareId: route.shareId,
        accessLevel: route.accessLevel,
        orientation: route.orientation,
      },
      { replace: true }
    );
  }, [navigateToRoute, route.accessLevel, route.legacyShareQuery, route.orientation, route.shareId]);

  useEffect(() => {
    if (route.marketingPreviewVersion !== 'v2' || !route.marketingLegacyAlias) return;
    navigateToRoute(
      createMarketingPreviewV2Route(route.marketingPageId || route.section || 'home', route.search || ''),
      { replace: true }
    );
  }, [
    navigateToRoute,
    route.marketingLegacyAlias,
    route.marketingPageId,
    route.marketingPreviewVersion,
    route.search,
    route.section,
  ]);

  useEffect(() => {
    initAnalytics(hasStoredConsent ? consent : null);
  }, [consent, hasStoredConsent]);

  useEffect(() => {
    if (!hasStoredConsent) return;
    trackPageView(buildRouteUrl(route), {
      surface: route.surface,
      section: route.section || '',
    });
  }, [consent.analytics, hasStoredConsent, route]);

  const consentUi = (
    <>
      <ConsentDrawer />
      <ConsentSettingsModal />
    </>
  );

  if (route.surface === ROUTE_SURFACES.WEBSITE) {
    const marketingHomeRoute = createMarketingPreviewV2Route('home');
    return (
      <>
        <MarketingPreviewV2 route={marketingHomeRoute} navigateToRoute={navigateToRoute} />
        {consentUi}
      </>
    );
  }

  if (route.surface === ROUTE_SURFACES.MARKETING) {
    if (route.marketingPreviewVersion === 'v2') {
      return (
        <>
          <MarketingPreviewV2 route={route} navigateToRoute={navigateToRoute} />
          {consentUi}
        </>
      );
    }
    return (
      <>
        <MarketingSite route={route} navigateToRoute={navigateToRoute} />
        {consentUi}
      </>
    );
  }

  if (route.surface === ROUTE_SURFACES.ADMIN) {
    if (!deviceSupport.supported) {
      return (
        <LocaleProvider>
          <DeviceSupportBlocker message={deviceSupport.message} />
          {consentUi}
        </LocaleProvider>
      );
    }

    return (
      <>
        <AdminConsole route={route} navigateToRoute={navigateToRoute} />
        {consentUi}
      </>
    );
  }

  if (route.surface === ROUTE_SURFACES.APP && !deviceSupport.supported) {
    return (
      <LocaleProvider>
        <DeviceSupportBlocker message={deviceSupport.message} />
        {consentUi}
      </LocaleProvider>
    );
  }

  return (
    <LocaleProvider>
      <App currentRoute={route} navigateToRoute={navigateToRoute} />
      {consentUi}
    </LocaleProvider>
  );
}

export default RootApp;
