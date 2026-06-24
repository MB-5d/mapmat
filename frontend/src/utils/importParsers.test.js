import {
  buildExportMetadata,
  buildSiteIndexMarkdown,
  buildSiteIndexText,
  buildSitemapCsv,
  buildSitemapExportRows,
  buildSitemapJsonPayload,
  buildSitemapXml,
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
        children: [],
      },
      orphans: [{ id: 'orphan', title: 'Orphan', url: 'https://example.com/orphan', children: [] }],
      connections: [{ id: 'c1', from: 'root', to: 'orphan' }],
      colors: ['#ffffff'],
      connectionColors: { crossLinks: '#111111' },
      rows: [{ number: '0', url: 'https://example.com' }],
      metadata: buildExportMetadata({ title: 'JSON Round Trip', pageCount: 1 }),
    });

    const result = parseImportFileContent(JSON.stringify(payload), 'json');

    expect(result.parseType).toBe('Vellic JSON');
    expect(result.root.id).toBe('root');
    expect(result.orphans[0].id).toBe('orphan');
    expect(result.connections).toEqual([{ id: 'c1', from: 'root', to: 'orphan' }]);
    expect(result.colors).toEqual(['#ffffff']);
    expect(result.connectionColors).toEqual({ crossLinks: '#111111' });
  });

  test('restores Vellic CSV hierarchy instead of rebuilding from URL paths', () => {
    const rows = buildSampleRows();
    const csv = buildSitemapCsv(rows, buildExportMetadata({ title: 'CSV Round Trip', pageCount: rows.length }));

    const result = parseImportFileContent(csv, 'csv');

    expect(result.parseType).toBe('Vellic CSV');
    expectSampleStructure(result);
    expect(parseCsv(csv)).not.toContain('https://vellic.io');
  });

  test('restores Vellic Markdown site index hierarchy', () => {
    const rows = buildSampleRows();
    const markdown = buildSiteIndexMarkdown({
      rows,
      metadata: buildExportMetadata({ title: 'Markdown Round Trip', pageCount: rows.length }),
      rootUrl: 'https://example.com',
      hostname: 'example.com',
    });

    const result = parseImportFileContent(markdown, 'md');

    expect(result.parseType).toBe('Vellic Markdown');
    expectSampleStructure(result);
  });

  test('restores Vellic text site index hierarchy', () => {
    const rows = buildSampleRows();
    const text = buildSiteIndexText({
      rows,
      metadata: buildExportMetadata({ title: 'Text Round Trip', pageCount: rows.length }),
      rootUrl: 'https://example.com',
      hostname: 'example.com',
    });

    const result = parseImportFileContent(text, 'txt');

    expect(result.parseType).toBe('Vellic text');
    expectSampleStructure(result);
  });

  test('restores Vellic XML hierarchy from safe sitemap comments', () => {
    const rows = buildSampleRows();
    const xml = buildSitemapXml(rows, buildExportMetadata({ title: 'XML Round Trip', pageCount: rows.length }));

    const result = parseImportFileContent(xml, 'xml');

    expect(result.parseType).toBe('Vellic XML');
    expectSampleStructure(result);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://example.com/about/team</loc>');
  });

  test('does not import Vellic branding URLs from generic CSV metadata', () => {
    const csv = [
      '"URL","Source URL"',
      '"https://example.com","https://vellic.io"',
    ].join('\n');

    const result = parseImportFileContent(csv, 'csv');

    expect(result.root.url).toBe('https://example.com');
    expect(result.root.children).toEqual([]);
  });
});
