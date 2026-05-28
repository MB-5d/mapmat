import fs from 'fs';
import path from 'path';

import { __testing } from './App';

const appCss = fs.readFileSync(path.join(__dirname, 'App.css'), 'utf8');
const generatedCss = fs.readFileSync(path.join(__dirname, 'design-system.generated.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
const minimapCss = fs.readFileSync(path.join(__dirname, 'components/minimap/minimapNavigator.css'), 'utf8');

describe('UI design-system contract', () => {
  test('home title, canvas elevation, connection stroke, and disabled state use shared tokens', () => {
    expect(generatedCss).toContain('--type-home-title-lg-size: 32px;');
    expect(generatedCss).toContain('--type-home-title-lg-line-height: 40px;');
    expect(generatedCss).toContain('--type-home-title-lg-weight: 600;');
    expect(generatedCss).toContain('--shadow-canvas-control: 0 4px 12px rgba(0, 0, 0, 0.1);');
    expect(generatedCss).toContain('--shadow-canvas-control: 0 4px 12px rgba(180, 180, 180, 0.12);');
    expect(generatedCss).toContain('--shadow-card: 0 1px 3px rgba(180, 180, 180, 0.12), 0 1px 2px rgba(160, 160, 160, 0.08);');
    expect(generatedCss).toContain('--ui-connection-map-stroke-width: 1.25px;');
    expect(generatedCss).toContain('--ui-control-disabled-content: var(--color-neutral-500);');
    expect(generatedCss).toContain('--ui-control-disabled-content: var(--color-plum-300);');

    expect(appCss).toContain('font-size: var(--type-home-title-lg-size);');
    expect(appCss).toContain('box-shadow: var(--shadow-canvas-control);');
    expect(appCss).toContain('box-shadow: var(--shadow-drawer);');
    expect(appCss).toContain('box-shadow: var(--ui-overlay-shadow);');
    expect(appCss).toContain('stroke-width: var(--ui-connection-map-stroke-width);');
    expect(appCss).toContain('color: var(--ui-control-disabled-content);');
  });

  test('brand filled button hover keeps contrast text and is not overridden by share modal styles', () => {
    expect(appCss).toMatch(
      /\.ui-btn--type-primary\.ui-btn--style-brand:hover:not\(:disabled\),\n\.ui-btn--primary:hover:not\(:disabled\) \{[\s\S]*background: var\(--ui-button-brand-fill-hover\);[\s\S]*border-color: var\(--ui-button-brand-fill-hover\);[\s\S]*color: var\(--ui-button-brand-contrast\);[\s\S]*\}/
    );
    expect(appCss).not.toContain('.share-email-btn:hover');
    expect(appCss).not.toMatch(/\.share-email-btn \{[^}]*color:/);
  });

  test('top scan bar is limited to unsaved scans and supports clear/update states', () => {
    expect(appJs).toContain('showScanBar={isUnsavedScannedMap');
    expect(appJs).toContain("scanLabel={hasTopbarRescanChanges ? 'Update' : 'Scan'}");
    expect(appJs).toContain('showClearUrl={!!urlInput.trim()}');
    expect(appJs).toContain('scanConfigsHaveOptionChanges(currentScanConfig, lastCompletedScanConfig)');
  });

  test('canvas grid and stacked cards use shared visual rules', () => {
    expect(appCss).toContain('.canvas.has-map::before');
    expect(appCss).toContain('background-position: var(--canvas-pan-x, 0px) var(--canvas-pan-y, 0px);');
    expect(appCss).toContain('var(--canvas-grid-dot-radius, 0.75px)');
    expect(appJs).toContain('const getCanvasGridMetrics = (scaleValue) => {');
    expect(appJs).toContain('size: Math.max(4, Math.round(16 * canvasGridScale)),');
    expect(appJs).toContain('dotRadius: canvasGridScale < 0.5 ? 0.25 : (canvasGridScale > 2 ? 1 : 0.75),');
    expect(appJs).toContain('const canvasGridMetrics = getCanvasGridMetrics(canvasRenderScale);');
    expect(appJs).toContain('const CANVAS_EDGE_PADDING_MAX = 400;');
    expect(appJs).toContain('const minPanX = viewportWidth - padding - scaledRight;');
    expect(appJs).toContain('const maxPanX = padding - scaledLeft;');
    expect(appCss).toContain('z-index: 0;');
    expect(appCss).toContain('border-radius: var(--ui-radius-lg);');
    expect(appCss).toContain('transform: translate(15px, 15px);');
    expect(appCss).toContain('transform: translate(10px, 10px);');
    expect(appCss).toContain('transform: translate(5px, 5px);');
  });

  test('canvas wheel zooms while press-drag remains the pan control', () => {
    const wheelStart = appJs.indexOf('// Smooth wheel handling for canvas zoom. Press-drag remains the pan control.');
    const wheelEnd = appJs.indexOf('const exportJson', wheelStart);
    const wheelHandler = appJs.slice(wheelStart, wheelEnd);

    expect(wheelStart).toBeGreaterThan(-1);
    expect(wheelHandler).toContain('zoomAtClientPoint(next, clientX, clientY);');
    expect(wheelHandler).toContain('.canvas-tool-menu');
    expect(wheelHandler).not.toContain('panBy(');
    expect(wheelHandler).not.toContain('e.ctrlKey || e.metaKey');
    expect(appJs).toContain('dragRef.current.dragging = true;');
    expect(appJs).toContain('applyTransform({ scale: scaleRef.current, x: newPan.x, y: newPan.y });');
  });

  test('canvas map title blocks accidental text selection while rename stays selectable', () => {
    expect(appCss).toMatch(/\.canvas-map-header \{[\s\S]*user-select: none;/);
    expect(appCss).toMatch(/\.canvas-map-name-button \{[\s\S]*user-select: none;/);
    expect(appCss).toMatch(/\.canvas-map-name-text \{[\s\S]*user-select: none;/);
    expect(appCss).toMatch(/\.canvas-map-name-input \{[\s\S]*user-select: text;/);
    expect(appCss).toMatch(/\.canvas\.panning,\n\.canvas\.panning \* \{[\s\S]*user-select: none !important;/);
    expect(appCss).toMatch(/\.canvas\.panning \.canvas-map-name-input \{[\s\S]*user-select: text !important;/);
  });
});

describe('scan config and differential rescan behavior', () => {
  const {
    normalizeScanConfig,
    scanConfigsHaveOptionChanges,
    mergeRescanResults,
  } = __testing;

  test('rescan changes ignore URL-only edits and respond to scan option changes', () => {
    const previous = normalizeScanConfig({
      url: 'https://example.com',
      options: { includeExternal: false, includeImages: true },
    });

    expect(scanConfigsHaveOptionChanges(normalizeScanConfig({
      url: 'https://example.com/changed',
      options: { includeExternal: false, includeImages: true },
    }), previous)).toBe(false);

    expect(scanConfigsHaveOptionChanges(normalizeScanConfig({
      url: 'https://example.com',
      depth: 5,
      options: { includeExternal: false, includeImages: true },
    }), previous)).toBe(false);

    expect(scanConfigsHaveOptionChanges(normalizeScanConfig({
      url: 'https://example.com',
      options: { includeExternal: true, includeImages: true },
    }), previous)).toBe(true);
  });

  test('differential rescan preserves edited nodes and manual connection endpoints', () => {
    const existingRoot = {
      id: 'home-old',
      title: 'Edited Home',
      url: 'https://example.com',
      annotations: { note: 'Keep this' },
      children: [
        {
          id: 'about-old',
          title: 'Edited About',
          url: 'https://example.com/about',
          comments: [{ id: 'comment-1', text: 'Keep comment' }],
          children: [],
        },
        {
          id: 'deep-old',
          title: 'Manually linked deep page',
          url: 'https://example.com/deep',
          children: [],
        },
      ],
    };

    const nextRoot = {
      id: 'home-new',
      title: 'Scanned Home',
      url: 'https://example.com',
      children: [
        {
          id: 'about-new',
          title: 'Scanned About',
          url: 'https://example.com/about',
          children: [],
        },
      ],
    };

    const merged = mergeRescanResults({
      existingRoot,
      existingOrphans: [],
      nextRoot,
      nextOrphans: [],
      manualConnections: [{ id: 'manual-1', sourceNodeId: 'deep-old', targetNodeId: 'about-old' }],
    });

    expect(merged.root.id).toBe('home-old');
    expect(merged.root.title).toBe('Edited Home');
    expect(merged.root.annotations.note).toBe('Keep this');
    expect(merged.root.children[0].id).toBe('about-old');
    expect(merged.root.children[0].comments).toHaveLength(1);
    expect(merged.orphans.some((node) => node.id === 'deep-old')).toBe(true);
  });
});

describe('map image asset persistence', () => {
  const {
    applyNodeAssetUpdatesToMap,
    buildMapSavePayload,
    serializeMapAutosaveSnapshot,
    isStoredScreenshotAsset,
    getImageCaptureStats,
  } = __testing;

  test('image capture stats only count real saved screenshot assets', () => {
    expect(isStoredScreenshotAsset('https://replit.com/pricing')).toBe(false);
    expect(isStoredScreenshotAsset('/screenshots/thumb-about.jpg')).toBe(true);
    expect(isStoredScreenshotAsset('https://api.vellic.io/screenshots/thumb-about.jpg')).toBe(true);
    expect(isStoredScreenshotAsset('https://pub-example.r2.dev/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_thumb_small_v8.jpg')).toBe(true);

    const root = {
      id: 'home',
      url: 'https://example.com',
      thumbnailUrl: 'https://example.com',
      children: [
        {
          id: 'about',
          url: 'https://example.com/about',
          thumbnailUrl: '/screenshots/thumb-about.jpg',
          children: [],
        },
        {
          id: 'contact',
          url: 'https://example.com/contact',
          thumbnailCaptureFailed: true,
          children: [],
        },
        {
          id: 'login',
          url: 'https://example.com/login',
          authRequired: true,
          children: [],
        },
      ],
    };

    const stats = getImageCaptureStats({
      rootNode: root,
      assetKey: 'thumbnailUrl',
      invalidAssetIds: new Set(['about']),
      isUnavailable: (node) => Boolean(node.authRequired),
    });

    expect(stats).toMatchObject({
      total: 4,
      captured: 0,
      unavailable: 1,
      remaining: 3,
      hasPartial: false,
      allCaptured: false,
    });
  });

  test('thumbnail asset updates are retained in saved map payloads', () => {
    const root = {
      id: 'home',
      url: 'https://example.com',
      internalLinks: ['https://example.com/about'],
      children: [
        {
          id: 'about',
          url: 'https://example.com/about',
          children: [],
        },
      ],
    };

    const updated = applyNodeAssetUpdatesToMap({
      root,
      orphans: [],
      nodeId: 'about',
      assetEntries: [
        ['thumbnailUrl', '/screenshots/thumb-about.jpg'],
        ['thumbnailFullUrl', '/screenshots/preview-about.jpg'],
      ],
    });

    const payload = buildMapSavePayload({
      root: updated.root,
      orphans: updated.orphans,
    });

    expect(payload.root.internalLinks).toBeUndefined();
    expect(payload.root.children[0].thumbnailUrl).toBe('/screenshots/thumb-about.jpg');
    expect(payload.root.children[0].thumbnailFullUrl).toBe('/screenshots/preview-about.jpg');
  });

  test('image menu opens before validating saved image assets', () => {
    const handlerStart = appJs.indexOf('onToggleImageMenu: () => {');
    const handlerEnd = appJs.indexOf('onGetThumbnailsAll', handlerStart);
    const handler = appJs.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain('setShowImageMenu(true);');
    expect(handler).toContain('validateCurrentMapImageAssets();');
    expect(handler.indexOf('setShowImageMenu(true);')).toBeLessThan(
      handler.indexOf('validateCurrentMapImageAssets();')
    );
    expect(handler).not.toContain('await validateCurrentMapImageAssets');
  });

  test('report see on map keeps the report drawer open while focusing the node', () => {
    const handlerStart = appJs.indexOf('const locateReportNodeOnMap = useCallback((nodeId) => {');
    const handlerEnd = appJs.indexOf('const locateReportUrlOnMap', handlerStart);
    const handler = appJs.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handler).toContain('setSelectedNodeIds(new Set([nodeId]));');
    expect(handler).toContain('focusNodeById(nodeId);');
    expect(handler).not.toContain('setShowReportDrawer(false);');
  });

  test('large maps keep area selection enabled', () => {
    expect(appJs).toContain('const rawNodes = Array.isArray(scene?.nodes) ? scene.nodes : [];');
    expect(appJs).toContain('largeMapVisibleNodesRef.current = rawNodes.map((node) => (');
    expect(appJs).toContain('largeMapVisibleNodesRef.current.forEach((node) => {');
    expect(appJs).toContain('getViewportSelectionRectStyle(selectionBox');
    expect(appJs).not.toContain('{!useLargeMapSurface && selectionBox && (');
  });

  test('large map viewfinder uses scene bounds', () => {
    expect(appJs).toContain('setLargeMapSceneBounds(scene?.bounds || null);');
    expect(appJs).toContain('bounds: useLargeMapSurface ? largeMapSceneBounds : worldBounds');
    expect(appJs).toContain('normalizeCanvasWorldBounds(useLargeMapSurface ? largeMapSceneBounds : worldBounds)');
    expect(minimapCss).toMatch(/\.minimap-navigator \{[\s\S]*z-index: 1500;/);
    expect(minimapCss).toMatch(/\.minimap-navigator-preview \{[\s\S]*border: 1px solid var\(--minimap-preview-border\);/);
    expect(__testing.normalizeCanvasWorldBounds({ w: 4000, h: 2000 })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 4000,
      maxY: 2000,
    });
  });

  test('page details modal spacing uses design-system spacing tokens', () => {
    expect(appCss).toMatch(/\.edit-node-form \{[\s\S]*gap: var\(--unit-20\);[\s\S]*padding-bottom: var\(--unit-24\);/);
    expect(appCss).toMatch(/\.edit-node-form-content \{[\s\S]*scroll-padding-block: var\(--unit-20\) var\(--unit-24\);/);
    expect(appCss).toMatch(/\.edit-node-form \.field \{[\s\S]*gap: var\(--unit-12\);/);
    expect(appCss).toMatch(/\.edit-node-modal__footer-actions \{[\s\S]*gap: var\(--unit-12\);/);
    expect(appCss).toMatch(/\.edit-node-duplicate-section \{[\s\S]*gap: var\(--unit-12\);[\s\S]*padding: var\(--unit-12\);/);
    expect(appCss).toMatch(/\.edit-node-duplicate-row \{[\s\S]*gap: var\(--unit-12\);/);
    expect(appCss).toMatch(/\.edit-node-seo-section \{[\s\S]*gap: var\(--unit-20\);/);
    expect(appCss).toMatch(/\.edit-node-form-grid \{[\s\S]*gap: var\(--unit-20\);/);
  });

  test('autosave snapshots only track canvas content changes', () => {
    const base = {
      name: 'Original map name',
      root: { id: 'home', title: 'Home', url: 'https://example.com', children: [] },
      orphans: [],
      connections: [],
      colors: { home: '#000000' },
      connectionColors: { primary: '#111111' },
      project_id: 'project-a',
    };

    expect(serializeMapAutosaveSnapshot(base)).toBe(serializeMapAutosaveSnapshot({
      ...base,
      name: 'Renamed map',
      project_id: 'project-b',
    }));

    expect(serializeMapAutosaveSnapshot(base)).not.toBe(serializeMapAutosaveSnapshot({
      ...base,
      root: { ...base.root, title: 'Updated Home' },
    }));
  });
});
