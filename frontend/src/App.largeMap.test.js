import { __testing } from './App';

describe('large map viewport behavior', () => {
  test('auto-center key ignores image metadata and thumbnail visibility', () => {
    const baseKey = __testing.getLargeMapAutoCenterKey({
      mapId: 'map-1',
      orientation: 'vertical',
      mapUpdatedAt: '2026-05-22T01:00:00.000Z',
      showThumbnails: false,
    });

    expect(__testing.getLargeMapAutoCenterKey({
      mapId: 'map-1',
      orientation: 'vertical',
      mapUpdatedAt: '2026-05-22T01:05:00.000Z',
      showThumbnails: true,
    })).toBe(baseKey);

    expect(__testing.getLargeMapAutoCenterKey({
      mapId: 'map-1',
      orientation: 'horizontal',
      mapUpdatedAt: '2026-05-22T01:05:00.000Z',
      showThumbnails: true,
    })).not.toBe(baseKey);
  });
});
