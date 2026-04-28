import React, { useCallback, useEffect, useState } from 'react';

import App from './App';
import AdminConsole from './components/admin/AdminConsole';
import ConsentDrawer from './components/consent/ConsentDrawer';
import ConsentSettingsModal from './components/consent/ConsentSettingsModal';
import LandingPage from './LandingPage';
import { initAnalytics, trackPageView } from './utils/analytics';
import { useConsent } from './contexts/ConsentContext';
import {
  ROUTE_SURFACES,
  buildRouteUrl,
  createAppHomeRoute,
  parseCurrentRoute,
} from './utils/appRoutes';
import { APP_ONLY_MODE } from './utils/constants';

function RootApp() {
  const [route, setRoute] = useState(() => parseCurrentRoute(window.location));
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
    if (!route.legacyShareQuery) return;
    navigateToRoute(
      {
        surface: ROUTE_SURFACES.SHARE,
        shareId: route.shareId,
        accessLevel: route.accessLevel,
      },
      { replace: true }
    );
  }, [navigateToRoute, route.accessLevel, route.legacyShareQuery, route.shareId]);

  useEffect(() => {
    if (!APP_ONLY_MODE || route.surface !== ROUTE_SURFACES.WEBSITE) return;
    navigateToRoute(createAppHomeRoute(), { replace: true });
  }, [navigateToRoute, route.surface]);

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
      <ConsentDrawer show={route.surface !== ROUTE_SURFACES.WEBSITE} />
      <ConsentSettingsModal />
    </>
  );

  if (route.surface === ROUTE_SURFACES.WEBSITE) {
    if (APP_ONLY_MODE) return null;
    return (
      <>
        <LandingPage onLaunchApp={() => navigateToRoute(createAppHomeRoute())} />
        {consentUi}
      </>
    );
  }

  if (route.surface === ROUTE_SURFACES.ADMIN) {
    return (
      <>
        <AdminConsole route={route} navigateToRoute={navigateToRoute} />
        {consentUi}
      </>
    );
  }

  return (
    <>
      <App currentRoute={route} navigateToRoute={navigateToRoute} />
      {consentUi}
    </>
  );
}

export default RootApp;
