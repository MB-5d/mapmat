export const generateId = () => `import_${Math.random().toString(36).slice(2, 10)}`;

const VELLIC_SOURCE_URL = 'https://vellic.io';
const VELLIC_XML_ROW_PREFIX = 'vellic-page:';

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

const uniqueUrls = (urls = []) => [...new Set(urls.filter((url) => (
  isHttpUrl(url) && String(url).trim().toLowerCase() !== VELLIC_SOURCE_URL
)))];

const normalizeHeader = (value) => String(value || '')
  .trim()
  .toLowerCase()
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

export const parseVellicCsv = (text) => {
  const rows = parseCsvTable(text).map((row) => ({
    number: row.pagenumber,
    section: row.section,
    depth: row.depthlevel,
    title: row.pagetitle,
    url: row.url,
    pageType: row.pagetype,
    description: row.description,
    metaKeywords: row.metakeywords,
    canonicalUrl: row.canonicalurl,
    h1: row.h1,
    h2: row.h2,
    robots: row.metarobots,
    annotationStatus: row.annotationstatus,
    annotationTags: row.annotationtags,
    annotationNote: row.annotationnote,
  })).filter((row) => row.number && row.url);

  if (!rows.length) return null;
  return buildImportResultFromRows(rows, 'Vellic CSV');
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

export const parseVellicXml = (text) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) return null;

  const rows = [];
  let pendingRow = null;
  const walk = doc.createTreeWalker(doc, 128 | 1);

  while (walk.nextNode()) {
    const node = walk.currentNode;
    if (node.nodeType === Node.COMMENT_NODE) {
      const comment = String(node.nodeValue || '').trim();
      if (comment.startsWith(VELLIC_XML_ROW_PREFIX)) {
        try {
          pendingRow = JSON.parse(decodeURIComponent(comment.slice(VELLIC_XML_ROW_PREFIX.length)));
        } catch {
          pendingRow = null;
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE && node.localName === 'url') {
      const loc = Array.from(node.childNodes).find((child) => (
        child.nodeType === Node.ELEMENT_NODE && child.localName === 'loc'
      ));
      const url = loc?.textContent?.trim() || '';
      if (pendingRow && isHttpUrl(url)) {
        rows.push({ ...pendingRow, url });
      }
      pendingRow = null;
    }
  }

  return rows.length ? buildImportResultFromRows(rows, 'Vellic XML') : null;
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

export const parseCsv = (text) => {
  const urls = [];

  for (const row of splitCsvRows(text)) {
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

export const parseVellicMarkdown = (text) => {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|\s*-+/.test(line))
    .map(splitMarkdownTableLine)
    .filter((cells) => cells.length >= 4 && cells[0] !== '#')
    .map(([number, title, pageType, url]) => {
      const indentMatch = title.match(/^\s*/);
      return {
        number,
        depth: Math.floor((indentMatch?.[0]?.length || 0) / 2),
        title: title.trim(),
        pageType,
        url,
      };
    })
    .filter((row) => row.number && isHttpUrl(row.url));

  return rows.length ? buildImportResultFromRows(rows, 'Vellic Markdown') : null;
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

export const parseVellicText = (text) => {
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

  return rows.length ? buildImportResultFromRows(rows, 'Vellic text') : null;
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
    result = parseVellicXml(text);
    if (result) return result;
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
    urls = parseHtml(text);
    parseType = 'HTML';
  } else if (normalizedExt === 'csv') {
    result = parseVellicCsv(text);
    if (result) return result;
    urls = parseCsv(text);
    parseType = 'CSV';
  } else if (normalizedExt === 'md' || normalizedExt === 'markdown') {
    result = parseVellicMarkdown(text);
    if (result) return result;
    urls = parseMarkdown(text);
    parseType = 'Markdown';
  } else {
    result = parseVellicText(text);
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
