import { getSeoValue } from './seoMetadata';
import { isVirtualMissingNode } from './scanStatus';
import { isRenderableTextUrl } from './url';

export const EXPORT_BRANDING = Object.freeze({
  name: 'Vellic',
  domain: 'Vellic.io',
  url: 'https://vellic.io',
  tagline: 'Sitemap by Vellic.io',
});

export const normalizeExportText = (value) => String(value ?? '')
  .replace(/\s+/g, ' ')
  .trim();

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const pad2 = (value) => String(value).padStart(2, '0');

export const formatExportDateStamp = (value = new Date()) => {
  const date = toDate(value);
  return [
    pad2(date.getDate()),
    pad2(date.getMonth() + 1),
    pad2(date.getFullYear() % 100),
  ].join('-');
};

export const slugifyExportFilenameTitle = (value) => {
  const slug = String(value || '')
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'Untitled-Map';
};

export const getSitemapExportFilenameBase = (title, generatedAt = new Date()) => (
  `${slugifyExportFilenameTitle(title)}_sitemap-by-${EXPORT_BRANDING.domain}_${formatExportDateStamp(generatedAt)}`
);

export const buildExportMetadata = ({
  title = 'Untitled Map',
  generatedAt = new Date(),
  pageCount = 0,
  format = 'sitemap',
} = {}) => {
  const date = toDate(generatedAt);
  return {
    exportType: format,
    exportVersion: 2,
    title: normalizeExportText(title) || 'Untitled Map',
    generatedAt: date.toISOString(),
    generatedBy: EXPORT_BRANDING.name,
    source: EXPORT_BRANDING.domain,
    sourceUrl: EXPORT_BRANDING.url,
    tagline: EXPORT_BRANDING.tagline,
    pageCount,
  };
};

const getExportPageType = (node = {}, fallback = 'Page') => {
  const isRenderableText = isRenderableTextUrl(node.url);
  if (node.pageType && !(isRenderableText && String(node.pageType).toLowerCase() === 'file')) return node.pageType;
  if (node.subdomainRoot) return 'Subdomain';
  if (!isRenderableText && (node.isFile || node.orphanType === 'file')) return 'File';
  if (isVirtualMissingNode(node)) return 'Missing';
  if (node.isDuplicate) return 'Duplicate';
  if (node.isBroken || node.orphanType === 'broken') return 'Broken';
  if (node.orphanType === 'orphan') return 'Orphan';
  return fallback;
};

const getChildNumber = (parentNumber, index) => (
  parentNumber === '0' ? `${index + 1}` : `${parentNumber}.${index + 1}`
);

export const buildSitemapExportRows = (rootNode, orphanNodes = []) => {
  const rows = [];

  const visit = (node, number, depth, section, fallbackType) => {
    if (!node) return;
    const annotations = node.annotations || {};
    rows.push({
      id: node.id || '',
      number,
      depth,
      section,
      title: normalizeExportText(node.title) || 'Untitled',
      url: normalizeExportText(node.url),
      pageType: getExportPageType(node, fallbackType),
      description: normalizeExportText(getSeoValue(node, 'description')),
      metaKeywords: normalizeExportText(getSeoValue(node, 'keywords')),
      canonicalUrl: normalizeExportText(getSeoValue(node, 'canonicalUrl')),
      h1: normalizeExportText(getSeoValue(node, 'h1')),
      h2: normalizeExportText(getSeoValue(node, 'h2')),
      robots: normalizeExportText(getSeoValue(node, 'robots')),
      annotationStatus: annotations.status || 'none',
      annotationTags: Array.isArray(annotations.tags) ? annotations.tags : [],
      annotationNote: normalizeExportText(annotations.note),
      thumbnailUrl: node.thumbnailUrl || '',
      thumbnailFullUrl: node.thumbnailFullUrl || '',
      fullScreenshotUrl: node.fullScreenshotUrl || '',
      childCount: Array.isArray(node.children) ? node.children.length : 0,
    });

    (node.children || []).forEach((child, index) => {
      visit(child, getChildNumber(number, index), depth + 1, section, 'Page');
    });
  };

  if (rootNode) visit(rootNode, '0', 0, 'main', 'Home');

  const allOrphans = Array.isArray(orphanNodes) ? orphanNodes.filter(Boolean) : [];
  const subdomains = allOrphans.filter((node) => node.subdomainRoot);
  const regularOrphans = allOrphans.filter((node) => !node.subdomainRoot);

  subdomains.forEach((orphan, index) => {
    visit(orphan, `s${index + 1}`, 0, 'subdomain', 'Subdomain');
  });

  regularOrphans.forEach((orphan, index) => {
    visit(orphan, `0.${index + 1}`, 0, 'orphan', 'Orphan');
  });

  return rows;
};

const escapeCsvValue = (value) => {
  const normalized = String(value ?? '').replace(/\r\n|\r|\n/g, ' ');
  return `"${normalized.replace(/"/g, '""')}"`;
};

const CSV_COLUMNS = [
  ['number', 'Page Number'],
  ['section', 'Section'],
  ['depth', 'Depth Level'],
  ['title', 'Page Title'],
  ['url', 'URL'],
  ['pageType', 'Page Type'],
  ['description', 'Description'],
  ['metaKeywords', 'Meta Keywords'],
  ['canonicalUrl', 'Canonical URL'],
  ['h1', 'H1'],
  ['h2', 'H2'],
  ['robots', 'Meta Robots'],
  ['annotationStatus', 'Annotation Status'],
  ['annotationTags', 'Annotation Tags'],
  ['annotationNote', 'Annotation Note'],
  ['childCount', 'Child Count'],
  ['generatedBy', 'Generated By'],
  ['sourceUrl', 'Source URL'],
  ['generatedAt', 'Generated At'],
];

export const buildSitemapCsv = (rows = [], metadata = buildExportMetadata()) => {
  const header = CSV_COLUMNS.map(([, label]) => escapeCsvValue(label)).join(',');
  const body = rows.map((row) => CSV_COLUMNS.map(([key]) => {
    if (key === 'annotationTags') return escapeCsvValue((row.annotationTags || []).join('; '));
    if (key === 'generatedBy') return escapeCsvValue(metadata.generatedBy);
    if (key === 'sourceUrl') return escapeCsvValue(metadata.sourceUrl);
    if (key === 'generatedAt') return escapeCsvValue(metadata.generatedAt);
    return escapeCsvValue(row[key]);
  }).join(','));
  return [header, ...body].join('\n');
};

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const escapeXmlComment = (value) => String(value ?? '').replace(/--/g, '- -');

export const buildSitemapXml = (rows = [], metadata = buildExportMetadata()) => {
  const urls = rows
    .map((row) => row.url)
    .filter(Boolean)
    .filter((url, index, allUrls) => allUrls.indexOf(url) === index);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- ${escapeXmlComment(metadata.tagline)} | ${escapeXmlComment(metadata.sourceUrl)} | Generated ${escapeXmlComment(metadata.generatedAt)} -->`,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
  ].join('\n');
};

export const buildSitemapJsonPayload = ({
  root = null,
  orphans = [],
  connections = [],
  colors = [],
  connectionColors = {},
  rows = [],
  metadata = buildExportMetadata(),
} = {}) => ({
  exportType: 'vellic-sitemap',
  version: 2,
  metadata,
  pages: rows,
  root,
  orphans: Array.isArray(orphans) ? orphans : [],
  connections: Array.isArray(connections) ? connections : [],
  colors,
  connectionColors,
});

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeIndexHostname = (value = '') => normalizeExportText(value) || 'sitemap';

const escapeMarkdownTableValue = (value, { preserveSpacing = false } = {}) => (
  preserveSpacing
    ? String(value ?? '').replace(/\r\n|\r|\n/g, ' ')
    : normalizeExportText(value)
)
  .replace(/\\/g, '\\\\')
  .replace(/\|/g, '\\|');

const formatIndexTitle = (row = {}) => {
  const depth = Math.max(0, Number(row.depth) || 0);
  return `${'  '.repeat(Math.min(depth, 8))}${normalizeExportText(row.title) || 'Untitled'}`;
};

const buildIndexHeadingLines = ({ metadata = buildExportMetadata(), rootUrl = '', hostname = '' } = {}) => [
  'Site Index',
  '',
  `${metadata.title} - ${normalizeIndexHostname(hostname)}`,
  `Root URL: ${normalizeExportText(rootUrl)}`,
  `Total Pages: ${metadata.pageCount}`,
  `Generated: ${metadata.generatedAt}`,
  metadata.tagline,
];

export const buildSiteIndexHtml = ({
  rows = [],
  metadata = buildExportMetadata(),
  rootUrl = '',
  hostname = '',
} = {}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Site Index - ${escapeHtml(metadata.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #6366f1; margin-bottom: 5px; }
    .subtitle { color: #64748b; margin-bottom: 30px; }
    .meta { color: #94a3b8; font-size: 12px; margin-bottom: 20px; }
    .brand { color: #64748b; font-size: 12px; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f1f5f9; text-align: left; padding: 10px; font-size: 12px; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .num { color: #94a3b8; font-size: 12px; white-space: nowrap; }
    .title { color: #1e293b; }
    .url { color: #6366f1; font-size: 12px; word-break: break-all; }
    .url a { color: #6366f1; }
    .indent-1 { padding-left: 20px; }
    .indent-2 { padding-left: 40px; }
    .indent-3 { padding-left: 60px; }
    .indent-4 { padding-left: 80px; }
    .indent-5 { padding-left: 100px; }
  </style>
</head>
<body>
  <h1>Site Index</h1>
  <p class="subtitle">${escapeHtml(metadata.title)} - ${escapeHtml(normalizeIndexHostname(hostname))}</p>
  <p class="meta">Root URL: ${escapeHtml(rootUrl)}<br>Total Pages: ${rows.length}<br>Generated: ${escapeHtml(metadata.generatedAt)}</p>
  <p class="brand">${escapeHtml(metadata.tagline)}</p>

  <table>
    <thead>
      <tr>
        <th style="width: 60px;">#</th>
        <th>Page Title</th>
        <th style="width: 110px;">Type</th>
        <th style="width: 40%;">URL</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => {
    const safeUrl = escapeHtml(row.url);
    return `
        <tr>
          <td class="num">${escapeHtml(row.number)}</td>
          <td class="title indent-${Math.min(Number(row.depth) || 0, 5)}">${escapeHtml(row.title)}</td>
          <td>${escapeHtml(row.pageType)}</td>
          <td class="url">${safeUrl ? `<a href="${safeUrl}">${safeUrl}</a>` : ''}</td>
        </tr>
      `;
  }).join('')}
    </tbody>
  </table>
</body>
</html>
`.trim();

export const buildSiteIndexMarkdown = ({
  rows = [],
  metadata = buildExportMetadata(),
  rootUrl = '',
  hostname = '',
} = {}) => [
  '# Site Index',
  '',
  `**${metadata.title} - ${normalizeIndexHostname(hostname)}**`,
  '',
  `Root URL: ${normalizeExportText(rootUrl)}`,
  `Total Pages: ${rows.length}`,
  `Generated: ${metadata.generatedAt}`,
  metadata.tagline,
  '',
  '| # | Page Title | Type | URL |',
  '| --- | --- | --- | --- |',
  ...rows.map((row) => (
    `| ${escapeMarkdownTableValue(row.number)} | ${escapeMarkdownTableValue(formatIndexTitle(row), { preserveSpacing: true })} | ${escapeMarkdownTableValue(row.pageType)} | ${escapeMarkdownTableValue(row.url)} |`
  )),
].join('\n');

export const buildSiteIndexText = ({
  rows = [],
  metadata = buildExportMetadata(),
  rootUrl = '',
  hostname = '',
} = {}) => [
  ...buildIndexHeadingLines({
    metadata: {
      ...metadata,
      pageCount: rows.length,
    },
    rootUrl,
    hostname,
  }),
  '',
  ...rows.flatMap((row) => [
    `${normalizeExportText(row.number)} ${formatIndexTitle(row)} (${normalizeExportText(row.pageType) || 'Page'})`,
    row.url ? `  ${normalizeExportText(row.url)}` : '',
  ]).filter((line) => line !== ''),
].join('\n');
