import {
  EXPORT_MAP_PADDING,
  buildExportInsights,
  buildExportScene,
  drawExportSceneToPdf,
  formatShareUrlForExport,
  getPdfSceneScale,
  registerExportPdfFonts,
  renderExportSvg,
} from './exportScene';
import { REPORT_TYPE_OPTIONS } from './constants';
import { VELLIC_LOGO_MARK_PATH } from '../components/brand/VellicLogo';

global.TextEncoder = global.TextEncoder || require('util').TextEncoder;
global.TextDecoder = global.TextDecoder || require('util').TextDecoder;

const { jsPDF } = require('jspdf');

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
  });

  test('formatShareUrlForExport shortens the displayed share id without query params', () => {
    expect(formatShareUrlForExport(
      'https://staging.vellic.io/share/10cfa69-3268-4ce2-8f73-737498f7ae75?access=view&orientation=vertical',
    )).toBe('staging.vellic.io/share/10cfa693...ae75');
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
    expect(pdf.output()).not.toContain('/Subtype /Image');
  });

  test('registerExportPdfFonts embeds Sora for vector PDF text', async () => {
    const fs = require('fs');
    const path = require('path');
    const originalFetch = global.fetch;
    const fontBuffer = fs.readFileSync(path.join(__dirname, '../assets/fonts/Sora-Variable.ttf'));
    global.fetch = jest.fn(async () => ({
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
