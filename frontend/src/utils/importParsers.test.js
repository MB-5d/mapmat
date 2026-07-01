import {
  buildExportMetadata,
  buildSiteIndexHtml,
  buildSiteIndexMarkdown,
  buildSiteIndexText,
  buildSitemapCsv,
  buildSitemapExportRows,
  buildSitemapJsonPayload,
  buildSitemapXml,
  buildTxtSitemap,
} from './fileExports';
import {
  parseCsv,
  parseImportFileContent,
} from './importParsers';

const buildSampleRows = () => buildSitemapExportRows({
  id: 'root',
  title: 'Home',
  url: 'https://example.com',
  children: [
    {
      id: 'about',
      title: 'About',
      url: 'https://example.com/about',
      children: [
        {
          id: 'team',
          title: 'Team',
          url: 'https://example.com/about/team',
          children: [],
        },
      ],
    },
  ],
}, [
  {
    id: 'asset',
    title: 'PDF Asset',
    url: 'https://example.com/file.pdf',
    orphanType: 'file',
    children: [],
  },
  {
    id: 'docs',
    title: 'Docs',
    url: 'https://docs.example.com',
    subdomainRoot: true,
    children: [],
  },
]);

const expectSampleStructure = (result) => {
  expect(result.root.title).toBe('Home');
  expect(result.root.children[0].title).toBe('About');
  expect(result.root.children[0].children[0].title).toBe('Team');
  expect(result.orphans.map((node) => node.title)).toEqual(['Docs', 'PDF Asset']);
  expect(result.orphans[0].subdomainRoot).toBe(true);
};

describe('importParsers', () => {
  test('restores exact Vellic JSON exports', () => {
    const payload = buildSitemapJsonPayload({
      root: {
        id: 'root',
        title: 'Home',
        url: 'https://example.com',
        thumbnailUrl: '/screenshots/missing-thumb.webp',
        thumbnailCaptureFailed: true,
        thumbnailCaptureError: 'Image failed to load',
        children: [{
          id: 'child',
          title: 'Child',
          url: 'https://example.com/child',
          fullScreenshotUrl: '/screenshots/missing-full.webp',
          children: [],
        }],
      },
      orphans: [{
        id: 'orphan',
        title: 'Orphan',
        url: 'https://example.com/orphan',
        thumbnailFullUrl: '/screenshots/missing-preview.webp',
        children: [],
      }],
      connections: [{ id: 'c1', from: 'root', to: 'orphan' }],
      colors: ['#ffffff'],
      connectionColors: { crossLinks: '#111111' },
      rows: [{ number: '0', url: 'https://example.com' }],
      metadata: buildExportMetadata({ title: 'JSON Round Trip', pageCount: 1 }),
    });

    const result = parseImportFileContent(JSON.stringify(payload), 'json');

    expect(result.parseType).toBe('Vellic JSON');
    expect(result.root.id).toBe('root');
    expect(result.root.thumbnailUrl).toBeUndefined();
    expect(result.root.thumbnailCaptureFailed).toBeUndefined();
    expect(result.root.children[0].fullScreenshotUrl).toBeUndefined();
    expect(result.orphans[0].id).toBe('orphan');
    expect(result.orphans[0].thumbnailFullUrl).toBeUndefined();
    expect(result.connections).toEqual([{ id: 'c1', from: 'root', to: 'orphan' }]);
    expect(result.colors).toEqual(['#ffffff']);
    expect(result.connectionColors).toEqual({ crossLinks: '#111111' });
  });

  test('restores CSV hierarchy instead of rebuilding from URL paths', () => {
    const rows = buildSampleRows();
    const csv = buildSitemapCsv(rows, buildExportMetadata({ title: 'CSV Round Trip', pageCount: rows.length }));

    const result = parseImportFileContent(csv, 'csv');

    expect(result.parseType).toBe('CSV sitemap');
    expectSampleStructure(result);
    expect(parseCsv(csv)).not.toContain('https://vellic.io');
  });

  test('restores Markdown nested site index hierarchy', () => {
    const rows = buildSampleRows();
    const markdown = buildSiteIndexMarkdown({
      rows,
      metadata: buildExportMetadata({ title: 'Markdown Round Trip', pageCount: rows.length }),
      rootUrl: 'https://example.com',
      hostname: 'example.com',
    });

    const result = parseImportFileContent(markdown, 'md');

    expect(result.parseType).toBe('Markdown sitemap');
    expectSampleStructure(result);
  });

  test('restores HTML nested site index hierarchy', () => {
    const rows = buildSampleRows();
    const html = buildSiteIndexHtml({
      rows,
      metadata: buildExportMetadata({ title: 'HTML Round Trip', pageCount: rows.length }),
      rootUrl: 'https://example.com',
      hostname: 'example.com',
    });

    const result = parseImportFileContent(html, 'html');

    expect(result.parseType).toBe('HTML sitemap');
    expectSampleStructure(result);
  });

  test('restores text index hierarchy', () => {
    const rows = buildSampleRows();
    const text = buildSiteIndexText({
      rows,
      metadata: buildExportMetadata({ title: 'Text Round Trip', pageCount: rows.length }),
      rootUrl: 'https://example.com',
      hostname: 'example.com',
    });

    const result = parseImportFileContent(text, 'txt');

    expect(result.parseType).toBe('Text index');
    expectSampleStructure(result);
  });

  test('imports standard XML URLs without relying on hidden hierarchy comments', () => {
    const rows = buildSampleRows();
    const xml = buildSitemapXml(rows, buildExportMetadata({ title: 'XML Round Trip', pageCount: rows.length }));

    const result = parseImportFileContent(xml, 'xml');

    expect(result.parseType).toBe('XML Sitemap');
    expect(result.count).toBe(rows.length);
    expect(result.root.title).toBe('Imported Sites');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://example.com/about/team</loc>');
    expect(xml).not.toContain('vellic-page:');
    expect(xml).not.toContain('https://vellic.io');
  });

  test('imports external CSV depth columns as hierarchy', () => {
    const csv = [
      'Title,URL,Depth,Type',
      'Home,https://external.test/,0,Home',
      'Services,https://external.test/services,1,Page',
      'Consulting,https://external.test/services/consulting,2,Page',
    ].join('\n');

    const result = parseImportFileContent(csv, 'csv');

    expect(result.parseType).toBe('CSV sitemap');
    expect(result.root.title).toBe('Home');
    expect(result.root.children[0].title).toBe('Services');
    expect(result.root.children[0].children[0].title).toBe('Consulting');
  });

  test('imports external HTML nested links as hierarchy', () => {
    const html = `
      <ul>
        <li><a href="https://external.test/">Home</a>
          <ul>
            <li><a href="https://external.test/about">About</a></li>
          </ul>
        </li>
      </ul>
    `;

    const result = parseImportFileContent(html, 'html');

    expect(result.parseType).toBe('HTML sitemap');
    expect(result.root.title).toBe('Home');
    expect(result.root.children[0].title).toBe('About');
  });

  test('imports strict TXT sitemap as URL-inferred structure', () => {
    const txt = buildTxtSitemap([
      { url: 'https://external.test/' },
      { url: 'https://external.test/about' },
    ]);

    const result = parseImportFileContent(txt, 'txt');

    expect(result.parseType).toBe('Text');
    expect(result.root.url).toBe('https://external.test/');
    expect(result.root.children[0].url).toBe('https://external.test/about');
  });

  test('does not import non-URL CSV metadata columns as pages', () => {
    const csv = [
      '"URL","Source URL"',
      '"https://example.com","https://vellic.io"',
    ].join('\n');

    const result = parseImportFileContent(csv, 'csv');

    expect(result.root.url).toBe('https://example.com');
    expect(result.root.children).toEqual([]);
  });
});
