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
  getSitemapExportFilenameBase,
} from './fileExports';

describe('fileExports', () => {
  test('uses the requested map-title filename pattern', () => {
    expect(getSitemapExportFilenameBase('My Map: Launch Plan', new Date(2026, 5, 22)))
      .toBe('My-Map-Launch-Plan_sitemap-by-Vellic.io_22-06-26');
  });

  test('numbers export rows from zero and includes subdomain and orphan trees', () => {
    const rows = buildSitemapExportRows({
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

    expect(rows.map((row) => row.number)).toEqual(['0', '1', '1.1', 's1', '0.1']);
    expect(rows.map((row) => row.id)).toEqual(['root', 'about', 'team', 'docs', 'asset']);
  });

  test('keeps CSV rows aligned when values contain commas, quotes, and newlines', () => {
    const generatedAt = new Date('2026-06-22T12:00:00.000Z');
    const metadata = buildExportMetadata({ title: 'Export Test', generatedAt, pageCount: 1 });
    const csv = buildSitemapCsv([
      {
        number: '0',
        section: 'main',
        depth: 0,
        title: 'Home, "quoted"',
        url: 'https://example.com',
        pageType: 'Home',
        description: 'Line one\nLine two',
        metaKeywords: '',
        canonicalUrl: '',
        h1: '',
        h2: '',
        robots: '',
        annotationStatus: 'none',
        annotationTags: ['launch', 'sales'],
        annotationNote: '',
        childCount: 0,
      },
    ], metadata);

    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('"Home, ""quoted"""');
    expect(csv).toContain('"Line one Line two"');
    expect(csv).not.toContain('Source URL');
    expect(csv).not.toContain('"https://vellic.io"');
  });

  test('adds metadata and complete map data to JSON exports', () => {
    const root = { id: 'root', title: 'Home', children: [] };
    const orphans = [{ id: 'orphan', title: 'Orphan', children: [] }];
    const rows = buildSitemapExportRows(root, orphans);
    const metadata = buildExportMetadata({ title: 'JSON Test', pageCount: rows.length });

    const payload = buildSitemapJsonPayload({
      root,
      orphans,
      connections: [{ from: 'root', to: 'orphan' }],
      colors: ['#fff'],
      connectionColors: { crossLinks: '#000' },
      rows,
      metadata,
    });

    expect(payload.metadata.generatedBy).toBe('Vellic');
    expect(payload.pages).toHaveLength(2);
    expect(payload.root).toBe(root);
    expect(payload.orphans).toBe(orphans);
    expect(payload.connections).toHaveLength(1);
  });

  test('builds standard XML with only real page URLs in loc values', () => {
    const metadata = buildExportMetadata({
      title: 'XML Test',
      generatedAt: new Date('2026-06-22T12:00:00.000Z'),
      pageCount: 1,
    });
    const xml = buildSitemapXml([
      {
        number: '0',
        section: 'main',
        depth: 0,
        title: 'Home',
        pageType: 'Home',
        url: 'https://example.com/a?x=1&y=2',
      },
    ], metadata);

    expect(xml).toContain('<!-- Sitemap by Vellic.io | Generated 2026-06-22T12:00:00.000Z -->');
    expect(xml).not.toContain('https://vellic.io');
    expect(xml).not.toContain('vellic-page:');
    expect(xml).toContain('<loc>https://example.com/a?x=1&amp;y=2</loc>');
  });

  test('builds formatted HTML site index with page links but plain Vellic branding', () => {
    const rows = buildSitemapExportRows({
      id: 'root',
      title: 'Home & Launch',
      url: 'https://example.com',
      children: [
        {
          id: 'about',
          title: 'About',
          url: 'https://example.com/about?x=1&y=2',
          children: [],
        },
      ],
    });
    const metadata = buildExportMetadata({
      title: 'Index Test',
      generatedAt: new Date('2026-06-22T12:00:00.000Z'),
      pageCount: rows.length,
      format: 'site-index-html',
    });

    const html = buildSiteIndexHtml({
      rows,
      metadata,
      rootUrl: 'https://example.com',
      hostname: 'example.com',
    });

    expect(html).toContain('<title>Site Index - Index Test</title>');
    expect(html).toContain('Home &amp; Launch');
    expect(html).toContain('<nav aria-label="Site index">');
    expect(html).toContain('<ul>');
    expect(html).toContain('<a href="https://example.com/about?x=1&amp;y=2">About</a>');
    expect(html).toContain('Sitemap by Vellic.io');
    expect(html).not.toContain('href="https://vellic.io"');
    expect(html).not.toContain('<table>');
  });

  test('builds CommonMark Markdown site index with nested link rows', () => {
    const metadata = buildExportMetadata({
      title: 'Markdown Index',
      generatedAt: new Date('2026-06-22T12:00:00.000Z'),
      pageCount: 1,
      format: 'site-index-md',
    });
    const markdown = buildSiteIndexMarkdown({
      rows: [
        {
          number: '1',
          depth: 1,
          title: 'About | Team',
          url: 'https://example.com/about/team',
          pageType: 'Page',
        },
      ],
      metadata,
      rootUrl: 'https://example.com',
      hostname: 'example.com',
    });

    expect(markdown).toContain('# Site Index');
    expect(markdown).toContain('  - 1 [About | Team](https://example.com/about/team) - Page');
    expect(markdown).not.toContain('| # |');
    expect(markdown).not.toContain('<table>');
  });

  test('builds plain text site index with readable hierarchy and URLs', () => {
    const metadata = buildExportMetadata({
      title: 'Text Index',
      generatedAt: new Date('2026-06-22T12:00:00.000Z'),
      pageCount: 1,
      format: 'site-index-txt',
    });
    const text = buildSiteIndexText({
      rows: [
        {
          number: '1.1',
          depth: 1,
          title: 'Team',
          url: 'https://example.com/about/team',
          pageType: 'Page',
        },
      ],
      metadata,
      rootUrl: 'https://example.com',
      hostname: 'example.com',
    });

    expect(text).toContain('Site Index');
    expect(text).toContain('1.1   Team (Page)');
    expect(text).toContain('  https://example.com/about/team');
    expect(text).not.toContain('<html>');
  });

  test('builds strict TXT sitemap with only URLs', () => {
    const text = buildTxtSitemap([
      { url: 'https://example.com/' },
      { url: 'https://example.com/about' },
      { title: 'No URL' },
    ]);

    expect(text).toBe('https://example.com/\nhttps://example.com/about');
    expect(text.split('\n').every((line) => line.startsWith('https://'))).toBe(true);
  });
});
