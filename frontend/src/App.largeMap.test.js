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

  test('imported normal maps queue home centering after layout is available', () => {
    const pendingInitialCenterRef = { current: false };
    const pendingInitialLargeMapCenterRef = { current: true };
    const scheduleResetView = jest.fn();

    expect(__testing.queueNormalMapInitialCenter({
      pendingInitialCenterRef,
      pendingInitialLargeMapCenterRef,
      scheduleResetViewRef: { current: scheduleResetView },
      attempts: 20,
    })).toBe(true);

    expect(pendingInitialCenterRef.current).toBe(true);
    expect(pendingInitialLargeMapCenterRef.current).toBe(false);
    expect(scheduleResetView).toHaveBeenCalledWith(20);
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

  test('large-map document cache sync updates restored node details without dropping screenshots', () => {
    const cache = new Map([[
      'node-1',
      {
        id: 'node-1',
        title: 'Edited title',
        thumbnailUrl: '/screenshots/node-1_thumb_v1.jpg',
        fullScreenshotUrl: '/screenshots/node-1_full_v1.jpg',
        hasThumbnail: true,
      },
    ]]);
    const root = {
      id: 'root',
      title: 'Home',
      children: [{
        id: 'node-1',
        title: 'Original title',
        thumbnailUrl: '',
        children: [],
      }],
    };

    expect(__testing.mergeLargeMapDocumentNodesIntoCache(cache, root, [])).toBe(true);
    expect(cache.get('node-1')).toMatchObject({
      id: 'node-1',
      title: 'Original title',
      thumbnailUrl: '/screenshots/node-1_thumb_v1.jpg',
      fullScreenshotUrl: '/screenshots/node-1_full_v1.jpg',
      hasThumbnail: true,
    });
    expect(cache.get('node-1').children).toBeUndefined();
  });

  test('large-map edit modal nodes keep parent selection from scene metadata', () => {
    expect(__testing.buildLargeMapEditModalNode({
      id: 'child-1',
      title: 'Child',
      parentId: 'root',
    })).toMatchObject({
      id: 'child-1',
      parentId: 'root',
    });

    expect(__testing.buildLargeMapEditModalNode({
      id: 'orphan-1',
      title: 'Orphan',
      isOrphan: true,
      orphanType: 'orphan',
    })).toMatchObject({
      id: 'orphan-1',
      parentId: '__orphan_root__',
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

  test('saved-map layout refresh preserves the current viewport', () => {
    expect(__testing.getMapLayoutRefreshTransformOptions()).toEqual({ skipPanClamp: true });
  });

  test('saved-map stack toggles only update expanded stack state', () => {
    expect(__testing.getNextExpandedStackState({ stackA: true }, 'stackB')).toEqual({
      stackA: true,
      stackB: true,
    });
    expect(__testing.getNextExpandedStackState({ stackA: true }, 'stackA')).toEqual({
      stackA: false,
    });
  });

  test('initial large-map Home transform only runs while pending with a real canvas', () => {
    const homeNode = { x: 0, y: 0, w: 288, h: 200 };
    expect(__testing.getInitialLargeMapHomeTransform({
      pending: false,
      homeNode,
      canvasWidth: 1200,
      canvasHeight: 800,
      scale: 1,
    })).toBeNull();
    expect(__testing.getInitialLargeMapHomeTransform({
      pending: true,
      homeNode,
      canvasWidth: 0,
      canvasHeight: 800,
      scale: 1,
    })).toBeNull();
    expect(__testing.getInitialLargeMapHomeTransform({
      pending: true,
      homeNode,
      canvasWidth: 1200,
      canvasHeight: 800,
      scale: 1,
    })).toEqual({ scale: 1, x: 456, y: 300 });
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

    expect(__testing.getDisplayScanLayerAvailability(result.root, result.orphans)).toMatchObject({
      placementPrimary: true,
      placementSubdomain: false,
      placementOrphan: false,
    });
  });

  test('partial imports keep available pages and drop connections to omitted pages', () => {
    const imported = {
      root: {
        id: 'root',
        url: 'https://example.com/',
        title: 'Example',
        children: [
          { id: 'child-1', url: 'https://example.com/a', title: 'A', children: [] },
          { id: 'child-2', url: 'https://example.com/b', title: 'B', children: [] },
        ],
      },
      orphans: [
        { id: 'orphan-1', url: 'https://other.example/', title: 'Other', children: [] },
      ],
      connections: [
        { sourceNodeId: 'root', targetNodeId: 'child-1' },
        { sourceNodeId: 'child-2', targetNodeId: 'orphan-1' },
      ],
    };

    const partial = __testing.limitImportedMapToPageCount(imported, 2);

    expect(partial.partialImport).toBe(true);
    expect(partial.count).toBe(2);
    expect(partial.root.children.map((node) => node.id)).toEqual(['child-1']);
    expect(partial.orphans).toEqual([]);
    expect(partial.connections).toEqual([
      { sourceNodeId: 'root', targetNodeId: 'child-1' },
    ]);
  });

  test('map save payload strips entitlement ghost nodes', () => {
    const payload = __testing.buildMapSavePayload({
      root: {
        id: 'root',
        url: 'https://example.com/',
        title: 'Example',
        children: [
          { id: 'real-child', url: 'https://example.com/a', title: 'A', children: [] },
          { id: 'ghost-child', isEntitlementLocked: true, entitlementLocked: true, children: [] },
        ],
      },
      orphans: [
        { id: 'ghost-orphan', isEntitlementLocked: true, entitlementLocked: true, children: [] },
      ],
    });

    expect(payload.root.children.map((node) => node.id)).toEqual(['real-child']);
    expect(payload.orphans).toEqual([]);
  });

  test('map save payload preserves partial-scan metadata for reloads', () => {
    const entitlement = {
      capped: true,
      limitReached: true,
      visiblePageLimit: 1,
      lockedPageEstimate: 2,
    };
    const display = __testing.addScanLimitGhosts({
      id: 'root',
      url: 'https://example.com/',
      title: 'Example',
      children: [],
    }, [], entitlement);

    const payload = __testing.buildMapSavePayload({
      root: display.root,
      orphans: display.orphans,
      scanMeta: {
        brokenLinks: [],
        partial: true,
        partialReason: 'entitlement_cap',
        entitlement,
        discoveryManifest: {
          version: 1,
          seedUrl: 'https://example.com/',
          capturedPageCount: 1,
          totalDiscoveredPageCount: 3,
          hiddenPageCount: 2,
          storedHiddenPageCount: 2,
          truncated: false,
          maxStoredEntries: 1000,
          entries: [
            {
              url: 'https://example.com/a',
              parentUrl: 'https://example.com/',
              source: 'crawl',
              depth: 1,
              order: 1,
            },
            {
              url: 'https://example.com/b',
              parentUrl: 'https://example.com/',
              source: 'sitemap',
              depth: 1,
              order: 2,
            },
          ],
        },
      },
    });

    expect(payload.root.children).toHaveLength(0);
    expect(payload.root.vellicScanMeta.entitlement.lockedPageEstimate).toBe(2);
    expect(payload.root.vellicScanMeta.discoveryManifest.hiddenPageCount).toBe(2);
    expect(payload.root.vellicScanMeta.discoveryManifest.entries).toHaveLength(2);

    const hydrated = __testing.hydratePersistedScanLimitMap(payload.root, payload.orphans);
    expect(hydrated.scanMeta.partialReason).toBe('entitlement_cap');
    expect(hydrated.scanMeta.discoveryManifest.hiddenPageCount).toBe(2);
    expect(hydrated.root.children.some((node) => node.isEntitlementLocked)).toBe(true);
  });

  test('duplicating the home node defaults the copy under Home', () => {
    const root = { id: 'root', title: 'Home' };

    expect(__testing.getDuplicateNodeDefaultParentId({
      node: root,
      parent: null,
      rootNode: root,
    })).toBe('root');

    expect(__testing.getDuplicateNodeDefaultParentId({
      node: { id: 'top-level', title: 'Top level' },
      parent: null,
      rootNode: root,
    })).toBe('__orphan_root__');
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

  test('scan limit progress note uses non-blocking allowance copy', () => {
    expect(__testing.getScanLimitProgressNote({
      mode: 'guest',
      planName: 'Guest',
      allowedPages: 25,
      capped: true,
    })).toContain('Guest scans can include up to 25 pages');
    expect(__testing.getScanLimitProgressNote({
      mode: 'account',
      planName: 'Solo',
      requestedPages: 5000,
      allowedPages: 739,
      remaining: 739,
      capped: true,
      capReason: 'monthly_remaining',
    })).toContain('up to 739 pages from your current billing period');
    expect(__testing.getScanLimitProgressNote({
      mode: 'account',
      planName: 'Solo',
      requestedPages: 5000,
      allowedPages: 739,
      remaining: 739,
      capped: true,
      capReason: 'monthly_remaining',
    })).not.toContain('limit reached');
    expect(__testing.getScanLimitProgressNote({ capped: false })).toBe('');
  });

  test('scan limit prompt warns capped account users before scanning', () => {
    const prompt = {
      mode: 'account',
      planName: 'Free',
      allowedPages: 100,
      capped: true,
      capReason: 'per_scan_limit',
    };

    expect(__testing.getScanLimitPromptSubtitle(prompt)).toBe('');
    expect(__testing.getScanLimitPromptBody(prompt)).toContain('Free scans can include up to 100 pages');
    expect(__testing.getScanLimitPromptBody(prompt)).toContain('Continue to scan up to 100 pages');
    expect(__testing.getScanLimitPromptBody(prompt)).toContain('upgrade');
  });

  test('guest scan prompt asks for auth or upgrade before scanning', () => {
    expect(__testing.getGuestScanPromptSubtitle()).toContain('Continue as a guest');
    expect(__testing.getGuestScanPromptSubtitle()).toContain('sign in');
    expect(__testing.getGuestScanPromptBody()).toContain('select a plan');
    expect(__testing.getGuestScanPromptBody()).not.toContain('limit reached');
  });

  test('scan entitlement preview keeps backend caps as the source of truth', () => {
    expect(__testing.normalizeScanEntitlementPreview({
      mode: 'account',
      planName: 'Free',
      requestedPages: 5000,
      allowedPages: 100,
      remaining: 1000,
      capped: true,
      capReason: 'per_scan_limit',
    })).toMatchObject({
      mode: 'account',
      planName: 'Free',
      requestedPages: 5000,
      allowedPages: 100,
      remaining: 1000,
      capped: true,
      capReason: 'per_scan_limit',
    });

    expect(__testing.normalizeScanEntitlementPreview({
      mode: 'guest',
      requestedPages: 5000,
      allowedPages: 25,
      capped: true,
      capReason: 'guest_limit',
    })).toMatchObject({
      mode: 'guest',
      planName: 'Guest',
      requestedPages: 5000,
      allowedPages: 25,
      capped: true,
      capReason: 'guest_limit',
    });
  });

  test('scan entitlement session guard rejects logged-in downgrade to guest', () => {
    const accountPreview = {
      mode: 'account',
      requestedPages: 5000,
      allowedPages: 100,
      capped: true,
      capReason: 'per_scan_limit',
    };

    expect(__testing.hasScanEntitlementSessionMismatch({
      isLoggedIn: true,
      preview: accountPreview,
      jobEntitlement: {
        mode: 'guest',
        requestedPages: 5000,
        allowedPages: 25,
        capped: true,
        capReason: 'guest_limit',
      },
    })).toBe(true);

    expect(__testing.hasScanEntitlementSessionMismatch({
      isLoggedIn: true,
      preview: accountPreview,
      jobEntitlement: {
        mode: 'account',
        requestedPages: 5000,
        allowedPages: 100,
        capped: true,
        capReason: 'per_scan_limit',
      },
    })).toBe(false);

    expect(__testing.hasScanEntitlementSessionMismatch({
      isLoggedIn: false,
      preview: { mode: 'guest' },
      jobEntitlement: { mode: 'guest' },
    })).toBe(false);
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

describe('deferred page capture', () => {
  test('replaces only the selected group placeholder with captured pages', () => {
    const placeholder = {
      id: 'placeholder-blog',
      nodeKind: 'deferred-group',
      deferredGroupId: 'blog-group',
      capturedCount: 10,
      remainingCount: 2,
      deferredEntries: [
        { url: 'https://example.com/blog/post-11', scanNumber: '2.11', order: 10 },
        { url: 'https://example.com/blog/post-12', scanNumber: '2.12', order: 11 },
      ],
      children: [],
    };
    const existingRoot = {
      id: 'home',
      url: 'https://example.com/',
      children: [{
        id: 'blog',
        url: 'https://example.com/blog',
        children: [placeholder],
      }],
    };
    const captureResult = {
      root: {
        id: 'capture-root',
        url: 'https://example.com/',
        children: [{
          id: 'post-11',
          url: 'https://example.com/blog/post-11',
          title: 'Post 11',
          children: [],
        }],
      },
      captureSummary: {
        successfulEntries: [{ url: 'https://example.com/blog/post-11' }],
      },
    };

    const applied = __testing.applyDeferredCaptureResult({
      existingRoot,
      captureResult,
      placeholderNode: placeholder,
    });
    const blogChildren = applied.root.children[0].children;
    expect(applied.capturedCount).toBe(1);
    expect(applied.remainingCount).toBe(1);
    expect(blogChildren[0].url).toBe('https://example.com/blog/post-11');
    expect(blogChildren[0].scanNumber).toBe('2.11');
    expect(blogChildren[1].remainingCount).toBe(1);
    expect(blogChildren[1].deferredEntries[0].url).toBe('https://example.com/blog/post-12');
  });
});
