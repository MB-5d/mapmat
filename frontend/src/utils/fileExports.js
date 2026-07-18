import { getSeoValue } from './seoMetadata';
import { isVirtualMissingNode } from './scanStatus';
import { isRenderableTextUrl } from './url';
import { isPageNode } from './treeUtils';

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
    if (isPageNode(node)) {
      rows.push({
        id: node.id || '',
        number: node.importNumber || number,
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
        childCount: Array.isArray(node.children) ? node.children.filter(isPageNode).length : 0,
      });
    }

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
  ['generatedAt', 'Generated At'],
];

export const buildSitemapCsv = (rows = [], metadata = buildExportMetadata()) => {
  const header = CSV_COLUMNS.map(([, label]) => escapeCsvValue(label)).join(',');
  const body = rows.map((row) => CSV_COLUMNS.map(([key]) => {
    if (key === 'annotationTags') return escapeCsvValue((row.annotationTags || []).join('; '));
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
    .filter((row) => row?.url);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- ${escapeXmlComment(metadata.tagline)} | Generated ${escapeXmlComment(metadata.generatedAt)} -->`,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((row) => `  <url><loc>${escapeXml(row.url)}</loc></url>`),
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

const getExportRowDepth = (row = {}) => Math.max(0, Number(row.depth) || 0);

const getRowListDepth = (row = {}, index = 0) => {
  const section = normalizeExportText(row.section).toLowerCase();
  if (index === 0 && row.number === '0') return 0;
  if (section === 'orphan' || section === 'subdomain') return 0;
  return getExportRowDepth(row);
};

const buildNestedRowItems = (rows = []) => {
  const rootItems = [];
  const stack = [];

  rows.forEach((row, index) => {
    const rawDepth = Math.min(getRowListDepth(row, index), 12);
    const depth = Math.min(rawDepth, stack.length);
    const item = { row, children: [] };
    if (depth > 0 && stack[depth - 1]) {
      stack[depth - 1].children.push(item);
    } else {
      rootItems.push(item);
    }
    stack[depth] = item;
    stack.length = depth + 1;
  });

  return rootItems;
};

const renderHtmlListItemContent = (row) => {
  const title = normalizeExportText(row.title) || normalizeExportText(row.url) || 'Untitled';
  const safeTitle = escapeHtml(title);
  const safeUrl = escapeHtml(row.url);
  const safeNumber = escapeHtml(row.number);
  const safeType = escapeHtml(row.pageType || 'Page');
  const label = safeUrl ? `<a href="${safeUrl}">${safeTitle}</a>` : safeTitle;
  return `<span class="num">${safeNumber}</span> ${label} <span class="type">${safeType}</span>`;
};

const renderHtmlNestedList = (items = [], depth = 0) => {
  const indent = '  '.repeat(depth);
  return [
    `${indent}<ul>`,
    ...items.map((item) => {
      const childList = item.children.length
        ? `\n${renderHtmlNestedList(item.children, depth + 2)}\n${indent}  `
        : '';
      return `${indent}  <li>${renderHtmlListItemContent(item.row)}${childList}</li>`;
    }),
    `${indent}</ul>`,
  ].join('\n');
};

const formatMarkdownListTitle = (row = {}) => {
  const title = normalizeExportText(row.title) || normalizeExportText(row.url) || 'Untitled';
  const escapedTitle = title
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
  const url = normalizeExportText(row.url).replace(/\)/g, '%29');
  const pageType = normalizeExportText(row.pageType) || 'Page';
  return url ? `[${escapedTitle}](${url}) - ${pageType}` : `${escapedTitle} - ${pageType}`;
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
    nav ul { list-style: none; margin: 0 0 0 22px; padding: 0; }
    nav > ul { margin-left: 0; }
    li { margin: 8px 0; line-height: 1.45; }
    a { color: #4f46e5; overflow-wrap: anywhere; }
    .num, .type { color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Site Index</h1>
  <p class="subtitle">${escapeHtml(metadata.title)} - ${escapeHtml(normalizeIndexHostname(hostname))}</p>
  <p class="meta">Root URL: ${escapeHtml(rootUrl)}<br>Total Pages: ${rows.length}<br>Generated: ${escapeHtml(metadata.generatedAt)}</p>
  <p class="brand">${escapeHtml(metadata.tagline)}</p>

  <nav aria-label="Site index">
${renderHtmlNestedList(buildNestedRowItems(rows))}
  </nav>
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
  ...rows.map((row, index) => (
    `${'  '.repeat(Math.min(getRowListDepth(row, index), 12))}- ${escapeMarkdownTableValue(row.number)} ${formatMarkdownListTitle(row)}`
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

export const buildTxtSitemap = (rows = []) => rows
  .map((row) => normalizeExportText(row?.url))
  .filter(Boolean)
  .join('\n');
