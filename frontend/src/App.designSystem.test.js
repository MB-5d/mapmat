import fs from 'fs';
import path from 'path';

import { __testing } from './App';

const appCss = fs.readFileSync(path.join(__dirname, 'App.css'), 'utf8');
const generatedCss = fs.readFileSync(path.join(__dirname, 'design-system.generated.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');
const landingCss = fs.readFileSync(path.join(__dirname, 'LandingPage.css'), 'utf8');
const minimapCss = fs.readFileSync(path.join(__dirname, 'components/minimap/minimapNavigator.css'), 'utf8');
const adminCss = fs.readFileSync(path.join(__dirname, 'components/admin/AdminConsole.css'), 'utf8');
const marketingPreviewCss = fs.readFileSync(path.join(__dirname, 'marketing/MarketingPreviewV2.css'), 'utf8');

const listFiles = (dir, extensions, results = []) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(filePath, extensions, results);
      return;
    }
    if (extensions.some((extension) => filePath.endsWith(extension))) {
      results.push(filePath);
    }
  });
  return results;
};

const extractSharedButtonClassNames = () => {
  const sourceFiles = listFiles(__dirname, ['.js', '.jsx', '.ts', '.tsx']);
  const classNames = new Set();

  sourceFiles.forEach((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    Array.from(source.matchAll(/<(Button|IconButton)\b[\s\S]*?>/g)).forEach(([tag]) => {
      const classNameMatch = tag.match(/className\s*=\s*("[^"]+"|'[^']+'|\{[\s\S]*?\})/);
      if (!classNameMatch) return;

      Array.from(classNameMatch[1].matchAll(/['"`]([^'"`{}]+)['"`]/g)).forEach(([, value]) => {
        value
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(token))
          .forEach((token) => classNames.add(token));
      });
    });
  });

  return classNames;
};

const findDisabledOverridesForSharedButtonClasses = () => {
  const sharedButtonClassNames = extractSharedButtonClassNames();
  const cssFiles = listFiles(__dirname, ['.css']);
  const overrides = [];

  cssFiles.forEach((filePath) => {
    const css = fs.readFileSync(filePath, 'utf8');
    Array.from(css.matchAll(/([^{}]+)\{[^{}]*\}/g)).forEach(([, selectorGroup]) => {
      selectorGroup.split(',').forEach((rawSelector) => {
        const selector = rawSelector.trim().replace(/\s+/g, ' ');
        if (!selector.includes(':disabled') || selector.includes(':not(:disabled)')) return;

        const selectorClassNames = Array.from(selector.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((match) => match[1]);
        const matchedClassNames = selectorClassNames.filter((className) => sharedButtonClassNames.has(className));
        if (matchedClassNames.length > 0) {
          overrides.push(`${path.relative(__dirname, filePath)}: ${selector}`);
        }
      });
    });
  });

  return overrides;
};

describe('UI design-system contract', () => {
  test('home title, canvas elevation, connection stroke, and disabled state use shared tokens', () => {
    expect(generatedCss).toContain('--type-home-title-lg-size: 32px;');
    expect(generatedCss).toContain('--type-home-title-lg-line-height: 40px;');
    expect(generatedCss).toContain('--type-home-title-lg-weight: 500;');
    expect(generatedCss).toContain('--shadow-canvas-control: 0 4px 12px rgba(0, 0, 0, 0.1);');
    expect(generatedCss).toContain('--shadow-canvas-control: 0 4px 12px rgba(180, 180, 180, 0.12);');
    expect(generatedCss).toContain('--shadow-card: 0 1px 3px rgba(180, 180, 180, 0.12), 0 1px 2px rgba(160, 160, 160, 0.08);');
    expect(generatedCss).toContain('--ui-connection-map-stroke-width: 1.25px;');
    expect(generatedCss).toContain('--ui-control-disabled-content: var(--color-neutral-500);');
    expect(generatedCss).toContain('--ui-control-disabled-content: var(--color-plum-300);');
    expect(generatedCss).toContain('--ui-button-brand-fill-disabled: var(--color-brand-300);');
    expect(generatedCss).toContain('--ui-button-brand-fill-disabled-contrast: var(--color-neutral-white);');
    expect(generatedCss).toContain('--ui-button-brand-fill-disabled-contrast: var(--color-brand-950);');
    expect(generatedCss).toContain('--ui-button-brand-quiet-disabled: var(--color-brand-300);');

    expect(appCss).toContain('font-size: var(--type-size-4xl);');
    expect(appCss).toContain('line-height: var(--type-line-height-48);');
    expect(appCss).toContain('font-weight: var(--type-weight-bold);');
    expect(appCss).toContain('box-shadow: var(--shadow-canvas-control);');
    expect(appCss).toContain('box-shadow: var(--shadow-drawer);');
    expect(appCss).toContain('box-shadow: var(--ui-overlay-shadow);');
    expect(appJs).toContain('strokeWidth="var(--ui-connection-map-stroke-width)"');
    expect(appCss).toContain('color: var(--ui-control-disabled-content);');
    expect(appCss).toMatch(
      /\.ui-btn--type-primary\.ui-btn--style-brand:disabled,\n\.ui-btn--primary:disabled \{[\s\S]*background: var\(--ui-button-brand-fill-disabled\);[\s\S]*border-color: var\(--ui-button-brand-fill-disabled\);[\s\S]*color: var\(--ui-button-brand-fill-disabled-contrast\);[\s\S]*\}/
    );
    expect(appCss).toMatch(
      /\.ui-icon-btn--type-primary\.ui-icon-btn--style-brand:disabled,\n\.ui-icon-btn--primary:disabled \{[\s\S]*background: var\(--ui-button-brand-fill-disabled\);[\s\S]*border-color: var\(--ui-button-brand-fill-disabled\);[\s\S]*color: var\(--ui-button-brand-fill-disabled-contrast\);[\s\S]*\}/
    );
    expect(appCss).not.toContain('.blank-scan-shell .ui-btn--type-primary.ui-btn--style-brand:disabled');
    expect(appCss).not.toContain('.scan-btn:disabled');
    expect(appCss).not.toContain('[data-theme="dark"] .scan-btn:disabled');
  });

  test('shared Button and IconButton disabled states are not overridden by local classes', () => {
    expect(findDisabledOverridesForSharedButtonClasses()).toEqual([]);
  });

  test('danger confirm modal uses mono companion action', () => {
    expect(appJs).toContain("buttonStyle={confirmModal.danger ? 'mono' : undefined}");
    expect(appJs).toContain("variant={confirmModal.danger ? 'danger' : 'primary'}");
  });

  test('toolbar panels use compact mono menu states without changing toolbar icon states', () => {
    expect(appCss).toMatch(/\.canvas-tool-menu\.canvas-tool-menu-panel \{[\s\S]*min-width: 200px;[\s\S]*\}/);
    expect(appCss).toMatch(/\.layers-panel\.layers-panel-embedded \{[\s\S]*min-width: 176px;[\s\S]*\}/);
    expect(appCss).toMatch(/\.color-key\.color-key-embedded \{[\s\S]*min-width: 176px;[\s\S]*\}/);
    expect(appCss).toMatch(
      /\.canvas-tool-menu-panel \.ui-menu-item--selected \{[\s\S]*background: var\(--ui-color-icon-hover\);[\s\S]*color: var\(--ui-color-text\);[\s\S]*\}/
    );
    expect(appCss).toMatch(
      /\.color-key-item\.editing \{[\s\S]*background: var\(--ui-color-icon-hover\);[\s\S]*color: var\(--ui-color-text\);[\s\S]*\}/
    );
    expect(appCss).toMatch(
      /\.color-swatch\.editing \{[\s\S]*box-shadow: 0 0 0 2px var\(--ui-color-border-strong\);[\s\S]*\}/
    );
    expect(appCss).toMatch(/\.color-edit-icon \{[\s\S]*color: inherit;[\s\S]*\}/);
    expect(appCss).not.toContain('[data-theme="dark"] .color-edit-icon');
    expect(appCss).toMatch(/\.canvas-tool-btn\.active \{[\s\S]*background: var\(--ui-color-primary\);[\s\S]*\}/);
  });

  test('brand filled button hover keeps contrast text and is not overridden by share modal styles', () => {
    expect(appCss).toMatch(
      /\.ui-btn--type-primary\.ui-btn--style-brand:hover:not\(:disabled\),\n\.ui-btn--primary:hover:not\(:disabled\) \{[\s\S]*background: var\(--ui-button-brand-fill-hover\);[\s\S]*border-color: var\(--ui-button-brand-fill-hover\);[\s\S]*color: var\(--ui-button-brand-contrast\);[\s\S]*\}/
    );
    expect(appCss).not.toContain('.share-email-btn:hover');
    expect(appCss).not.toMatch(/\.share-email-btn \{[^}]*color:/);
  });

  test('accordion uses one shared visual contract', () => {
    expect(appCss).toMatch(
      /\.ui-accordion \{[\s\S]*flex: 0 0 auto;[\s\S]*border: var\(--border-width-subtle\) solid var\(--ui-color-border\);[\s\S]*background: transparent;[\s\S]*overflow: visible;[\s\S]*\}/
    );
    expect(appCss).toMatch(
      /\.ui-accordion:hover \{[\s\S]*border-color: var\(--ui-color-border-strong\);[\s\S]*\}/
    );
    expect(appCss).toMatch(/\.ui-accordion:hover \{\n  border-color: var\(--ui-color-border-strong\);\n\}/);
    expect(appCss).toMatch(/\.ui-accordion\.is-open \{[\s\S]*box-shadow: var\(--shadow-card\);[\s\S]*\}/);
    expect(appCss).toMatch(/\.ui-accordion__trigger:focus-visible \{[\s\S]*box-shadow: inset var\(--ui-focus-ring\);[\s\S]*\}/);
    expect(appCss).toMatch(/\.ui-accordion__content \{[\s\S]*gap: var\(--unit-16\);[\s\S]*padding: var\(--unit-12\);[\s\S]*\}/);
    expect(appCss).toMatch(/\.profile-form \{[\s\S]*flex: 0 0 auto;[\s\S]*min-height: 100%;[\s\S]*\}/);
    expect(appCss).toMatch(/\.profile-password-details \{[\s\S]*gap: var\(--unit-16\);[\s\S]*\}/);
    expect(appCss).not.toContain('.account-plan-details {');
    expect(appCss).not.toContain('.account-plan-summary');
    expect(appCss).not.toContain('.profile-password-summary');
    expect(marketingPreviewCss).not.toContain('.marketing-v2-faq-item__button');
    expect(landingCss).not.toContain('.faq-question');
  });

  test('input labels use the compact label token and shared control spacing', () => {
    expect(generatedCss).toContain('--type-label-sm-size: 12px;');
    expect(generatedCss).toContain('--type-label-sm-line-height: 16px;');
    expect(generatedCss).toContain('--type-label-sm-weight: 500;');
    expect(appCss).toMatch(/\.field \{[\s\S]*gap: var\(--space-xs\);/);
    expect(appCss).toMatch(/\.field-label \{[\s\S]*font-size: var\(--type-label-sm-size\);[\s\S]*line-height: var\(--type-label-sm-line-height\);[\s\S]*font-weight: var\(--type-label-sm-weight\);/);
    expect(appCss).toMatch(/\.scan-options-depth-field \{[\s\S]*gap: var\(--space-xs\);/);
    expect(appCss).toMatch(/\.scan-options-depth-label \{[\s\S]*font-size: var\(--type-label-sm-size\);[\s\S]*line-height: var\(--type-label-sm-line-height\);[\s\S]*font-weight: var\(--type-label-sm-weight\);/);
    expect(appCss).toMatch(/\.share-collab-setting \{[\s\S]*gap: var\(--space-xs\);/);
    expect(appCss).toMatch(/\.share-collab-setting-label \{[\s\S]*font-size: var\(--type-label-sm-size\);[\s\S]*line-height: var\(--type-label-sm-line-height\);[\s\S]*font-weight: var\(--type-label-sm-weight\);/);
    expect(appCss).toMatch(/\.feedback-field-group \{[\s\S]*gap: var\(--space-sm\);/);
    expect(adminCss).toMatch(/\.admin-console-auth-form span \{[\s\S]*margin-bottom: var\(--space-xs\);[\s\S]*font-size: var\(--type-label-sm-size\);[\s\S]*line-height: var\(--type-label-sm-line-height\);[\s\S]*font-weight: var\(--type-label-sm-weight\);/);
    expect(adminCss).toMatch(/\.admin-feedback-item-controls label,[\s\S]*gap: var\(--space-xs\);/);
    expect(adminCss).toMatch(/\.admin-feedback-item-controls span,[\s\S]*font-size: var\(--type-label-sm-size\);[\s\S]*line-height: var\(--type-label-sm-line-height\);[\s\S]*font-weight: var\(--type-label-sm-weight\);/);
    expect(adminCss).toMatch(/\.admin-storage-form label \{[\s\S]*gap: var\(--space-xs\);[\s\S]*font-size: var\(--type-label-sm-size\);[\s\S]*line-height: var\(--type-label-sm-line-height\);[\s\S]*font-weight: var\(--type-label-sm-weight\);/);
    expect(adminCss).toMatch(/\.admin-usage-filters label \{[\s\S]*gap: var\(--space-xs\);/);
    expect(adminCss).toMatch(/\.admin-usage-filters label span \{[\s\S]*font-size: var\(--type-label-sm-size\);[\s\S]*line-height: var\(--type-label-sm-line-height\);[\s\S]*font-weight: var\(--type-label-sm-weight\);/);
  });

  test('top scan bar is limited to unsaved scans and supports clear/update states', () => {
    expect(appJs).toContain('showScanBar={isUnsavedScannedMap');
    expect(appJs).toContain("scanLabel={canTopbarRescan ? 'Update' : 'Scan'}");
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

  test('connector layers and arrowheads use one shared geometry contract', () => {
    expect(appCss).toMatch(/\.connector-overlay \{[\s\S]*z-index: 0;/);
    expect(appCss).toMatch(/\.connector-overlay--map \{[\s\S]*z-index: 0;/);
    expect(appCss).toMatch(/\.connections-layer \{[\s\S]*z-index: 1;/);
    expect(appCss).toMatch(/\.connections-layer--relationship \{[\s\S]*z-index: 1;/);
    expect(appJs).toContain('className="connector-overlay connector-overlay--map"');
    expect(appJs).toContain('className="connections-layer connections-layer--relationship"');
    expect(appJs).toContain('getRenderedConnectionAnchors');
    expect(appJs).toContain('layoutConnectorEndpointReservations');
    expect(appJs).toContain('getLayoutConnectorEndpointAnchorReservation');
    expect(appJs).toContain('getLayoutConnectorEndpointsAtAnchor');
    expect(appJs).toContain("kind: 'layout'");
    expect(appJs).toContain('getConnectionEndpointsAtAnchor');
    expect(appJs).toContain("matches.push({ connectionId: conn.id, endpoint: 'source' });");
    expect(appJs).toContain("matches.push({ connectionId: conn.id, endpoint: 'target' });");
    expect(appJs).toContain('const reservedOffsets = layoutEndpointReservations.map');
    expect(appJs).toContain('availableOffsets[index]');
    expect(appJs).toContain('visibleManualCrosslinkConnections');
    expect(appJs).toContain('visibleUserFlowConnections');
    expect(appJs.indexOf('data-connector-layer="crosslinks"')).toBeLessThan(
      appJs.indexOf('data-connector-layer="userflows"')
    );
    expect(appJs).toContain('buildConnectorBezier({');
    expect(appJs).toContain('USER_FLOW_ARROWHEAD.path');
    expect(appJs).toContain("markerEnd={isUserFlow ? 'url(#arrowhead-userflow)' : 'none'}");
    expect(appJs).not.toContain('getConnectionsAtAnchor');
    expect(appJs).not.toContain('relationship-map-connector-gap-mask');
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

  test('button size typography tokens match the shared scale', () => {
    expect(generatedCss).toContain('--type-button-lg-size: 16px;');
    expect(generatedCss).toContain('--type-button-lg-weight: 700;');
    expect(appCss).toMatch(/\.ui-btn--sm \{[\s\S]*height: var\(--unit-32\);[\s\S]*min-height: var\(--unit-32\);[\s\S]*font-size: var\(--type-button-sm-size\);[\s\S]*font-weight: var\(--type-button-sm-weight\);[\s\S]*\}/);
    expect(appCss).toMatch(/\.ui-btn--md \{[\s\S]*height: var\(--unit-40\);[\s\S]*min-height: var\(--unit-40\);[\s\S]*font-size: var\(--type-button-md-size\);[\s\S]*font-weight: var\(--type-button-md-weight\);[\s\S]*\}/);
    expect(appCss).toMatch(/\.ui-btn--lg \{[\s\S]*height: var\(--unit-48\);[\s\S]*min-height: var\(--unit-48\);[\s\S]*font-size: var\(--type-button-lg-size\);[\s\S]*font-weight: var\(--type-button-lg-weight\);[\s\S]*\}/);
  });

  test('icon button active state has enough specificity for styled icon buttons', () => {
    expect(appCss).toContain('.ui-icon-btn.ui-icon-btn--active {');
    expect(appCss).toContain('.ui-icon-btn.ui-icon-btn--active:hover:not(:disabled) {');
    expect(appCss).toMatch(/\.ui-icon-btn\.ui-icon-btn--active \{[\s\S]*background: var\(--ui-icon-button-active-bg\);[\s\S]*color: var\(--ui-icon-button-active-fg\);[\s\S]*\}/);
    expect(appCss).toMatch(/\.ui-icon-btn\.ui-icon-btn--type-secondary\.ui-icon-btn--style-mono\.ui-icon-btn--active \{[\s\S]*background: var\(--ui-color-surface-muted\);[\s\S]*border-color: var\(--ui-button-mono-quiet\);[\s\S]*color: var\(--ui-button-mono-quiet\);[\s\S]*box-shadow: inset 0 0 0 1px var\(--ui-button-mono-quiet\);[\s\S]*\}/);
    expect(appCss).toMatch(/\.ui-icon-btn\.ui-icon-btn--type-secondary\.ui-icon-btn--style-mono\.ui-icon-btn--active:hover:not\(:disabled\) \{[\s\S]*background: var\(--ui-color-surface-muted\);[\s\S]*border-color: var\(--ui-button-mono-quiet-hover\);[\s\S]*color: var\(--ui-button-mono-quiet-hover\);[\s\S]*box-shadow: inset 0 0 0 1px var\(--ui-button-mono-quiet-hover\);[\s\S]*\}/);
    expect(appCss).toMatch(/\.ui-icon-btn--xxs \{[\s\S]*border-radius: var\(--ui-icon-button-radius-sm\);[\s\S]*\}/);
    expect(generatedCss).toContain('--ui-icon-button-size-xxs: 16px;');
    expect(generatedCss).toContain('--ui-icon-button-size-xs: 24px;');
    expect(generatedCss).toContain('--ui-icon-button-size-sm: 32px;');
    expect(generatedCss).toContain('--ui-icon-button-size-md: 40px;');
    expect(generatedCss).toContain('--ui-icon-button-size-lg: 48px;');
    expect(generatedCss).toContain('--ui-icon-button-radius-sm: var(--radius-xs);');
    expect(generatedCss).toContain('--ui-icon-button-active-bg: var(--ui-color-primary);');
    expect(generatedCss).toContain('--ui-icon-button-active-bg-hover: var(--ui-color-primary-hover);');
    expect(generatedCss).toContain('--ui-icon-button-active-fg: var(--ui-icon-inverse);');
    expect(appCss).not.toContain('\n.ui-icon-btn--active {');
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

describe('comment popover positioning', () => {
  const {
    getCommentDrawerNodeFocusTarget,
    getCommentPopoverDrawerPosition,
    getCommentPopoverPosition,
  } = __testing;
  const canvasRect = {
    left: 100,
    top: 200,
    width: 1000,
    height: 800,
  };

  test('left-half nodes anchor popovers to the right edge', () => {
    expect(getCommentPopoverPosition({
      canvasRect,
      nodeRect: {
        left: 200,
        right: 488,
        top: 300,
        bottom: 578,
        width: 288,
        height: 278,
      },
    })).toEqual({
      side: 'right',
      x: 396,
      y: 239,
    });
  });

  test('right-half nodes anchor popovers to the left edge', () => {
    expect(getCommentPopoverPosition({
      canvasRect,
      nodeRect: {
        left: 900,
        right: 1188,
        top: 300,
        bottom: 578,
        width: 288,
        height: 278,
      },
    })).toEqual({
      side: 'left',
      x: 408,
      y: 239,
    });
  });

  test('comments drawer selections use drawer spacing without delayed popover open', () => {
    expect(getCommentPopoverDrawerPosition({
      canvasRect,
      drawerRect: {
        left: 900,
      },
    })).toEqual({
      side: 'right',
      x: 384,
      y: 400,
    });

    expect(getCommentDrawerNodeFocusTarget({
      canvasRect,
      drawerRect: {
        left: 900,
      },
    })).toEqual({
      screenRight: 376,
      screenCenterY: 400,
    });

    expect(appJs).toContain('const openCommentPopoverFromDrawer = (nodeId, commentId) => {');
    expect(appJs).toContain('focusNodeById(nodeId, focusTarget);');
    expect(appJs).toContain('setSelectedCommentId(commentId || null);');
    expect(appJs).toContain('openCommentPopoverFromDrawer(nodeId, commentId);');
    expect(appJs).not.toContain('setTimeout(() => openCommentPopover(nodeId, { forceSide:');
  });

  test('popover container stays fixed-size outside the zoomed canvas content', () => {
    expect(appCss).toMatch(/\.comment-popover-container \{[\s\S]*width: 384px;[\s\S]*transform: translateY\(-50%\);[\s\S]*\}/);
    expect(appJs).toContain('querySelector(`[data-node-card="1"][data-node-id="${safeNodeId}"]`)');
    expect(appCss).toMatch(/\.comment-popover\.modal-card \{[\s\S]*border: var\(--border-width-subtle\) solid var\(--modal-card-border\);/);
    expect(appCss).toMatch(/\.comment-popover-container\.right::before \{[\s\S]*background: var\(--modal-card-border\);[\s\S]*clip-path: polygon\(0 50%, 100% 0, 100% 100%\);/);
    expect(appCss).toMatch(/\.comment-popover-container\.right::after \{[\s\S]*background: var\(--modal-bg\);[\s\S]*clip-path: polygon\(0 50%, 100% 0, 100% 100%\);/);
    expect(appCss).toMatch(/\.comment-popover-container\.right \.comment-popover\.modal-card::before \{[\s\S]*left: calc\(-1 \* var\(--border-width-subtle\)\);/);
    expect(appCss).toMatch(/\.comment-complete-btn\.checked,[\s\S]*\.comment-complete-btn\.checked:hover:not\(:disabled\),[\s\S]*\.comment-complete-btn\.checked:focus-visible \{[\s\S]*color: var\(--ui-status-success-icon\);/);
  });

  test('comments drawer items use mono text styles and compact menu controls', () => {
    expect(appCss).toMatch(/\.comments-panel-node-title \{[\s\S]*color: var\(--ui-color-text\);[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
    expect(appCss).toMatch(/\.comments-panel-item \{[\s\S]*border: var\(--border-width-subtle\) solid var\(--modal-card-border\);/);
    expect(appCss).toMatch(/\.comments-panel-item\.is-selected \{[\s\S]*border-color: var\(--ui-color-border-strong\);[\s\S]*box-shadow: inset 0 0 0 1px var\(--ui-color-border-strong\);/);
    const selectedCommentBlock = appCss.match(/\.comments-panel-item\.is-selected \{[\s\S]*?\}/)?.[0] || '';
    expect(selectedCommentBlock).not.toContain('var(--ui-color-primary)');
    expect(appCss).toMatch(/\.comments-panel-text \{[\s\S]*font-size: var\(--type-body-sm-size\);/);
    expect(appCss).toMatch(/\.comments-panel-menu \{[\s\S]*width: 128px;[\s\S]*min-width: 128px;/);
    expect(appCss).toMatch(/\.comments-panel-menu-item\.ui-menu-item \{[\s\S]*min-height: 24px;/);
    expect(appCss).not.toMatch(/\.comments-filter-select/);
    expect(appCss).not.toMatch(/\.comments-filter-toggle/);
    expect(appCss).not.toMatch(/\.comments-panel-control-button/);
    expect(appJs).not.toContain('Filter comments');
    expect(appJs).not.toContain('ListFilter');
  });

  test('shared search and dark input tokens stay consistent', () => {
    expect(generatedCss).toMatch(/\[data-theme="dark"\] \{[\s\S]*--ui-color-input-bg: var\(--color-plum-950\);/);
    expect(generatedCss).toMatch(/\[data-theme="dark"\] \{[\s\S]*--ui-input-mono-border: var\(--color-plum-600\);[\s\S]*--ui-input-mono-border-hover: var\(--color-plum-500\);[\s\S]*--ui-input-mono-border-focus: var\(--color-plum-400\);/);
    expect(generatedCss).toMatch(/\[data-theme="dark"\] \{[\s\S]*--ui-status-success-icon: var\(--color-green-300\);/);
    expect(appCss).toMatch(/\.ui-search-input \{[\s\S]*width: 100%;/);
    expect(appCss).toMatch(/\[data-theme="dark"\] \.modal-card input,[\s\S]*background-color: var\(--ui-color-input-bg\);/);
    expect(appCss).toMatch(/\[data-theme="dark"\] \.blank-scan-shell\.search-container:hover,[\s\S]*background: var\(--ui-color-input-bg\);/);
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
    expect(appJs).toContain('setLargeMapMinimapOverview(scene.minimap);');
    expect(appJs).toContain('overview: useLargeMapSurface ? largeMapMinimapOverview : null');
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
    const formBlock = appCss.match(/\.edit-node-form \{([\s\S]*?)\}/)?.[1] || '';
    expect(formBlock).not.toContain('flex: 1;');
    expect(formBlock).not.toContain('min-height: 0;');
    expect(appCss).toMatch(/\.edit-node-form \{[\s\S]*gap: var\(--unit-16\);/);
    expect(appCss).toMatch(/\.edit-node-form-content \{[\s\S]*padding-bottom: var\(--space-none\);[\s\S]*scroll-padding-block: var\(--unit-20\) var\(--unit-24\);/);
    expect(generatedCss).toContain('--type-label-sm-weight: 500;');
    expect(appCss).toMatch(/\.field \{[\s\S]*gap: var\(--space-xs\);/);
    expect(appCss).toMatch(/\.field-label \{[\s\S]*font-size: var\(--type-label-sm-size\);[\s\S]*line-height: var\(--type-label-sm-line-height\);[\s\S]*font-weight: var\(--type-label-sm-weight\);/);
    expect(appCss).toMatch(/\.edit-node-form > \.field:last-child \{[\s\S]*margin-bottom: var\(--unit-16\);/);
    expect(appCss).toMatch(/\.edit-node-modal__footer-actions \{[\s\S]*gap: var\(--unit-12\);/);
    expect(appCss).toMatch(/\.edit-node-duplicate-section \{[\s\S]*gap: var\(--unit-10\);[\s\S]*padding: var\(--unit-14\);/);
    expect(appCss).toMatch(/\.edit-node-duplicate-row \{[\s\S]*grid-template-columns: minmax\(120px, 0\.4fr\) minmax\(0, 1fr\);[\s\S]*gap: var\(--unit-8\);/);
    expect(appCss).toMatch(/\.edit-node-seo-section \{[\s\S]*gap: var\(--unit-12\);/);
    expect(appCss).toMatch(/\.edit-node-seo-section \{[\s\S]*background: var\(--ui-color-surface\);/);
    expect(appCss).toMatch(/\.edit-node-seo-section \{[\s\S]*border-radius: var\(--ui-radius-lg\);/);
    expect(appCss).toMatch(/\.edit-node-form-grid \{[\s\S]*column-gap: var\(--unit-20\);[\s\S]*row-gap: var\(--unit-10\);/);
    expect(appCss).toMatch(/\.image-upload-zone \{[\s\S]*border: var\(--border-width-subtle\) dashed var\(--ui-color-border-strong\);/);
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
