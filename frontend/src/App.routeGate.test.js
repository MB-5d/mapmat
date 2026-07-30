import { __testing } from './App';

describe('map access preview gate', () => {
  test('reuses the real preview for logged-in users without map access', () => {
    expect(__testing.canReuseRouteGatePreview({
      previewLoaded: true,
      previewMapId: 'map-1',
      routeMapId: 'map-1',
    })).toBe(true);

    expect(__testing.canReuseRouteGatePreview({
      previewLoaded: true,
      previewMapId: 'map-1',
      routeMapId: 'map-2',
    })).toBe(false);
  });
});
