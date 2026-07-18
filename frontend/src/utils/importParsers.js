export const generateId = () => `import_${Math.random().toString(36).slice(2, 10)}`;

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

export const IMPORT_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_MODES = Object.freeze({
  PROVIDED: 'provided',
  URL_HIERARCHY: 'url-hierarchy',
  EXACT: 'exact',
});
export const IMPORT_NODE_KINDS = Object.freeze({
  PAGE: 'page',
  GHOST: 'import-ghost',
  SOURCE_GROUP: 'source-group',
  CONTAINER: 'import-container',
});

const uniqueUrls = (urls = []) => [...new Set(urls.filter((url) => isHttpUrl(url)))];
const IMPORTED_IMAGE_STATE_FIELDS = [
  'thumbnailUrl',
  'thumbnailFullUrl',
  'fullScreenshotUrl',
  'fullScreenshotTruncated',
  'authRequired',
  'thumbnailCaptureFailed',
  'thumbnailCaptureError',
  'thumbnailCaptureFailedAt',
];

const normalizeHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^#$/, 'number')
  .replace(/[^a-z0-9]+/g, '');

const splitCsvRows = (text) => {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
  return rows;
};

const parseCsvTable = (text) => {
  const rows = splitCsvRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) => headers.reduce((result, header, index) => ({
    ...result,
    [header]: String(row[index] ?? '').trim(),
  }), {}));
};

const normalizeExportSection = (row = {}) => {
  const section = String(row.section || '').trim().toLowerCase();
  const number = String(row.number || '').trim().toLowerCase();
  if (section) return section;
  if (number.startsWith('s')) return 'subdomain';
  if (number.startsWith('0.')) return 'orphan';
  return 'main';
};

const rowToNode = (row = {}) => {
  const pageType = String(row.pageType || '').trim();
  const annotationTags = Array.isArray(row.annotationTags)
    ? row.annotationTags
    : String(row.annotationTags || '')
      .split(';')
      .map((tag) => tag.trim())
      .filter(Boolean);

  const node = {
    id: generateId(),
    title: String(row.title || '').trim() || getUrlTitle(row.url),
    url: String(row.url || '').trim(),
    children: [],
    nodeKind: isHttpUrl(row.url) ? IMPORT_NODE_KINDS.PAGE : IMPORT_NODE_KINDS.SOURCE_GROUP,
  };

  if (row.number) node.importNumber = String(row.number).trim();

  if (pageType) node.pageType = pageType;
  if (row.description) node.seoDescription = row.description;
  if (row.metaKeywords) node.seoKeywords = row.metaKeywords;
  if (row.canonicalUrl) node.canonicalUrl = row.canonicalUrl;
  if (row.h1) node.h1 = row.h1;
  if (row.h2) node.h2 = row.h2;
  if (row.robots) node.robots = row.robots;
  if (row.thumbnailUrl) node.thumbnailUrl = row.thumbnailUrl;
  if (row.thumbnailFullUrl) node.thumbnailFullUrl = row.thumbnailFullUrl;
  if (row.fullScreenshotUrl) node.fullScreenshotUrl = row.fullScreenshotUrl;
  if (row.annotationStatus || annotationTags.length || row.annotationNote) {
    node.annotations = {
      status: row.annotationStatus || 'none',
      tags: annotationTags,
      note: row.annotationNote || '',
    };
  }

  const section = normalizeExportSection(row);
  if (section === 'orphan' && pageType) {
    node.orphanType = pageType.toLowerCase();
  }

  return node;
};

export const stripImportedImageState = (node) => {
  if (!node || typeof node !== 'object') return node;
  const next = { ...node };
  IMPORTED_IMAGE_STATE_FIELDS.forEach((field) => {
    delete next[field];
  });
  if (Array.isArray(node.children)) {
    next.children = node.children.map(stripImportedImageState);
  }
  return next;
};

const getParentNumber = (number, section) => {
  const normalized = String(number || '').trim();
  if (!normalized) return '';
  if (section === 'subdomain' && /^s\d+$/i.test(normalized)) return '';
  if (section === 'orphan' && /^0\.\d+$/i.test(normalized)) return '';
  if (section === 'main' && normalized === '0') return '';
  if (section === 'main' && !normalized.includes('.')) return '0';
  const lastDot = normalized.lastIndexOf('.');
  return lastDot > 0 ? normalized.slice(0, lastDot) : '';
};

export const buildTreeFromExportRows = (rows = []) => {
  const normalizedRows = rows
    .map((row) => ({
      ...row,
      number: String(row.number || '').trim(),
      section: normalizeExportSection(row),
      depth: Number.parseInt(row.depth, 10) || 0,
      url: String(row.url || '').trim(),
      title: String(row.title || '').trim(),
    }))
    .filter((row) => row.number && (row.url || row.title));

  if (!normalizedRows.length) return null;

  const nodeByNumber = new Map();
  let root = null;
  const orphans = [];

  normalizedRows.forEach((row) => {
    nodeByNumber.set(row.number, rowToNode(row));
  });

  normalizedRows.forEach((row) => {
    const node = nodeByNumber.get(row.number);
    const parentNumber = getParentNumber(row.number, row.section);
    const parent = parentNumber ? nodeByNumber.get(parentNumber) : null;

    if (parent) {
      parent.children.push(node);
      return;
    }

    if (row.section === 'main' && !root) {
      root = node;
    } else {
      if (row.section === 'subdomain') node.subdomainRoot = true;
      orphans.push(node);
    }
  });

  if (!root && orphans.length) {
    root = orphans.shift();
  }

  return root ? { root, orphans } : null;
};

const buildImportResultFromRows = (rows, parseType) => {
  const tree = buildTreeFromExportRows(rows);
  if (!tree?.root) return null;
  return {
    parseType,
    count: rows.length,
    root: tree.root,
    orphans: tree.orphans,
    connections: [],
    colors: null,
    connectionColors: null,
  };
};

const buildTreeFromDepthRows = (rows = []) => {
  const normalizedRows = rows
    .map((row) => ({
      ...row,
      depth: Math.max(0, Number.parseInt(row.depth, 10) || 0),
      title: String(row.title || '').trim(),
      url: String(row.url || '').trim(),
      pageType: String(row.pageType || 'Page').trim() || 'Page',
    }))
    .filter((row) => row.url || row.title);

  if (!normalizedRows.length) return null;

  let root = null;
  const orphans = [];
  const stack = [];

  normalizedRows.forEach((row) => {
    const depth = Math.min(row.depth, stack.length);
    const node = rowToNode(row);
    const parent = depth > 0 ? stack[depth - 1] : null;

    if (parent) {
      parent.children.push(node);
    } else if (!root) {
      root = node;
    } else {
      orphans.push(node);
    }

    stack[depth] = node;
    stack.length = depth + 1;
  });

  return root ? { root, orphans } : null;
};

const buildImportResultFromDepthRows = (rows, parseType) => {
  const tree = buildTreeFromDepthRows(rows);
  if (!tree?.root) return null;
  return {
    parseType,
    count: rows.length,
    root: tree.root,
    orphans: tree.orphans,
    connections: [],
    colors: null,
    connectionColors: null,
  };
};

const normalizeLookupValue = (value) => String(value || '').trim().toLowerCase();

const getFirstValue = (row = {}, keys = []) => {
  for (const key of keys) {
    const value = row[key];
    if (String(value || '').trim()) return String(value).trim();
  }
  return '';
};

const URL_COLUMN_KEYS = ['url', 'pageurl', 'loc', 'location', 'link', 'href', 'address', 'canonicalurl'];
const TITLE_COLUMN_KEYS = ['pagetitle', 'title', 'name', 'label', 'page', 'text'];
const NUMBER_COLUMN_KEYS = ['pagenumber', 'number', 'num', 'order', 'position', 'index'];
const DEPTH_COLUMN_KEYS = ['depthlevel', 'depth', 'level'];
const TYPE_COLUMN_KEYS = ['pagetype', 'type', 'kind'];
const ID_COLUMN_KEYS = ['id', 'pageid', 'key'];
const PARENT_COLUMN_KEYS = ['parent', 'parentid', 'parentkey', 'parenturl', 'parentpage', 'parenttitle', 'parentnumber'];

const mapStructuredRow = (row = {}) => ({
  id: getFirstValue(row, ID_COLUMN_KEYS),
  parent: getFirstValue(row, PARENT_COLUMN_KEYS),
  number: getFirstValue(row, NUMBER_COLUMN_KEYS),
  section: getFirstValue(row, ['section']),
  depth: getFirstValue(row, DEPTH_COLUMN_KEYS),
  title: getFirstValue(row, TITLE_COLUMN_KEYS),
  url: getFirstValue(row, URL_COLUMN_KEYS),
  pageType: getFirstValue(row, TYPE_COLUMN_KEYS) || 'Page',
  description: getFirstValue(row, ['description', 'metadescription']),
  metaKeywords: getFirstValue(row, ['metakeywords', 'keywords']),
  canonicalUrl: getFirstValue(row, ['canonicalurl']),
  h1: getFirstValue(row, ['h1']),
  h2: getFirstValue(row, ['h2']),
  robots: getFirstValue(row, ['metarobots', 'robots']),
  annotationStatus: getFirstValue(row, ['annotationstatus', 'status']),
  annotationTags: getFirstValue(row, ['annotationtags', 'tags']),
  annotationNote: getFirstValue(row, ['annotationnote', 'note']),
});

const buildTreeFromParentRows = (rows = []) => {
  const normalizedRows = rows
    .map((row, index) => ({
      ...row,
      id: normalizeLookupValue(row.id) || normalizeLookupValue(row.url) || normalizeLookupValue(row.title) || String(index),
      parent: normalizeLookupValue(row.parent),
      url: String(row.url || '').trim(),
      title: String(row.title || '').trim(),
    }))
    .filter((row) => row.url || row.title);

  if (!normalizedRows.some((row) => row.parent)) return null;

  const nodeByKey = new Map();
  normalizedRows.forEach((row) => {
    nodeByKey.set(row.id, rowToNode(row));
    if (row.url) nodeByKey.set(normalizeLookupValue(row.url), nodeByKey.get(row.id));
    if (row.title) nodeByKey.set(normalizeLookupValue(row.title), nodeByKey.get(row.id));
    if (row.number) nodeByKey.set(normalizeLookupValue(row.number), nodeByKey.get(row.id));
  });

  let root = null;
  const orphans = [];
  normalizedRows.forEach((row) => {
    const node = nodeByKey.get(row.id);
    const parent = row.parent ? nodeByKey.get(row.parent) : null;
    if (parent && parent !== node) {
      parent.children.push(node);
    } else if (!root) {
      root = node;
    } else {
      orphans.push(node);
    }
  });

  return root ? { root, orphans } : null;
};

const buildImportResultFromParentRows = (rows, parseType) => {
  const tree = buildTreeFromParentRows(rows);
  if (!tree?.root) return null;
  return {
    parseType,
    count: rows.length,
    root: tree.root,
    orphans: tree.orphans,
    connections: [],
    colors: null,
    connectionColors: null,
  };
};

const buildImportResultFromStructuredRows = (rows, parseType) => {
  const urlRows = rows.filter((row) => isHttpUrl(row.url));
  if (!urlRows.length) return null;

  const structuralRows = rows.filter((row) => row.url || row.title);

  const hasHierarchicalNumbers = urlRows.some((row) => {
    const number = String(row.number || '').trim().toLowerCase();
    return number === '0' || number.includes('.') || number.startsWith('s');
  });

  if (hasHierarchicalNumbers) {
    const result = buildImportResultFromRows(
      structuralRows.filter((row) => row.number),
      parseType,
    );
    if (result) return result;
  }

  const parentResult = buildImportResultFromParentRows(structuralRows, parseType);
  if (parentResult) return parentResult;

  if (urlRows.some((row) => Number.parseInt(row.depth, 10) > 0)) {
    return buildImportResultFromDepthRows(structuralRows, parseType);
  }

  return null;
};

export const parseVellicJson = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed?.root || parsed.exportType !== 'vellic-sitemap') return null;

  return {
    parseType: 'Vellic JSON',
    count: Array.isArray(parsed.pages) ? parsed.pages.length : 1,
    root: stripImportedImageState(parsed.root),
    orphans: Array.isArray(parsed.orphans) ? parsed.orphans.map(stripImportedImageState) : [],
    connections: Array.isArray(parsed.connections) ? parsed.connections : [],
    colors: Array.isArray(parsed.colors) ? parsed.colors : null,
    connectionColors: parsed.connectionColors && typeof parsed.connectionColors === 'object'
      ? parsed.connectionColors
      : null,
  };
};

export const parseStructuredCsv = (text) => {
  const rows = parseCsvTable(text)
    .map(mapStructuredRow)
    .filter((row) => row.url || row.title);

  return buildImportResultFromStructuredRows(rows, 'CSV sitemap');
};

export const parseXmlSitemap = (text) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const urls = [];

  // Check for parse errors - if XML is invalid, fall back to regex
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('XML parse error, using regex fallback');
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      urls.push(match[0]);
    }
    return uniqueUrls(urls);
  }

  // Use getElementsByTagName which ignores namespaces
  const locElements = doc.getElementsByTagName('loc');

  for (let i = 0; i < locElements.length; i++) {
    const url = locElements[i].textContent?.trim();
    if (url) {
      urls.push(url);
    }
  }

  // If no loc elements, try to find any URLs in the text
  if (urls.length === 0) {
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      urls.push(match[0]);
    }
  }

  return uniqueUrls(urls);
};

export const parseRssAtom = (text) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const urls = [];

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('XML parse error:', parseError.textContent);
    return urls;
  }

  // RSS format - use getElementsByTagName for namespace compatibility
  const items = doc.getElementsByTagName('item');
  for (let i = 0; i < items.length; i++) {
    const link = items[i].getElementsByTagName('link')[0];
    if (link?.textContent?.trim()) {
      urls.push(link.textContent.trim());
    }
  }

  // Atom format
  const entries = doc.getElementsByTagName('entry');
  for (let i = 0; i < entries.length; i++) {
    const links = entries[i].getElementsByTagName('link');
    for (let j = 0; j < links.length; j++) {
      const href = links[j].getAttribute('href');
      if (href && href.startsWith('http')) {
        urls.push(href);
      }
    }
  }

  // Also check for channel link in RSS
  const channelLinks = doc.getElementsByTagName('link');
  for (let i = 0; i < channelLinks.length; i++) {
    const url = channelLinks[i].textContent?.trim();
    if (url && url.startsWith('http') && !urls.includes(url)) {
      urls.push(url);
    }
  }

  return uniqueUrls(urls);
};

export const parseHtml = (text, baseUrl = '') => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const urls = [];
  const fallbackBase = 'https://example.invalid';

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href')?.trim();
    if (!href || href.startsWith('#')) return;
    if (!baseUrl && !/^https?:\/\//i.test(href)) return;

    try {
      // Resolve relative URLs, then only keep http(s) links.
      const parsed = new URL(href, baseUrl || fallbackBase);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        urls.push(parsed.href);
      }
    } catch {
      // Skip invalid URLs
    }
  });

  return uniqueUrls(urls);
};

const resolveHttpHref = (href, baseUrl = '') => {
  const fallbackBase = 'https://example.invalid';
  try {
    const raw = String(href || '').trim();
    if (!baseUrl && !/^https?:\/\//i.test(raw)) return '';
    const parsed = new URL(raw, baseUrl || fallbackBase);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
  } catch {
    return '';
  }
};

const findDirectChild = (element, predicate) => (
  Array.from(element?.children || []).find(predicate) || null
);

const getListItemDepth = (element) => {
  let depth = 0;
  let parent = element?.parentElement;
  while (parent) {
    if (parent.tagName?.toLowerCase() === 'li') depth += 1;
    parent = parent.parentElement;
  }
  return depth;
};

const getListItemOwnText = (element) => {
  const clone = element.cloneNode(true);
  clone.querySelectorAll('ul, ol').forEach((node) => node.remove());
  return String(clone.textContent || '').replace(/\s+/g, ' ').trim();
};

const parseHtmlListRows = (doc, baseUrl = '') => Array.from(doc.querySelectorAll('li'))
  .map((item, index) => {
    const directLink = findDirectChild(item, (child) => (
      child.tagName?.toLowerCase() === 'a' && child.getAttribute('href')
    ));
    const link = directLink;
    const url = resolveHttpHref(link?.getAttribute('href'), baseUrl);

    const ownText = getListItemOwnText(item);
    if (!url && !ownText) return null;
    const number = findDirectChild(item, (child) => child.classList?.contains('num'))?.textContent?.trim()
      || ownText.match(/^((?:s)?\d+(?:\.\d+)*)\s/i)?.[1]
      || '';
    const pageType = findDirectChild(item, (child) => child.classList?.contains('type'))?.textContent?.trim()
      || ownText.match(/\(([^)]+)\)\s*$/)?.[1]
      || 'Page';

    return {
      number,
      depth: getListItemDepth(item),
      title: link?.textContent?.trim() || ownText.replace(url, '').trim() || url,
      url,
      pageType,
    };
  })
  .filter(Boolean);

const parseHtmlTableRows = (doc) => {
  const rows = [];

  doc.querySelectorAll('table').forEach((table) => {
    const tableRows = Array.from(table.querySelectorAll('tr'));
    if (tableRows.length < 2) return;
    const headerCells = Array.from(tableRows[0].querySelectorAll('th, td'));
    const headers = headerCells.map((cell) => normalizeHeader(cell.textContent));
    if (!headers.some((header) => URL_COLUMN_KEYS.includes(header))) return;

    tableRows.slice(1).forEach((row, index) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const rowObject = headers.reduce((result, header, cellIndex) => ({
        ...result,
        [header]: cells[cellIndex]?.textContent?.trim() || '',
      }), {});
      const link = row.querySelector('a[href]');
      if (link?.getAttribute('href')) {
        rowObject.url = link.getAttribute('href').trim();
      }
      rows.push(mapStructuredRow(rowObject, index));
    });
  });

  return rows;
};

export const parseStructuredHtml = (text, baseUrl = '') => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  const listResult = buildImportResultFromStructuredRows(
    parseHtmlListRows(doc, baseUrl),
    'HTML sitemap',
  );
  if (listResult) return listResult;

  const tableResult = buildImportResultFromStructuredRows(
    parseHtmlTableRows(doc),
    'HTML sitemap',
  );
  if (tableResult) return tableResult;

  return null;
};

export const parseCsv = (text) => {
  const urls = [];
  const rows = splitCsvRows(text);
  const headers = rows[0]?.map(normalizeHeader) || [];
  const urlIndexes = headers
    .map((header, index) => (URL_COLUMN_KEYS.includes(header) ? index : -1))
    .filter((index) => index >= 0);

  if (urlIndexes.length) {
    rows.slice(1).forEach((row) => {
      urlIndexes.forEach((index) => {
        const trimmed = String(row[index] || '').trim().replace(/^["']|["']$/g, '');
        if (isHttpUrl(trimmed)) urls.push(trimmed);
      });
    });
    return uniqueUrls(urls);
  }

  for (const row of rows) {
    for (const part of row) {
      const trimmed = String(part || '').trim().replace(/^["']|["']$/g, '');
      if (isHttpUrl(trimmed)) {
        urls.push(trimmed);
      }
    }
  }

  return uniqueUrls(urls);
};

export const parseMarkdown = (text) => {
  const urls = [];

  // Markdown links: [text](url)
  const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdLinkRegex.exec(text)) !== null) {
    if (match[2].match(/^https?:\/\//i)) {
      urls.push(match[2]);
    }
  }

  // Plain URLs
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[0]);
  }

  return uniqueUrls(urls);
};

const splitMarkdownTableLine = (line) => {
  const cells = [];
  let value = '';
  let escaped = false;
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');

  for (const char of trimmed) {
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '|') {
      cells.push(value.trim());
      value = '';
      continue;
    }
    value += char;
  }

  cells.push(value.trim());
  return cells;
};

const unescapeMarkdownText = (value) => String(value || '').replace(/\\([\\[\]|])/g, '$1');

const parseMarkdownTableRows = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|\s*-+/.test(line));

  if (lines.length < 2) return [];

  const headers = splitMarkdownTableLine(lines[0]).map(normalizeHeader);
  if (!headers.some((header) => URL_COLUMN_KEYS.includes(header))) return [];

  return lines.slice(1).map((line, index) => {
    const cells = splitMarkdownTableLine(line);
    const rowObject = headers.reduce((result, header, cellIndex) => ({
      ...result,
      [header]: unescapeMarkdownText(cells[cellIndex] || ''),
    }), {});
    return mapStructuredRow(rowObject, index);
  });
};

const parseMarkdownListRows = (text) => text
  .split(/\r?\n/)
  .map((line) => {
    const match = line.match(/^(\s*)[-*+]\s+(.+?)\s*$/);
    if (!match) return null;

    const indent = match[1].replace(/\t/g, '  ').length;
    const content = match[2].trim();
    const linkMatch = content.match(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/i);
    const urlMatch = linkMatch?.[2] || content.match(/https?:\/\/[^\s<>"')\]]+/i)?.[0] || '';
    const number = content.match(/^((?:s)?\d+(?:\.\d+)*)[.)]?\s+/i)?.[1] || '';
    const typeMatch = content.match(/\s-\s([^-\n]+)\s*$/);
    const title = linkMatch?.[1]
      || content
        .replace(/^((?:s)?\d+(?:\.\d+)*)[.)]?\s+/i, '')
        .replace(urlMatch, '')
        .replace(/\s-\s([^-\n]+)\s*$/, '')
        .trim()
      || urlMatch;

    return {
      number,
      depth: Math.floor(indent / 2),
      title: unescapeMarkdownText(title),
      url: isHttpUrl(urlMatch) ? urlMatch : '',
      pageType: typeMatch?.[1]?.trim() || 'Page',
    };
  })
  .filter(Boolean);

export const parseStructuredMarkdown = (text) => {
  const listResult = buildImportResultFromStructuredRows(
    parseMarkdownListRows(text),
    'Markdown sitemap',
  );
  if (listResult) return listResult;

  return buildImportResultFromStructuredRows(
    parseMarkdownTableRows(text),
    'Markdown sitemap',
  );
};

export const parsePlainText = (text) => {
  const urls = [];
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[0]);
  }
  return uniqueUrls(urls);
};

export const parseStructuredTextIndex = (text) => {
  const lines = text.split(/\r?\n/);
  const rows = [];

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(\S+)\s+(.+?)\s+\(([^)]+)\)\s*$/);
    const nextLine = lines[index + 1] || '';
    const url = nextLine.trim();
    if (!match || !isHttpUrl(url)) continue;

    const title = match[2];
    const indentMatch = title.match(/^\s*/);
    rows.push({
      number: match[1],
      depth: Math.floor((indentMatch?.[0]?.length || 0) / 2),
      title: title.trim(),
      pageType: match[3],
      url,
    });
    index += 1;
  }

  return rows.length ? buildImportResultFromRows(rows, 'Text index') : null;
};

const getTextByteLength = (text) => {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(text || '')).length;
  return String(text || '').length * 2;
};

const cleanUrlCandidate = (value) => String(value || '')
  .trim()
  .replace(/^['"(<[]+/, '')
  .replace(/[>'")\],.;]+$/, '');

export const normalizeImportUrl = (value) => {
  const raw = cleanUrlCandidate(value);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    if (/\/index\.(html?|php|aspx)$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/index\.(html?|php|aspx)$/i, '/');
    }
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./i, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    return {
      url: raw,
      key: `${parsed.hostname}${port}${parsed.pathname || '/'}${parsed.search}`,
      parsed,
    };
  } catch {
    return null;
  }
};

const getUrlTitle = (value) => {
  const normalized = normalizeImportUrl(value);
  if (!normalized) return 'Untitled';
  const parts = normalized.parsed.pathname.split('/').filter(Boolean);
  const rawTitle = parts[parts.length - 1] || normalized.parsed.hostname;
  try {
    return decodeURIComponent(rawTitle).replace(/[-_]+/g, ' ').trim() || normalized.parsed.hostname;
  } catch {
    return rawTitle.replace(/[-_]+/g, ' ').trim() || normalized.parsed.hostname;
  }
};

const flattenPageNodes = (root, orphans = []) => {
  const pages = [];
  const visit = (node) => {
    if (!node) return;
    if (normalizeImportUrl(node.url)) pages.push(node);
    (node.children || []).forEach(visit);
  };
  visit(root);
  (orphans || []).forEach(visit);
  return pages;
};

const dedupePageRecords = (records = []) => {
  const seen = new Set();
  const pages = [];
  let duplicateCount = 0;
  let invalidCount = 0;

  records.forEach((record, index) => {
    const normalized = normalizeImportUrl(record?.url || record);
    if (!normalized) {
      invalidCount += 1;
      return;
    }
    if (seen.has(normalized.key)) {
      duplicateCount += 1;
      return;
    }
    seen.add(normalized.key);
    const source = typeof record === 'object' ? record : {};
    pages.push({
      ...source,
      id: source.id || generateId(),
      title: String(source.title || '').trim() || getUrlTitle(normalized.url),
      url: normalized.url,
      children: [],
      nodeKind: IMPORT_NODE_KINDS.PAGE,
      importNumber: source.importNumber || source.number || '',
      importOrder: index,
      hideImportedPageNumber: !(source.importNumber || source.number),
    });
  });

  return { pages, duplicateCount, invalidCount };
};

const getCsvCandidates = (text) => {
  const rows = splitCsvRows(text);
  if (!rows.length) return { candidates: [], invalidCount: 0, ignoredCount: 0 };
  const headers = rows[0].map(normalizeHeader);
  const urlIndexes = headers
    .map((header, index) => (URL_COLUMN_KEYS.includes(header) ? index : -1))
    .filter((index) => index >= 0);
  if (!urlIndexes.length) {
    return {
      candidates: rows.flat().filter((value) => isHttpUrl(cleanUrlCandidate(value))),
      invalidCount: 0,
      ignoredCount: 0,
    };
  }
  const values = rows.slice(1).flatMap((row) => urlIndexes.map((index) => String(row[index] || '').trim())).filter(Boolean);
  return {
    candidates: values.filter((value) => normalizeImportUrl(value)),
    invalidCount: values.filter((value) => !normalizeImportUrl(value)).length,
    ignoredCount: 1,
  };
};

const getXmlCandidates = (text, feed = false) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) {
    return { candidates: parsePlainText(text), invalidCount: 1, ignoredCount: 0 };
  }
  const values = [];
  if (feed) {
    Array.from(doc.getElementsByTagName('item')).forEach((item) => {
      const value = item.getElementsByTagName('link')[0]?.textContent?.trim();
      if (value) values.push(value);
    });
    Array.from(doc.getElementsByTagName('entry')).forEach((entry) => {
      Array.from(entry.getElementsByTagName('link')).forEach((link) => {
        const value = link.getAttribute('href')?.trim();
        if (value) values.push(value);
      });
    });
  } else {
    Array.from(doc.getElementsByTagName('loc')).forEach((loc) => {
      const value = loc.textContent?.trim();
      if (value) values.push(value);
    });
  }
  return {
    candidates: values.filter((value) => normalizeImportUrl(value)),
    invalidCount: values.filter((value) => !normalizeImportUrl(value)).length,
    ignoredCount: 0,
  };
};

const getTextCandidates = (text) => {
  const lines = String(text || '').split(/\r?\n/);
  const candidates = [];
  let invalidCount = 0;
  let ignoredCount = 0;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^(url|urls|address|location|link)s?\s*[:|,]?$/i.test(trimmed) || /^#/.test(trimmed)) {
      ignoredCount += 1;
      return;
    }
    const matches = trimmed.match(/https?:\/\/[^\s<>"']+/gi) || [];
    if (!matches.length) {
      invalidCount += 1;
      return;
    }
    matches.forEach((match) => candidates.push(cleanUrlCandidate(match)));
  });
  return { candidates, invalidCount, ignoredCount };
};

const getSourceCandidates = (text, ext) => {
  if (ext === 'csv') return getCsvCandidates(text);
  if (ext === 'xml') return getXmlCandidates(text, text.includes('<rss') || text.includes('<feed'));
  if (ext === 'rss' || ext === 'atom') return getXmlCandidates(text, true);
  if (ext === 'html' || ext === 'htm') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const values = Array.from(doc.querySelectorAll('a[href]'))
      .map((link) => link.getAttribute('href')?.trim())
      .filter((value) => /^https?:\/\//i.test(value || ''));
    return {
      candidates: values.filter((value) => normalizeImportUrl(value)),
      invalidCount: values.filter((value) => !normalizeImportUrl(value)).length,
      ignoredCount: 0,
    };
  }
  if (ext === 'md' || ext === 'markdown' || ext === 'json') {
    const values = String(text || '').match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
    return { candidates: values.map(cleanUrlCandidate), invalidCount: 0, ignoredCount: 0 };
  }
  return getTextCandidates(text);
};

const getParsedSource = (text, normalizedExt) => {
  let structuredResult = null;
  let urls = [];
  let records = [];
  let parseType = normalizedExt === 'paste' ? 'Pasted URLs' : 'Text';

  if (normalizedExt === 'xml') {
    if (text.includes('<rss') || text.includes('<feed')) {
      urls = parseRssAtom(text);
      parseType = 'RSS/Atom';
    } else {
      urls = parseXmlSitemap(text);
      parseType = 'XML Sitemap';
    }
  } else if (normalizedExt === 'rss' || normalizedExt === 'atom') {
    urls = parseRssAtom(text);
    parseType = 'RSS/Atom';
  } else if (normalizedExt === 'html' || normalizedExt === 'htm') {
    structuredResult = parseStructuredHtml(text);
    if (structuredResult) {
      records = flattenPageNodes(structuredResult.root, structuredResult.orphans);
    } else {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      records = [...parseHtmlListRows(doc), ...parseHtmlTableRows(doc)].filter((row) => normalizeImportUrl(row.url));
      urls = records.length ? records : parseHtml(text);
    }
    parseType = structuredResult?.parseType || 'HTML';
  } else if (normalizedExt === 'csv') {
    structuredResult = parseStructuredCsv(text);
    records = structuredResult
      ? flattenPageNodes(structuredResult.root, structuredResult.orphans)
      : parseCsvTable(text).map(mapStructuredRow).filter((row) => normalizeImportUrl(row.url));
    urls = records.length ? records : parseCsv(text);
    parseType = structuredResult?.parseType || 'CSV';
  } else if (normalizedExt === 'md' || normalizedExt === 'markdown') {
    structuredResult = parseStructuredMarkdown(text);
    records = structuredResult
      ? flattenPageNodes(structuredResult.root, structuredResult.orphans)
      : [...parseMarkdownListRows(text), ...parseMarkdownTableRows(text)].filter((row) => normalizeImportUrl(row.url));
    urls = records.length ? records : parseMarkdown(text);
    parseType = structuredResult?.parseType || 'Markdown';
  } else {
    structuredResult = normalizedExt === 'paste' ? null : parseStructuredTextIndex(text);
    urls = structuredResult ? flattenPageNodes(structuredResult.root, structuredResult.orphans) : parsePlainText(text);
    parseType = structuredResult?.parseType || parseType;
  }

  return { structuredResult, urls, records, parseType };
};

export const parseImportSource = (text, ext = '') => {
  const sourceText = String(text || '');
  if (getTextByteLength(sourceText) > IMPORT_SOURCE_MAX_BYTES) {
    throw new Error('Import files must be 10 MB or smaller');
  }

  const normalizedExt = String(ext || '').replace(/^\./, '').toLowerCase() || 'txt';
  if (normalizedExt === 'json') {
    const exactResult = parseVellicJson(sourceText);
    if (exactResult) {
      const pageCount = flattenPageNodes(exactResult.root, exactResult.orphans).length;
      return {
        exactBackup: true,
        exactResult,
        parseType: exactResult.parseType,
        sourceFormat: 'json',
        pages: flattenPageNodes(exactResult.root, exactResult.orphans),
        structuredResult: exactResult,
        hasExplicitStructure: true,
        diagnostics: {
          validCount: pageCount,
          duplicateCount: 0,
          invalidCount: 0,
          ignoredCount: 0,
        },
      };
    }
  }

  const parsed = getParsedSource(sourceText, normalizedExt);
  const sourceDiagnostics = getSourceCandidates(sourceText, normalizedExt);
  const sourceRecords = parsed.records?.length
    ? parsed.records
    : (parsed.structuredResult
      ? flattenPageNodes(parsed.structuredResult.root, parsed.structuredResult.orphans)
      : (sourceDiagnostics.candidates.length ? sourceDiagnostics.candidates : parsed.urls));
  const deduped = dedupePageRecords(sourceRecords);

  return {
    exactBackup: false,
    parseType: parsed.parseType,
    sourceFormat: normalizedExt,
    pages: deduped.pages,
    structuredResult: parsed.structuredResult,
    hasExplicitStructure: Boolean(parsed.structuredResult),
    diagnostics: {
      validCount: deduped.pages.length,
      duplicateCount: deduped.duplicateCount,
      invalidCount: parsed.structuredResult && normalizedExt === 'txt'
        ? deduped.invalidCount
        : sourceDiagnostics.invalidCount + deduped.invalidCount,
      ignoredCount: sourceDiagnostics.ignoredCount,
    },
  };
};

const cloneStructuredNode = (node, seen) => {
  if (!node) return null;
  const normalized = normalizeImportUrl(node.url);
  if (normalized && seen.has(normalized.key)) return null;
  if (normalized) seen.add(normalized.key);
  const children = (node.children || []).map((child) => cloneStructuredNode(child, seen)).filter(Boolean);
  if (!normalized && !children.length) return null;
  return {
    ...node,
    id: node.id || generateId(),
    title: String(node.title || '').trim() || (normalized ? getUrlTitle(normalized.url) : 'Section'),
    url: normalized?.url || '',
    nodeKind: normalized ? IMPORT_NODE_KINDS.PAGE : IMPORT_NODE_KINDS.SOURCE_GROUP,
    hideImportedPageNumber: normalized ? !node.importNumber : true,
    children,
  };
};

const createImportContainer = (children, importMode, parseType) => ({
  id: generateId(),
  title: 'Imported URLs',
  url: '',
  nodeKind: IMPORT_NODE_KINDS.CONTAINER,
  children: children.filter(Boolean),
  importMeta: {
    mode: importMode,
    parseType,
    sourceNumberingOnly: true,
  },
});

const makeGhostNode = (title) => ({
  id: generateId(),
  title,
  url: '',
  nodeKind: IMPORT_NODE_KINDS.GHOST,
  hideImportedPageNumber: true,
  children: [],
});

const mergePageIntoNode = (target, page) => {
  const children = target.children || [];
  Object.assign(target, {
    ...page,
    id: target.id,
    children,
    nodeKind: IMPORT_NODE_KINDS.PAGE,
  });
};

const buildUrlHierarchyRoots = (pages = []) => {
  const hostRoots = new Map();

  pages.forEach((page) => {
    const normalized = normalizeImportUrl(page.url);
    if (!normalized) return;
    const hostKey = `${normalized.parsed.hostname}${normalized.parsed.port ? `:${normalized.parsed.port}` : ''}`;
    let hostEntry = hostRoots.get(hostKey);
    if (!hostEntry) {
      const rootNode = makeGhostNode(hostKey);
      hostEntry = { root: rootNode, paths: new Map([['/', rootNode]]) };
      hostRoots.set(hostKey, hostEntry);
    }

    const pathParts = normalized.parsed.pathname.split('/').filter(Boolean);
    if (!pathParts.length) {
      if (!normalized.parsed.search) mergePageIntoNode(hostEntry.root, page);
      else hostEntry.root.children.push({ ...page, id: page.id || generateId(), children: [] });
      return;
    }

    let parent = hostEntry.root;
    let path = '';
    pathParts.forEach((segment, index) => {
      path += `/${segment}`;
      const isLeaf = index === pathParts.length - 1;
      if (isLeaf && normalized.parsed.search) {
        parent.children.push({ ...page, id: page.id || generateId(), children: [] });
        return;
      }
      let node = hostEntry.paths.get(path);
      if (!node) {
        node = makeGhostNode(getUrlTitle(`${normalized.parsed.protocol}//${hostKey}${path}`));
        parent.children.push(node);
        hostEntry.paths.set(path, node);
      }
      if (isLeaf) mergePageIntoNode(node, page);
      parent = node;
    });
  });

  return Array.from(hostRoots.values()).map(({ root }) => root);
};

export const materializeImportedMap = (source, mode = IMPORT_MODES.PROVIDED) => {
  if (!source) return null;
  if (source.exactBackup) return { ...source.exactResult, importMode: IMPORT_MODES.EXACT };
  if (!source.pages?.length) return null;

  let children;
  if (mode === IMPORT_MODES.URL_HIERARCHY) {
    children = buildUrlHierarchyRoots(source.pages);
  } else if (source.hasExplicitStructure && source.structuredResult?.root) {
    const seen = new Set();
    children = [source.structuredResult.root, ...(source.structuredResult.orphans || [])]
      .map((node) => cloneStructuredNode(node, seen))
      .filter(Boolean);
  } else {
    children = source.pages.map((page) => ({ ...page, children: [] }));
  }

  const root = createImportContainer(children, mode, source.parseType);
  return {
    parseType: source.parseType,
    count: source.diagnostics.validCount,
    root,
    orphans: [],
    connections: [],
    colors: null,
    connectionColors: null,
    importMode: mode,
  };
};

export const parseImportFileContent = (text, ext = '', mode = IMPORT_MODES.PROVIDED) => (
  materializeImportedMap(parseImportSource(text, ext), mode)
);

export const buildTreeFromUrls = (urls) => {
  const deduped = dedupePageRecords(urls);
  return createImportContainer(
    buildUrlHierarchyRoots(deduped.pages),
    IMPORT_MODES.URL_HIERARCHY,
    'URLs',
  );
};
