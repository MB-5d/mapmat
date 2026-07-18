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
  IMPORT_MODES,
  materializeImportedMap,
  parseCsv,
  parseImportFileContent,
  parseImportSource,
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
  expect(result.root.nodeKind).toBe('import-container');
  const [home, docs, asset] = result.root.children;
  expect(home.title).toBe('Home');
  expect(home.children[0].title).toBe('About');
  expect(home.children[0].children[0].title).toBe('Team');
  expect([docs.title, asset.title]).toEqual(['Docs', 'PDF Asset']);
  expect(docs.subdomainRoot).toBe(true);
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
    expect(result.root.nodeKind).toBe('import-container');
    expect(result.root.children).toHaveLength(rows.length);
    expect(result.root.children.every((node) => node.nodeKind === 'page')).toBe(true);
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
    const home = result.root.children[0];
    expect(home.title).toBe('Home');
    expect(home.children[0].title).toBe('Services');
    expect(home.children[0].children[0].title).toBe('Consulting');
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
    const home = result.root.children[0];
    expect(home.title).toBe('Home');
    expect(home.children[0].title).toBe('About');
  });

  test('preserves genuine non-page section labels without treating them as pages', () => {
    const result = parseImportFileContent(`
      <ul>
        <li>Resources
          <ul><li><a href="https://external.test/guides">Guides</a></li></ul>
        </li>
      </ul>
    `, 'html');

    const section = result.root.children[0];
    expect(section.title).toBe('Resources');
    expect(section.nodeKind).toBe('source-group');
    expect(section.url).toBe('');
    expect(section.children[0].url).toBe('https://external.test/guides');
  });

  test('imports strict TXT sitemap as equal unconnected pages by default', () => {
    const txt = buildTxtSitemap([
      { url: 'https://external.test/' },
      { url: 'https://external.test/about' },
    ]);

    const result = parseImportFileContent(txt, 'txt');

    expect(result.parseType).toBe('Text');
    expect(result.root.nodeKind).toBe('import-container');
    expect(result.root.children.map((node) => node.url)).toEqual([
      'https://external.test/',
      'https://external.test/about',
    ]);
    expect(result.root.children.every((node) => node.children.length === 0)).toBe(true);
  });

  test('does not import non-URL CSV metadata columns as pages', () => {
    const csv = [
      '"URL","Source URL"',
      '"https://example.com","https://vellic.io"',
    ].join('\n');

    const result = parseImportFileContent(csv, 'csv');

    expect(result.root.children.map((node) => node.url)).toEqual(['https://example.com']);
  });

  test('previews duplicates, invalid entries, and headers before materializing', () => {
    const preview = parseImportSource([
      'URL',
      'https://example.com/page#one',
      'https://www.example.com/page#two',
      'not-a-url',
      'https://example.com/page?view=print',
    ].join('\n'), 'paste');

    expect(preview.diagnostics).toEqual({
      validCount: 2,
      duplicateCount: 1,
      invalidCount: 1,
      ignoredCount: 1,
    });
  });

  test('builds URL hierarchy with non-page ghosts and shared ancestors', () => {
    const preview = parseImportSource([
      'https://site.test/page/articles/blog3',
      'https://site.test/page/articles/blog4',
      'https://docs.site.test/start',
    ].join('\n'), 'paste');
    const result = materializeImportedMap(preview, IMPORT_MODES.URL_HIERARCHY);

    const siteRoot = result.root.children.find((node) => node.title === 'site.test');
    expect(siteRoot.nodeKind).toBe('import-ghost');
    expect(siteRoot.url).toBe('');
    expect(siteRoot.children[0].title).toBe('page');
    expect(siteRoot.children[0].children[0].title).toBe('articles');
    expect(siteRoot.children[0].children[0].children.map((node) => node.title)).toEqual(['blog3', 'blog4']);
    expect(result.root.children.find((node) => node.title === 'docs.site.test')).toBeTruthy();
  });

  test('produces the same flat page list for TXT, CSV, and XML', () => {
    const urls = ['https://one.test/a', 'https://two.test/b/deep'];
    const sources = [
      parseImportFileContent(urls.join('\n'), 'txt'),
      parseImportFileContent(`URL\n${urls.join('\n')}`, 'csv'),
      parseImportFileContent(`<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`, 'xml'),
    ];

    sources.forEach((result) => {
      expect(result.root.children.map((node) => node.url)).toEqual(urls);
      expect(result.root.children.every((node) => node.children.length === 0)).toBe(true);
    });
  });

  test('preserves supplied flat page numbers without inventing hierarchy', () => {
    const result = parseImportFileContent([
      'Page Number,Page Title,URL',
      '8,First,https://one.test/a',
      '12,Second,https://two.test/b',
    ].join('\n'), 'csv');

    expect(result.root.children.map((node) => node.importNumber)).toEqual(['8', '12']);
    expect(result.root.children.every((node) => node.hideImportedPageNumber === false)).toBe(true);
    expect(result.root.children.every((node) => node.children.length === 0)).toBe(true);
  });

  test('reports malformed URL cells even when CSV hierarchy is valid', () => {
    const preview = parseImportSource([
      'Title,URL,Depth',
      'Home,https://external.test,0',
      'Child,https://external.test/child,1',
      'Broken,not-a-url,1',
    ].join('\n'), 'csv');

    expect(preview.hasExplicitStructure).toBe(true);
    expect(preview.diagnostics.validCount).toBe(2);
    expect(preview.diagnostics.invalidCount).toBe(1);
    expect(preview.diagnostics.ignoredCount).toBe(1);
  });

  test('materializes the same 100 screenshot pages across every supported URL-list format', () => {
    const urls = Array.from({ length: 100 }, (_, index) => `https://host-${index}.test/level/${index}/page`);
    const inputs = [
      ['txt', urls.join('\n')],
      ['csv', `URL\n${urls.join('\n')}`],
      ['xml', `<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`],
      ['rss', `<rss><channel>${urls.map((url) => `<item><link>${url}</link></item>`).join('')}</channel></rss>`],
      ['atom', `<feed>${urls.map((url) => `<entry><link href="${url}" /></entry>`).join('')}</feed>`],
      ['html', urls.map((url) => `<a href="${url}">Page</a>`).join('\n')],
      ['md', urls.join('\n')],
      ['json', JSON.stringify(urls)],
    ];

    inputs.forEach(([extension, content]) => {
      const result = parseImportFileContent(content, extension);
      expect(result.root.children).toHaveLength(100);
      expect(result.root.children.map((node) => node.url)).toEqual(urls);
      expect(result.root.children.map((node) => node.title)).toEqual(Array(100).fill('page'));
    });
  });
});
