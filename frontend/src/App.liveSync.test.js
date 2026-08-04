import { __testing } from './App';

describe('App live share refresh and undo helpers', () => {
  test('builds a stable public share refresh key from map status fields', () => {
    expect(__testing.getShareRefreshVersionKey({
      mapId: 'map-1',
      mapUpdatedAt: '2026-06-30T20:00:00.000Z',
      shareCreatedAt: '2026-06-29T20:00:00.000Z',
    })).toBe('map-1:2026-06-30T20:00:00.000Z:2026-06-29T20:00:00.000Z');
  });

  test('builds live restore drafts for page detail undo', () => {
    const currentState = {
      root: {
        id: 'root',
        title: 'Home',
        url: 'https://example.com',
        children: [{ id: 'child', title: 'Edited', url: 'https://example.com/a', children: [] }],
      },
      orphans: [],
      connections: [],
      colors: ['#111111'],
      connectionColors: { crossLinks: '#222222' },
    };
    const targetState = {
      ...currentState,
      root: {
        ...currentState.root,
        children: [{ id: 'child', title: 'Original', url: 'https://example.com/a', children: [] }],
      },
    };

    expect(__testing.buildLiveRestoreDrafts({ currentState, targetState })).toEqual({
      ok: true,
      drafts: [{
        type: 'node.update',
        payload: {
          nodeId: 'child',
          changes: { title: 'Original' },
        },
      }],
    });
  });

  test('builds live restore drafts for metadata and link undo', () => {
    const currentState = {
      root: { id: 'root', title: 'Home', children: [] },
      orphans: [],
      connections: [{
        id: 'conn-1',
        type: 'crosslink',
        sourceNodeId: 'root',
        targetNodeId: 'root',
        label: 'Edited',
      }],
      colors: ['#111111'],
      connectionColors: { crossLinks: '#222222' },
    };
    const targetState = {
      ...currentState,
      connections: [],
      colors: ['#333333'],
    };

    const result = __testing.buildLiveRestoreDrafts({ currentState, targetState });
    expect(result.ok).toBe(true);
    expect(result.drafts).toEqual([
      {
        type: 'link.delete',
        payload: { linkId: 'conn-1' },
      },
      {
        type: 'metadata.update',
        payload: {
          changes: { colors: ['#333333'] },
        },
      },
    ]);
  });

  test('does not build live restore drafts for structural node changes', () => {
    const currentState = {
      root: { id: 'root', title: 'Home', children: [{ id: 'new', title: 'New', children: [] }] },
      orphans: [],
      connections: [],
    };
    const targetState = {
      root: { id: 'root', title: 'Home', children: [] },
      orphans: [],
      connections: [],
    };

    expect(__testing.buildLiveRestoreDrafts({ currentState, targetState })).toMatchObject({
      ok: false,
      drafts: [],
    });
  });

  test('revalidates map access after sign-in instead of keeping the signed-out preview', () => {
    const preview = {
      previewLoaded: true,
      previewMapId: 'map-1',
      routeMapId: 'map-1',
    };

    expect(__testing.canReuseRouteGatePreview({ ...preview, isLoggedIn: false })).toBe(true);
    expect(__testing.canReuseRouteGatePreview({ ...preview, isLoggedIn: true })).toBe(false);
    expect(__testing.canReuseRouteGatePreview({
      ...preview,
      isLoggedIn: true,
      errorStatus: 403,
    })).toBe(true);
  });

  test('keeps large saved maps on the scene renderer when live updates are enabled', () => {
    const ordinaryMap = {
      coeditingUiEnabled: true,
      isLoggedIn: true,
      mapId: 'map-1',
      hasRoot: true,
      isImportedMap: false,
      isViewingHistoricalVersion: false,
      isLargeMapShell: false,
    };

    expect(__testing.canActivateCoeditingForMap(ordinaryMap)).toBe(true);
    expect(__testing.canActivateCoeditingForMap({
      ...ordinaryMap,
      isLargeMapShell: true,
    })).toBe(false);
  });
});
