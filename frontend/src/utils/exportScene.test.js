import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';

import {
  EXPORT_MAP_PADDING,
  buildExportInsights,
  buildExportScene,
  drawExportSceneToPdf,
  getPngExportLimitReason,
  formatShareUrlForExport,
  getPngExportPixelRatio,
  getPdfSceneScale,
  registerExportPdfFonts,
  renderEditableExportSvg,
  renderExportSvg,
} from './exportScene';
import { REPORT_TYPE_OPTIONS } from './constants';
import { VELLIC_LOGO_MARK_PATH } from '../components/brand/VellicLogo';

globalThis.TextEncoder = globalThis.TextEncoder || TextEncoder;
globalThis.TextDecoder = globalThis.TextDecoder || TextDecoder;
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

const makeNode = (id, children = []) => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  children,
});

describe('export scene helpers', () => {
  test('buildExportInsights includes total and only non-zero issue stats', () => {
    const insights = buildExportInsights({
      total: 12,
      standard: 10,
      duplicates: 2,
      errorPages: 0,
      missing: 1,
    }, REPORT_TYPE_OPTIONS);

    expect(insights).toEqual([
      { key: 'total', label: 'Total pages', value: 12 },
      { key: 'missing', label: 'Missing', value: 1 },
      { key: 'duplicates', label: 'Duplicates', value: 2 },
    ]);
  });

  test('buildExportScene expands stacked children and keeps 200px map padding', () => {
    const root = makeNode('home', [
      makeNode('section', [
        makeNode('child-1'),
        makeNode('child-2'),
        makeNode('child-3'),
        makeNode('child-4'),
        makeNode('child-5'),
      ]),
    ]);

    const scene = buildExportScene({
      root,
      title: 'Example Map',
      shareUrl: 'https://app.vellic.io/share/example',
      reportStats: { total: 7 },
      reportTypeOptions: REPORT_TYPE_OPTIONS,
    });

    expect(scene.nodes).toHaveLength(7);
    const leftMostNodeX = Math.min(...scene.nodes.map((node) => node.x + scene.mapOffset.x));
    expect(leftMostNodeX).toBe(EXPORT_MAP_PADDING);
  });

  test('renderExportSvg excludes app-only UI controls', () => {
    const scene = buildExportScene({
      root: makeNode('home'),
      title: 'Example Map',
      shareUrl: 'https://app.vellic.io/share/example',
      reportStats: { total: 1 },
      reportTypeOptions: REPORT_TYPE_OPTIONS,
    });
    const svg = renderExportSvg(scene, new Map());

    expect(svg).not.toContain('zoom-controls');
    expect(svg).not.toContain('thumb-fullsize-btn');
    expect(svg).not.toContain('stack-toggle');
    expect(svg).toContain('Created with');
    expect(svg).toContain(VELLIC_LOGO_MARK_PATH);
    expect(svg).toMatch(/y="88" fill="#1e293b"[^>]*>app\.vellic\.io\/share\/example<\/text>/);
    expect(svg).toContain('id="vellic-sitemap"');
    expect(svg).toContain('id="vellic-nodes"');
    expect(svg).not.toContain('id="vellic-local-components"');
  });

  test('renderEditableExportSvg adds structured groups and local component specimens', () => {
    const scene = buildExportScene({
      root: makeNode('home', [
        { ...makeNode('missing'), isMissing: true },
        { ...makeNode('duplicate'), isDuplicate: true },
      ]),
      title: 'Example Map',
      shareUrl: 'https://app.vellic.io/share/example',
      reportStats: { total: 3, missing: 1, duplicates: 1 },
      reportTypeOptions: REPORT_TYPE_OPTIONS,
    });
    const svg = renderEditableExportSvg(scene, new Map());

    expect(svg).toContain('data-vellic-export="editable-sitemap-svg"');
    expect(svg).toContain('data-vellic-page="Sitemap"');
    expect(svg).toContain('data-vellic-page="Local Components"');
    expect(svg).toContain('data-vellic-layer="tree-connectors"');
    expect(svg).toContain('data-vellic-layer="relationship-connectors"');
    expect(svg).toContain('data-vellic-layer="node-title"');
    expect(svg).toContain('data-vellic-layer="page-number"');
    expect(svg).toContain('data-vellic-component="Node Card"');
    expect(svg).toContain('data-vellic-component="Status Badge"');
    expect(svg).toContain('Page Depth Colors');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<foreignObject');
    expect(svg).not.toContain('<symbol');
    expect(svg).not.toContain('<use');
  });

  test('renderExportSvg clips level bars inside the node and centers badge labels', () => {
    const scene = buildExportScene({
      root: makeNode('home', [{ ...makeNode('missing'), isMissing: true }]),
      title: 'Example Map',
      shareUrl: 'https://app.vellic.io/share/example',
      reportStats: { total: 2, missing: 1 },
      reportTypeOptions: REPORT_TYPE_OPTIONS,
    });
    const svg = renderExportSvg(scene, new Map());

    expect(svg).toMatch(/<clipPath id="export-card-/);
    expect(svg).toMatch(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="10" fill="#38bdf8"/);
    expect(svg).toContain('dominant-baseline="middle"');
    expect(svg).toContain('MISSING');
  });

  test('buildExportScene keeps header insights compact', () => {
    const scene = buildExportScene({
      root: makeNode('home'),
      title: 'Example Map',
      reportStats: { total: 155, missing: 8, duplicates: 2 },
      reportTypeOptions: REPORT_TYPE_OPTIONS,
    });

    const [totalPages, missing, duplicates] = scene.header.insightPositions;
    expect(missing.x).toBeLessThan(150);
    expect(missing.x - totalPages.x).toBeGreaterThan(24);
    expect(duplicates.x - missing.x).toBeLessThan(120);
  });

  test('formatShareUrlForExport keeps displayed share URLs typeable without query params', () => {
    expect(formatShareUrlForExport(
      'https://staging.vellic.io/share/10cfa69-3268-4ce2-8f73-737498f7ae75?access=view&orientation=vertical',
    )).toBe('staging.vellic.io/share/10cfa69-3268-4ce2-8f73-737498f7ae75');
    expect(formatShareUrlForExport(
      'https://staging.vellic.io/share/ab42x9?access=view&orientation=vertical',
    )).toBe('staging.vellic.io/share/ab42x9');
  });

  test('getPngExportPixelRatio scales oversized scenes below one to fit browser limits', () => {
    const ratio = getPngExportPixelRatio({
      width: 50000,
      height: 12000,
    }, {
      pixelRatio: 4,
      maxDimension: 16000,
      maxPixels: 80000000,
    });

    expect(ratio).toBeLessThan(1);
    expect(Math.ceil(50000 * ratio)).toBeLessThanOrEqual(16000);
    expect(Math.ceil(50000 * ratio) * Math.ceil(12000 * ratio)).toBeLessThanOrEqual(80000000);
  });

  test('getPngExportLimitReason blocks oversized single-image exports instead of tiling', () => {
    const reason = getPngExportLimitReason({
      width: 50000,
      height: 12000,
    }, {
      pixelRatio: 4,
      maxDimension: 32767,
      maxPixels: 160000000,
    });

    expect(reason).toBe('Image export is unavailable for maps this large. Use PDF for full-size export.');
  });

  test('relationship connectors use canonical palette keys and avoid reserved tree endpoints', () => {
    const root = makeNode('home', [makeNode('about')]);
    const scene = buildExportScene({
      root,
      connections: [{
        id: 'flow-1',
        type: 'userflow',
        sourceNodeId: 'home',
        targetNodeId: 'about',
        sourceAnchor: 'bottom',
        targetAnchor: 'top',
      }],
      connectionColors: {
        userFlows: '#123456',
        crossLinks: '#abcdef',
      },
      reportStats: { total: 2 },
      reportTypeOptions: REPORT_TYPE_OPTIONS,
    });
    const connector = scene.relationshipConnectors[0];
    const rootLayout = scene.layout.nodes.get('home');

    expect(connector.color).toBe('#123456');
    expect(connector.geometry.startPos.x).not.toBeCloseTo(rootLayout.x + rootLayout.w / 2);
  });

  test('drawExportSceneToPdf creates vector output when thumbnails are absent', () => {
    const scene = buildExportScene({
      root: makeNode('home', [makeNode('about')]),
      title: 'Example Map',
      shareUrl: 'https://app.vellic.io/share/example',
      reportStats: { total: 2 },
      reportTypeOptions: REPORT_TYPE_OPTIONS,
    });
    const scale = getPdfSceneScale(scene);
    const pdf = new jsPDF({
      orientation: scene.width > scene.height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [scene.width * scale, scene.height * scale],
      compress: false,
    });

    expect(() => drawExportSceneToPdf(pdf, scene, new Map(), scale)).not.toThrow();
    const output = pdf.output();
    expect(output).not.toContain('/Subtype /Image');
    expect(output).toContain('https://vellic.io');
    expect(output).toContain('0.388 0.4 0.945 rg');
  });

  test('drawExportSceneToPdf resets dashed flow styles before node borders', () => {
    const scene = buildExportScene({
      root: makeNode('home', [makeNode('about')]),
      title: 'Example Map',
      shareUrl: 'https://app.vellic.io/share/example',
      connections: [{
        id: 'crosslink-1',
        type: 'crosslink',
        sourceNodeId: 'home',
        targetNodeId: 'about',
        sourceAnchor: 'right',
        targetAnchor: 'left',
      }],
      reportStats: { total: 2 },
      reportTypeOptions: REPORT_TYPE_OPTIONS,
    });
    const scale = getPdfSceneScale(scene);
    const pdf = new jsPDF({
      orientation: scene.width > scene.height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [scene.width * scale, scene.height * scale],
      compress: false,
    });

    drawExportSceneToPdf(pdf, scene, new Map(), scale);
    const output = pdf.output();
    const dashedIndex = output.indexOf('[9. 7.] 0. d');
    const resetIndex = output.indexOf('[] 0. d', dashedIndex);

    expect(dashedIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(dashedIndex);
  });

  test('registerExportPdfFonts embeds Sora for vector PDF text', async () => {
    const originalFetch = global.fetch;
    const fontBuffer = fs.readFileSync(path.join(testDirectory, '../assets/fonts/Sora-Variable.ttf'));
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => fontBuffer.buffer.slice(
        fontBuffer.byteOffset,
        fontBuffer.byteOffset + fontBuffer.byteLength,
      ),
    }));

    const pdf = new jsPDF();
    try {
      await expect(registerExportPdfFonts(pdf)).resolves.toBe(true);
      expect(pdf.getFontList().Sora).toEqual(expect.arrayContaining(['normal', 'bold']));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
