import fs from 'fs';
import path from 'path';

import { __testing } from './App';

const appCss = fs.readFileSync(path.join(__dirname, 'App.css'), 'utf8');
const generatedCss = fs.readFileSync(path.join(__dirname, 'design-system.generated.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');

describe('UI design-system contract', () => {
  test('home title, canvas elevation, connection stroke, and disabled state use shared tokens', () => {
    expect(generatedCss).toContain('--type-home-title-lg-size: 32px;');
    expect(generatedCss).toContain('--type-home-title-lg-line-height: 40px;');
    expect(generatedCss).toContain('--type-home-title-lg-weight: 600;');
    expect(generatedCss).toContain('--shadow-canvas-control: 0 4px 12px rgba(0, 0, 0, 0.1);');
    expect(generatedCss).toContain('--ui-connection-map-stroke-width: 1.5px;');
    expect(generatedCss).toContain('--ui-control-disabled-content: var(--color-neutral-500);');
    expect(generatedCss).toContain('--ui-control-disabled-content: var(--color-plum-300);');

    expect(appCss).toContain('font-size: var(--type-home-title-lg-size);');
    expect(appCss).toContain('box-shadow: var(--shadow-canvas-control);');
    expect(appCss).toContain('stroke-width: var(--ui-connection-map-stroke-width);');
    expect(appCss).toContain('color: var(--ui-control-disabled-content);');
  });

  test('top scan bar is limited to unsaved scans and supports clear/rescan states', () => {
    expect(appJs).toContain('showScanBar={isUnsavedScannedMap');
    expect(appJs).toContain("scanLabel={hasTopbarRescanChanges ? 'Rescan' : 'Scan'}");
    expect(appJs).toContain('showClearUrl={!!urlInput.trim()}');
    expect(appJs).toContain('scanConfigsHaveOptionChanges(currentScanConfig, lastCompletedScanConfig)');
  });
});

describe('scan config and differential rescan behavior', () => {
  const {
    normalizeScanConfig,
    scanConfigsHaveOptionChanges,
    mergeRescanResults,
  } = __testing;

  test('rescan changes ignore URL-only edits and respond to depth/options changes', () => {
    const previous = normalizeScanConfig({
      url: 'https://example.com',
      depth: 4,
      options: { includeExternal: false, includeImages: true },
    });

    expect(scanConfigsHaveOptionChanges(normalizeScanConfig({
      url: 'https://example.com/changed',
      depth: 4,
      options: { includeExternal: false, includeImages: true },
    }), previous)).toBe(false);

    expect(scanConfigsHaveOptionChanges(normalizeScanConfig({
      url: 'https://example.com',
      depth: 5,
      options: { includeExternal: false, includeImages: true },
    }), previous)).toBe(true);

    expect(scanConfigsHaveOptionChanges(normalizeScanConfig({
      url: 'https://example.com',
      depth: 4,
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
