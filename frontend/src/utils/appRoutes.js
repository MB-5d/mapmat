export const ROUTE_SURFACES = Object.freeze({
  WEBSITE: 'website',
  APP: 'app',
  SHARE: 'share',
});

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function normalizePathname(pathname) {
  const normalized = `/${trimSlashes(pathname)}`;
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCurrentRoute(locationLike = window.location) {
  const pathname = normalizePathname(locationLike.pathname || '/');
  const search = String(locationLike.search || '');
  const searchParams = new URLSearchParams(search);
  const legacyShareId = searchParams.get('share');
  const legacyAccess = searchParams.get('access');

  if (legacyShareId) {
    return {
      surface: ROUTE_SURFACES.SHARE,
      pathname,
      search,
      searchParams,
      shareId: legacyShareId,
      accessLevel: legacyAccess || null,
      legacyShareQuery: true,
    };
  }

  const shareMatch = pathname.match(/^\/share\/([^/]+)$/);
  if (shareMatch) {
    return {
      surface: ROUTE_SURFACES.SHARE,
      pathname,
      search,
      searchParams,
      shareId: decodeSegment(shareMatch[1]),
      accessLevel: searchParams.get('access') || null,
      legacyShareQuery: false,
    };
  }

  if (pathname === '/app' || pathname === '/app/') {
    return {
      surface: ROUTE_SURFACES.APP,
      pathname,
      search,
      searchParams,
      section: 'home',
      mapId: null,
    };
  }

  if (pathname === '/app/invites') {
    return {
      surface: ROUTE_SURFACES.APP,
      pathname,
      search,
      searchParams,
      section: 'invites',
      mapId: null,
    };
  }

  const mapMatch = pathname.match(/^\/app\/maps\/([^/]+)$/);
  if (mapMatch) {
    return {
      surface: ROUTE_SURFACES.APP,
      pathname,
      search,
      searchParams,
      section: 'map',
      mapId: decodeSegment(mapMatch[1]),
    };
  }

  return {
    surface: ROUTE_SURFACES.WEBSITE,
    pathname,
    search,
    searchParams,
  };
}

export function buildRouteUrl(route) {
  const searchParams = new URLSearchParams();

  if (!route || route.surface === ROUTE_SURFACES.WEBSITE) {
    return '/';
  }

  if (route.surface === ROUTE_SURFACES.SHARE) {
    const shareId = String(route.shareId || '').trim();
    const basePath = shareId ? `/share/${encodeURIComponent(shareId)}` : '/';
    if (route.accessLevel) {
      searchParams.set('access', route.accessLevel);
    }
    const search = searchParams.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  if (route.surface === ROUTE_SURFACES.APP) {
    if (route.section === 'invites') return '/app/invites';
    if (route.section === 'map' && route.mapId) {
      return `/app/maps/${encodeURIComponent(route.mapId)}`;
    }
    return '/app';
  }

  return '/';
}

export function createAppHomeRoute() {
  return { surface: ROUTE_SURFACES.APP, section: 'home', mapId: null };
}

export function createMapRoute(mapId) {
  return { surface: ROUTE_SURFACES.APP, section: 'map', mapId };
}

export function createInviteInboxRoute() {
  return { surface: ROUTE_SURFACES.APP, section: 'invites', mapId: null };
}

export function createShareRoute(shareId, accessLevel = null) {
  return { surface: ROUTE_SURFACES.SHARE, shareId, accessLevel };
}

