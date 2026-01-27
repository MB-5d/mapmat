export const generateId = () => `import_${Math.random().toString(36).slice(2, 10)}`;

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
    return [...new Set(urls)];
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

  return [...new Set(urls)];
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

  return [...new Set(urls)];
};

export const parseHtml = (text, baseUrl = '') => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const urls = [];

  doc.querySelectorAll('a[href]').forEach(a => {
    let href = a.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
      try {
        // Try to resolve relative URLs
        if (baseUrl && !href.startsWith('http')) {
          href = new URL(href, baseUrl).href;
        }
        if (href.startsWith('http')) {
          urls.push(href);
        }
      } catch {
        // Skip invalid URLs
      }
    }
  });

  return [...new Set(urls)];
};

export const parseCsv = (text) => {
  const urls = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Split by common delimiters
    const parts = line.split(/[,;\t]+/);
    for (const part of parts) {
      const trimmed = part.trim().replace(/^["']|["']$/g, '');
      if (trimmed.match(/^https?:\/\//i)) {
        urls.push(trimmed);
      }
    }
  }

  return urls;
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

  return [...new Set(urls)];
};

export const parsePlainText = (text) => {
  const urls = [];
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    urls.push(match[0]);
  }
  return [...new Set(urls)];
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
