import {
  LARGE_MAP_NODE_THRESHOLD,
  countMapNodes,
  shouldUseLargeMapSurface,
} from './largeMapPerformance';

describe('largeMapPerformance', () => {
  test('counts root and orphan trees without double-counting ids', () => {
    const shared = { id: 'shared', children: [{ id: 'leaf' }] };
    const root = {
      id: 'root',
      children: [
        { id: 'a' },
        shared,
      ],
    };
    const orphans = [shared, { id: 'orphan' }];
    expect(countMapNodes(root, orphans)).toBe(5);
  });

  test('uses the large map surface only for saved non-live maps over the threshold', () => {
    expect(shouldUseLargeMapSurface({
      nodeCount: LARGE_MAP_NODE_THRESHOLD,
      hasSavedMap: true,
      isLiveActive: false,
    })).toBe(true);
    expect(shouldUseLargeMapSurface({
      nodeCount: LARGE_MAP_NODE_THRESHOLD - 1,
      hasSavedMap: true,
      isLiveActive: false,
    })).toBe(false);
    expect(shouldUseLargeMapSurface({
      nodeCount: LARGE_MAP_NODE_THRESHOLD,
      hasSavedMap: false,
      isLiveActive: false,
    })).toBe(false);
    expect(shouldUseLargeMapSurface({
      nodeCount: LARGE_MAP_NODE_THRESHOLD,
      hasSavedMap: true,
      isLiveActive: true,
    })).toBe(false);
  });
});
