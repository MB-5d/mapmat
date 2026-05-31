import {
  MAP_ORIENTATIONS,
  ROUTE_SURFACES,
  buildRouteUrl,
  createAdminHomeRoute,
  createAdminUserRoute,
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
});
