import { __testing } from './App';

describe('large map viewport behavior', () => {
  test('stack toggles preserve the current viewport during normal map layout refresh', () => {
    expect(__testing.getNextExpandedStackState({ parentA: true }, 'parentB')).toEqual({
      parentA: true,
      parentB: true,
    });
    expect(__testing.getNextExpandedStackState({ parentA: true }, 'parentA')).toEqual({
      parentA: false,
    });
    expect(__testing.getMapLayoutRefreshTransformOptions()).toEqual({ skipPanClamp: true });
  });

  test('large-map initial scene centers home when the home node arrives late', () => {
    expect(__testing.getInitialLargeMapHomeTransform({
      pending: true,
      homeNode: { x: 1000, y: 200, w: 300, h: 180 },
      canvasWidth: 1200,
      canvasHeight: 800,
      scale: 1,
    })).toEqual({ scale: 1, x: -550, y: 110 });

    expect(__testing.getInitialLargeMapHomeTransform({
      pending: false,
      homeNode: { x: 1000, y: 200, w: 300, h: 180 },
      canvasWidth: 1200,
      canvasHeight: 800,
      scale: 1,
    })).toBeNull();
  });

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

  test('large-map scene snapshots do not erase cached thumbnail assets', () => {
    const cached = {
      id: 'node-1',
      title: 'Cached node',
      thumbnailUrl: '/screenshots/node_thumb_v1.jpg',
      thumbnailFullUrl: '/screenshots/node_full_thumb_v1.jpg',
      fullScreenshotUrl: '/screenshots/node_full_v1.jpg',
      hasThumbnail: true,
    };
    const sceneNode = {
      id: 'node-1',
      title: 'Scene node',
      thumbnailUrl: '',
      hasThumbnail: true,
    };

    expect(__testing.mergeLargeMapNodeSnapshot(cached, sceneNode)).toMatchObject({
      id: 'node-1',
      title: 'Scene node',
      thumbnailUrl: '/screenshots/node_thumb_v1.jpg',
      thumbnailFullUrl: '/screenshots/node_full_thumb_v1.jpg',
      fullScreenshotUrl: '/screenshots/node_full_v1.jpg',
      hasThumbnail: true,
    });
  });

  test('large-map scene snapshots keep full image metadata when thumbnail URLs are omitted', () => {
    const sceneNode = {
      id: 'node-1',
      title: 'Scene node',
      thumbnailUrl: '',
      thumbnailFullUrl: '/screenshots/node_full_thumb_v2.jpg',
      fullScreenshotUrl: '/screenshots/node_full_v2.jpg',
      fullScreenshotTruncated: true,
      hasThumbnail: false,
    };

    expect(__testing.mergeLargeMapNodeSnapshot(null, sceneNode)).toMatchObject({
      id: 'node-1',
      title: 'Scene node',
      thumbnailUrl: '',
      thumbnailFullUrl: '/screenshots/node_full_thumb_v2.jpg',
      fullScreenshotUrl: '/screenshots/node_full_v2.jpg',
      fullScreenshotTruncated: true,
      hasThumbnail: false,
    });
  });

  test('large-map collapsed stack selection uses backend selection ids', () => {
    const node = {
      id: 'visible-stack-card',
      stackInfo: {
        collapsed: true,
        selectionIds: ['child-1', 'child-2', 'child-2'],
      },
    };

    expect(__testing.getLargeMapStackSelectionIdsFromNode(node)).toEqual(['child-1', 'child-2']);
    expect(__testing.getLargeMapStackSelectionIdsFromNode({ id: 'solo' })).toEqual(['solo']);
  });

  test('capped scans add locked root and subdomain preview nodes', () => {
    const root = {
      id: 'root',
      url: 'https://example.com/',
      title: 'Example',
      children: [
        { id: 'child-1', url: 'https://example.com/a', title: 'A', children: [] },
        { id: 'child-2', url: 'https://example.com/b', title: 'B', children: [] },
      ],
    };

    const result = __testing.addScanLimitGhosts(root, [], {
      capped: true,
      limitReached: true,
      requestedPages: 5000,
      allowedPages: 25,
      visiblePageLimit: 25,
      visiblePageCount: 3,
      lockedPageEstimate: 157,
    });

    const lockedRootChildren = result.root.children.filter((node) => node.isEntitlementLocked);
    const lockedSubdomains = result.orphans.filter((node) => node.isEntitlementLocked && node.subdomainRoot);

    expect(lockedRootChildren).toHaveLength(7);
    expect(lockedSubdomains).toHaveLength(7);
    expect(lockedRootChildren[0]).toMatchObject({
      title: 'Upgrade to see full map',
      parentUrl: 'https://example.com/',
      scanStatus: 'scan_limited',
    });
  });

  test('capped scans do not add locked previews when the site finishes under the limit', () => {
    const root = {
      id: 'root',
      url: 'https://small.example/',
      title: 'Small',
      children: [],
    };

    const result = __testing.addScanLimitGhosts(root, [], {
      capped: true,
      limitReached: false,
      requestedPages: 5000,
      allowedPages: 25,
      visiblePageLimit: 25,
      visiblePageCount: 1,
      lockedPageEstimate: 0,
    });

    expect(result.root.children).toHaveLength(0);
    expect(result.orphans).toHaveLength(0);
  });

  test('scan limit prompt uses paid account allowance copy', () => {
    expect(__testing.getScanLimitPromptSubtitle({
      mode: 'account',
      planName: 'Solo',
      requestedPages: 5000,
      allowedPages: 739,
      remaining: 739,
      capReason: 'monthly_remaining',
    })).toContain('739 pages');
    expect(__testing.getScanLimitPromptSubtitle({
      mode: 'account',
      planName: 'Solo',
      requestedPages: 5000,
      allowedPages: 739,
      remaining: 739,
      capReason: 'monthly_remaining',
    })).not.toContain('first 25 pages');
  });

  test('capped scans can be rerun after the current account has a higher allowance', () => {
    const scanMeta = {
      entitlement: {
        capped: true,
        limitReached: true,
        visiblePageLimit: 25,
        allowedPages: 25,
      },
    };
    const soloEntitlements = {
      meters: {
        crawlPages: {
          remaining: 1000,
        },
      },
      limits: {
        scanPagesPerRun: {
          limit: 1000,
        },
      },
    };

    expect(__testing.canRescanEntitlementLimitedMap({
      scanMeta,
      entitlements: soloEntitlements,
      isLoggedIn: true,
    })).toBe(true);
  });

  test('capped scans do not become rerunnable when the current allowance is unchanged', () => {
    const scanMeta = {
      entitlement: {
        capped: true,
        limitReached: true,
        visiblePageLimit: 25,
        allowedPages: 25,
      },
    };
    const freeEntitlements = {
      meters: {
        crawlPages: {
          remaining: 100,
        },
      },
      limits: {
        scanPagesPerRun: {
          limit: 25,
        },
      },
    };

    expect(__testing.canRescanEntitlementLimitedMap({
      scanMeta,
      entitlements: freeEntitlements,
      isLoggedIn: true,
    })).toBe(false);
  });

  test('created-node reveal keeps the canvas still when the node is already visible', () => {
    expect(__testing.getPanToRevealLayoutNode({
      nodeData: { x: 100, y: 100, w: 288, h: 200 },
      viewportWidth: 1000,
      viewportHeight: 700,
      scale: 1,
      pan: { x: 0, y: 0 },
    })).toBeNull();
  });

  test('created-node reveal nudges only enough to show an offscreen duplicate', () => {
    expect(__testing.getPanToRevealLayoutNode({
      nodeData: { x: 820, y: 560, w: 288, h: 200 },
      viewportWidth: 1000,
      viewportHeight: 700,
      scale: 1,
      pan: { x: 0, y: 0 },
    })).toEqual({ x: -132, y: -84 });
  });
});
