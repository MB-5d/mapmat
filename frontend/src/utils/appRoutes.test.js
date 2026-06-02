import {
  MAP_ORIENTATIONS,
  ROUTE_SURFACES,
  buildRouteUrl,
  createAdminHomeRoute,
  createAdminUserRoute,
  createMarketingPreviewV2Route,
  createMarketingRoute,
  createShareRoute,
  parseCurrentRoute,
} from './appRoutes';

describe('appRoutes admin surface', () => {
  it('parses /admin as the admin home surface', () => {
    const route = parseCurrentRoute({
      pathname: '/admin',
      search: '',
    });

    expect(route.surface).toBe(ROUTE_SURFACES.ADMIN);
    expect(route.section).toBe('home');
    expect(route.userId).toBeNull();
  });

  it('parses /admin/users/:id as the admin user detail surface', () => {
    const route = parseCurrentRoute({
      pathname: '/admin/users/user-123',
      search: '',
    });

    expect(route.surface).toBe(ROUTE_SURFACES.ADMIN);
    expect(route.section).toBe('user');
    expect(route.userId).toBe('user-123');
  });

  it('builds admin route URLs', () => {
    expect(buildRouteUrl(createAdminHomeRoute())).toBe('/admin');
    expect(buildRouteUrl(createAdminUserRoute('user-123'))).toBe('/admin/users/user-123');
  });

  it('preserves share map orientation in route URLs', () => {
    const route = createShareRoute('share-123', 'view', MAP_ORIENTATIONS.HORIZONTAL);

    expect(buildRouteUrl(route)).toBe('/share/share-123?access=view&orientation=horizontal');

    const parsed = parseCurrentRoute({
      pathname: '/share/share-123',
      search: '?access=view&orientation=horizontal',
    });

    expect(parsed.orientation).toBe(MAP_ORIENTATIONS.HORIZONTAL);
  });

  it('parses marketing preview routes as the marketing surface', () => {
    const route = parseCurrentRoute({
      pathname: '/marketing-preview/features',
      search: '',
    });

    expect(route.surface).toBe(ROUTE_SURFACES.MARKETING);
    expect(route.marketingPageId).toBe('features');
    expect(route.section).toBe('features');
  });

  it('parses child marketing preview node routes', () => {
    const route = parseCurrentRoute({
      pathname: '/marketing-preview/features/site-scanning',
      search: '',
    });

    expect(route.surface).toBe(ROUTE_SURFACES.MARKETING);
    expect(route.marketingPageId).toBe('features-scanning');
    expect(route.section).toBe('features-scanning');
  });

  it('builds marketing preview route URLs with search', () => {
    expect(buildRouteUrl(createMarketingRoute('overview'))).toBe('/marketing-preview');
    expect(buildRouteUrl(createMarketingRoute('start', '?url=https%3A%2F%2Fexample.com%2F'))).toBe(
      '/marketing-preview/start?url=https%3A%2F%2Fexample.com%2F'
    );
  });

  it('parses marketing preview v2 section routes as the marketing surface', () => {
    const route = parseCurrentRoute({
      pathname: '/marketing-preview-v2/features',
      search: '',
    });

    expect(route.surface).toBe(ROUTE_SURFACES.MARKETING);
    expect(route.marketingPreviewVersion).toBe('v2');
    expect(route.marketingPageId).toBe('features');
    expect(route.section).toBe('features');
  });

  it('builds marketing preview v2 route URLs with search', () => {
    expect(buildRouteUrl(createMarketingPreviewV2Route('home'))).toBe('/marketing-preview-v2');
    expect(buildRouteUrl(createMarketingPreviewV2Route('start', '?url=https%3A%2F%2Fexample.com%2F'))).toBe(
      '/marketing-preview-v2/start?url=https%3A%2F%2Fexample.com%2F'
    );
  });
});
