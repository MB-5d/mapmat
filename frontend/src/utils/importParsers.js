export const generateId = () => `import_${Math.random().toString(36).slice(2, 10)}`;

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

const uniqueUrls = (urls = []) => [...new Set(urls.filter((url) => isHttpUrl(url)))];

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
    title: String(row.title || '').trim() || 'Untitled',
    url: String(row.url || '').trim(),
    children: [],
  };

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

const mapStructuredRow = (row = {}, index = 0) => ({
  id: getFirstValue(row, ID_COLUMN_KEYS),
  parent: getFirstValue(row, PARENT_COLUMN_KEYS),
  number: getFirstValue(row, NUMBER_COLUMN_KEYS),
  section: getFirstValue(row, ['section']),
  depth: getFirstValue(row, DEPTH_COLUMN_KEYS),
  title: getFirstValue(row, TITLE_COLUMN_KEYS) || getFirstValue(row, URL_COLUMN_KEYS) || `Page ${index + 1}`,
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

  const hasHierarchicalNumbers = urlRows.some((row) => {
    const number = String(row.number || '').trim().toLowerCase();
    return number === '0' || number.includes('.') || number.startsWith('s');
  });

  if (hasHierarchicalNumbers) {
    const result = buildImportResultFromRows(
      urlRows.filter((row) => row.number),
      parseType,
    );
    if (result) return result;
  }

  const parentResult = buildImportResultFromParentRows(urlRows, parseType);
  if (parentResult) return parentResult;

  if (urlRows.some((row) => Number.parseInt(row.depth, 10) > 0)) {
    return buildImportResultFromDepthRows(urlRows, parseType);
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
    root: parsed.root,
    orphans: Array.isArray(parsed.orphans) ? parsed.orphans : [],
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
    const parsed = new URL(String(href || '').trim(), baseUrl || fallbackBase);
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
    const link = directLink || item.querySelector('a[href]');
    const url = resolveHttpHref(link?.getAttribute('href'), baseUrl);
    if (!url) return null;

    const ownText = getListItemOwnText(item);
    const number = findDirectChild(item, (child) => child.classList?.contains('num'))?.textContent?.trim()
      || ownText.match(/^((?:s)?\d+(?:\.\d+)*)\s/i)?.[1]
      || '';
    const pageType = findDirectChild(item, (child) => child.classList?.contains('type'))?.textContent?.trim()
      || ownText.match(/\(([^)]+)\)\s*$/)?.[1]
      || 'Page';

    return {
      number,
      depth: getListItemDepth(item),
      title: link.textContent?.trim() || ownText.replace(url, '').trim() || url,
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
    if (!isHttpUrl(urlMatch)) return null;

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
      url: urlMatch,
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

export const parseImportFileContent = (text, ext = '') => {
  const normalizedExt = String(ext || '').toLowerCase();
  let result = null;
  let urls = [];
  let parseType = 'Text';

  if (normalizedExt === 'json') {
    result = parseVellicJson(text);
    if (result) return result;
  }

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
    result = parseStructuredHtml(text);
    if (result) return result;
    urls = parseHtml(text);
    parseType = 'HTML';
  } else if (normalizedExt === 'csv') {
    result = parseStructuredCsv(text);
    if (result) return result;
    urls = parseCsv(text);
    parseType = 'CSV';
  } else if (normalizedExt === 'md' || normalizedExt === 'markdown') {
    result = parseStructuredMarkdown(text);
    if (result) return result;
    urls = parseMarkdown(text);
    parseType = 'Markdown';
  } else {
    result = parseStructuredTextIndex(text);
    if (result) return result;
    urls = parsePlainText(text);
  }

  const tree = buildTreeFromUrls(urls);
  return tree
    ? {
      parseType,
      count: urls.length,
      root: tree,
      orphans: [],
      connections: [],
      colors: null,
      connectionColors: null,
    }
    : { parseType, count: 0, root: null, orphans: [], connections: [], colors: null, connectionColors: null };
};

export const buildTreeFromUrls = (urls) => {
  if (!urls.length) return null;

  // Group URLs by domain
  const byDomain = {};
  for (const url of urls) {
    try {
      const u = new URL(url);
      const domain = u.hostname;
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(url);
    } catch {
      // Skip invalid URLs
    }
  }

  const domains = Object.keys(byDomain);

  // If only one domain, build hierarchical tree
  if (domains.length === 1) {
    const domain = domains[0];
    const domainUrls = byDomain[domain];

    // Find the root URL (shortest path or homepage)
    const sorted = [...domainUrls].sort((a, b) => {
      const pathA = new URL(a).pathname;
      const pathB = new URL(b).pathname;
      return pathA.length - pathB.length;
    });

    const rootUrl = sorted[0];
    const root = {
      id: generateId(),
      title: domain,
      url: rootUrl,
      children: []
    };

    // Build tree based on URL paths
    const urlMap = new Map();
    urlMap.set(rootUrl, root);

    for (const url of sorted.slice(1)) {
      try {
        const u = new URL(url);
        const pathParts = u.pathname.split('/').filter(Boolean);
        const title = pathParts[pathParts.length - 1] || u.pathname || 'Page';

        const node = {
          id: generateId(),
          title: decodeURIComponent(title).replace(/[-_]/g, ' '),
          url: url,
          children: []
        };

        // Find parent by matching path
        let parent = root;
        let parentPath = '';
        for (let i = 0; i < pathParts.length - 1; i++) {
          parentPath += '/' + pathParts[i];
          const parentUrl = `${u.origin}${parentPath}`;
          if (urlMap.has(parentUrl)) {
            parent = urlMap.get(parentUrl);
          }
        }

        parent.children.push(node);
        urlMap.set(url, node);
      } catch {
        // Skip invalid URLs
      }
    }

    return root;
  }

  // Multiple domains: create a root with domain children
  const root = {
    id: generateId(),
    title: 'Imported Sites',
    url: urls[0],
    children: []
  };

  for (const domain of domains) {
    const domainUrls = byDomain[domain];
    const domainNode = {
      id: generateId(),
      title: domain,
      url: domainUrls[0],
      children: domainUrls.slice(1).map(url => ({
        id: generateId(),
        title: new URL(url).pathname || 'Page',
        url: url,
        children: []
      }))
    };
    root.children.push(domainNode);
  }

  return root;
};
