/**
 * MAP MAT BACKEND SERVER - PORT 4000
 * Visual sitemap generator with user accounts, projects, and sharing.
 *
 * Run:
 *   cd +Mattper
 *   npm i
 *   node server.js
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Initialize database (creates tables if needed)
require('./db');

// Import routes
const { router: authRouter } = require('./routes/auth');
const apiRouter = require('./routes/api');

const app = express();

// CORS configuration - allow credentials for cookies
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

// Serve static screenshots
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
app.use('/screenshots', express.static(SCREENSHOT_DIR));

// Mount routes
app.use('/auth', authRouter);
app.use('/api', apiRouter);

const PORT = process.env.PORT || 4001;

// Browser instance for screenshots
let browser = null;
const SCREENSHOT_MIN_GAP_MS = 2000;
const screenshotQueue = [];
let screenshotRunning = false;
const lastScreenshotByHost = new Map();

const SCREENSHOT_USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const enqueueScreenshot = async (fn) => {
  return new Promise((resolve, reject) => {
    screenshotQueue.push({ fn, resolve, reject });
    if (!screenshotRunning) {
      screenshotRunning = true;
      (async () => {
        while (screenshotQueue.length) {
          const next = screenshotQueue.shift();
          try {
            const result = await next.fn();
            next.resolve(result);
          } catch (e) {
            next.reject(e);
          }
        }
        screenshotRunning = false;
      })();
    }
  });
};

const isLikelyBlocked = (title, bodyText) => {
  const haystack = `${title}\n${bodyText}`.toLowerCase();
  return haystack.includes('sorry, you have been blocked')
    || haystack.includes('attention required')
    || haystack.includes('access denied')
    || haystack.includes('cf-error-code')
    || haystack.includes('cloudflare ray id');
};

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
  }
  return browser;
}

const DEFAULT_MAX_PAGES = 300;
const DEFAULT_MAX_DEPTH = 6;

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';

    // Remove trailing slash except root
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }

    return u.toString();
  } catch {
    return null;
  }
}

function sameOrigin(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin;
  } catch {
    return false;
  }
}

// Check if URL is same domain or subdomain
function sameDomain(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    // Get root domain (last 2 parts for most TLDs)
    const getRootDomain = (hostname) => {
      const parts = hostname.split('.');
      // Handle common TLDs like .co.uk, .com.au etc
      if (parts.length > 2 && parts[parts.length - 2].length <= 3) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    };
    return getRootDomain(ua.hostname) === getRootDomain(ub.hostname);
  } catch {
    return false;
  }
}

function getParentUrl(urlStr) {
  const u = new URL(urlStr);
  if (u.pathname === '/' || u.pathname === '') return null;

  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return u.origin + '/';

  const parentPath = '/' + parts.slice(0, -1).join('/');
  return u.origin + parentPath;
}

function safeIdFromUrl(urlStr) {
  // Stable ID so React keys don't randomly change between scans.
  // Use full base64 encoding (not sliced) to ensure unique IDs for each URL
  return (
    'n_' +
    Buffer.from(urlStr)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
  );
}

function extractTitle(html, fallbackUrl) {
  try {
    const $ = cheerio.load(html);
    const t = ($('title').first().text() || '').trim();
    if (t) return t;

    const h1 = ($('h1').first().text() || '').trim();
    if (h1) return h1;

    const u = new URL(fallbackUrl);
    if (u.pathname === '/' || u.pathname === '') return u.hostname;
    return decodeURIComponent(u.pathname.split('/').filter(Boolean).slice(-1)[0]).replace(/[-_]/g, ' ');
  } catch {
    return fallbackUrl;
  }
}

function extractThumbnailUrl(html, baseUrl) {
  try {
    const $ = cheerio.load(html);
    const candidates = [
      $('meta[property="og:image"]').attr('content'),
      $('meta[name="og:image"]').attr('content'),
      $('meta[property="twitter:image"]').attr('content'),
      $('meta[name="twitter:image"]').attr('content'),
      $('meta[property="twitter:image:src"]').attr('content'),
      $('meta[name="twitter:image:src"]').attr('content'),
      $('meta[itemprop="image"]').attr('content'),
      $('link[rel="image_src"]').attr('href'),
    ].filter(Boolean);

    let candidate = candidates.find(Boolean);
    if (!candidate) {
      candidate = $('img[src]').first().attr('src')
        || $('img[data-src]').first().attr('data-src');
    }
    if (!candidate) return null;
    if (candidate.startsWith('data:')) return null;

    if (/favicon|apple-touch-icon|icon/i.test(candidate)) return null;
    if (/\.(svg|ico)$/i.test(candidate)) return null;

    const abs = new URL(candidate, baseUrl).toString();
    return abs;
  } catch {
    return null;
  }
}

async function fetchPage(url, extraHeaders = {}) {
  const res = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MapMatBot/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...extraHeaders,
    },
    validateStatus: () => true,
  });
  return { html: res.data, status: res.status, contentType: res.headers['content-type'] };
}

function isHtmlContentType(contentType) {
  if (!contentType) return true;
  return contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
}

async function checkLinkStatus(url, extraHeaders = {}) {
  try {
    const headRes = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MapMatBot/1.0)',
        ...extraHeaders,
      },
      validateStatus: () => true,
    });
    if (headRes.status !== 405) {
      return { status: headRes.status };
    }
  } catch {
    // fall through to GET
  }

  try {
    const getRes = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MapMatBot/1.0)',
        Accept: '*/*',
        ...extraHeaders,
      },
      validateStatus: () => true,
    });
    return { status: getRes.status };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();

  // Extract from anchor tags
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href) return;

    // Ignore mailto/tel/javascript
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return;

    try {
      const abs = new URL(href, baseUrl).toString();
      const norm = normalizeUrl(abs);
      if (norm) links.add(norm);
    } catch {
      // ignore
    }
  });

  // Extract from link tags (stylesheets might link to pages)
  $('link[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    const rel = ($(el).attr('rel') || '').toLowerCase();
    // Only check canonical and alternate links for pages
    if (!['canonical', 'alternate'].includes(rel)) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      const norm = normalizeUrl(abs);
      if (norm) links.add(norm);
    } catch {
      // ignore
    }
  });

  // Extract URLs from data attributes that might contain links
  $('[data-href], [data-url], [data-link]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('data-href') || $el.attr('data-url') || $el.attr('data-link');
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      const norm = normalizeUrl(abs);
      if (norm) links.add(norm);
    } catch {
      // ignore
    }
  });

  return Array.from(links);
}

function normalizeScanOptions(options = {}) {
  return {
    thumbnails: Boolean(options.thumbnails),
    inactivePages: Boolean(options.inactivePages),
    subdomains: Boolean(options.subdomains),
    authenticatedPages: Boolean(options.authenticatedPages),
    orphanPages: Boolean(options.orphanPages),
    errorPages: Boolean(options.errorPages),
    brokenLinks: Boolean(options.brokenLinks),
    files: Boolean(options.files),
    crosslinks: Boolean(options.crosslinks),
  };
}

async function crawlSite(startUrl, maxPages, maxDepth, options = {}, onProgress = null) {
  const scanOptions = normalizeScanOptions(options);
  const seed = normalizeUrl(startUrl);
  if (!seed) throw new Error('Invalid URL');

  const origin = new URL(seed).origin;
  const allowSubdomains = scanOptions.subdomains;
  const allowUrl = (candidate) => (
    allowSubdomains ? sameDomain(candidate, origin) : sameOrigin(candidate, origin)
  );

  const visited = new Set();
  const queue = [{ url: seed, depth: 0 }];

  // Common page paths to try (often not linked from main pages)
  const commonPaths = [
    '/about', '/about-us', '/contact', '/contact-us',
    '/privacy', '/privacy-policy', '/terms', '/terms-of-service', '/terms-and-conditions',
    '/legal', '/disclaimer', '/cookie-policy', '/cookies',
    '/login', '/signin', '/sign-in', '/register', '/signup', '/sign-up',
    '/blog', '/news', '/press', '/media',
    '/faq', '/faqs', '/help', '/support',
    '/careers', '/jobs', '/team', '/our-team',
    '/services', '/products', '/features', '/pricing',
    '/sitemap', '/site-map',
  ];

  // Add common pages to queue
  for (const path of commonPaths) {
    const commonUrl = normalizeUrl(`${origin}${path}`);
    if (commonUrl) {
      queue.push({ url: commonUrl, depth: 1 });
    }
  }

  // Try to fetch and parse sitemap.xml for additional URLs
  try {
    const sitemapUrl = `${origin}/sitemap.xml`;
    const sitemapRes = await axios.get(sitemapUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'MapMatBot/1.0' },
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const $ = cheerio.load(sitemapRes.data, { xmlMode: true });
    $('url > loc').each((_, el) => {
      const loc = $(el).text().trim();
      const norm = normalizeUrl(loc);
      if (norm && sameOrigin(norm, origin)) {
        queue.push({ url: norm, depth: 1 });
      }
    });
    // Also check for sitemap index
    $('sitemap > loc').each((_, el) => {
      const loc = $(el).text().trim();
      // We could fetch these sub-sitemaps too, but skip for now to keep it simple
    });
  } catch {
    // Sitemap not available, continue without it
  }

  // Try sitemap_index.xml and sitemap-index.xml as alternatives
  for (const altSitemap of ['/sitemap_index.xml', '/sitemap-index.xml', '/sitemap.txt']) {
    try {
      const sitemapUrl = `${origin}${altSitemap}`;
      const sitemapRes = await axios.get(sitemapUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'MapMatBot/1.0' },
        validateStatus: (s) => s >= 200 && s < 400,
      });
      if (altSitemap.endsWith('.txt')) {
        // Plain text sitemap - one URL per line
        const urls = sitemapRes.data.split('\n').map(u => u.trim()).filter(Boolean);
        for (const u of urls) {
          const norm = normalizeUrl(u);
          if (norm && sameOrigin(norm, origin)) {
            queue.push({ url: norm, depth: 1 });
          }
        }
      } else {
        const $ = cheerio.load(sitemapRes.data, { xmlMode: true });
        $('url > loc, sitemap > loc').each((_, el) => {
          const loc = $(el).text().trim();
          const norm = normalizeUrl(loc);
          if (norm && sameOrigin(norm, origin)) {
            queue.push({ url: norm, depth: 1 });
          }
        });
      }
    } catch {
      // Not available, continue
    }
  }

  // url -> { url, title, parentUrl }
  const pageMap = new Map();
  const errors = [];
  const inactivePages = [];
  const brokenLinks = [];
  const files = [];
  const linksByUrl = new Map();
  const linkStatusCache = new Map();
  const MAX_BROKEN_LINK_CHECKS = 500;
  let brokenChecks = 0;
  const extraHeaders = {};

  while (queue.length && visited.size < maxPages) {
    const { url, depth } = queue.shift();

    if (visited.has(url)) continue;
    visited.add(url);

    // Send progress update
    if (onProgress) {
      onProgress({ scanned: visited.size, queued: queue.length });
    }

    if (depth > maxDepth) continue;
    if (!allowUrl(url)) continue;

    let html;
    let status = 0;
    let contentType = '';
    try {
      const res = await fetchPage(url, extraHeaders);
      html = res.html;
      status = res.status;
      contentType = res.contentType;
    } catch (e) {
    // Still store node with fallback title so tree doesn't break
    if (scanOptions.brokenLinks) brokenLinks.push({ url, reason: 'fetch_failed' });
    if (scanOptions.inactivePages) inactivePages.push({ url, status: 0, reason: 'fetch_failed' });
      if (!pageMap.has(url)) {
        pageMap.set(url, {
          url,
          title: new URL(url).pathname === '/' ? new URL(url).hostname : url,
          parentUrl: getParentUrl(url),
        });
      }
      continue;
    }

    if (status >= 400) {
      const isAuthStatus = status === 401 || status === 403;
      const isInactiveStatus = status >= 400;
      const shouldKeep = scanOptions.errorPages
        || (scanOptions.authenticatedPages && isAuthStatus)
        || (scanOptions.inactivePages && isInactiveStatus);
      if (scanOptions.errorPages || (scanOptions.authenticatedPages && isAuthStatus)) {
        errors.push({ url, status, authRequired: isAuthStatus });
      }
      if (scanOptions.inactivePages && isInactiveStatus) {
        inactivePages.push({ url, status });
      }
      if (scanOptions.brokenLinks) {
        brokenLinks.push({ url, status });
      }
      if (!shouldKeep) {
        continue;
      }
    }

    if (!isHtmlContentType(contentType)) {
      if (scanOptions.files) {
        files.push({ url, sourceUrl: getParentUrl(url) || null, contentType });
      }
      continue;
    }

    const title = extractTitle(html, url);
    const parentUrl = getParentUrl(url);
    const isAuthPage = status === 401 || status === 403;
    const thumbnailUrl = (scanOptions.thumbnails && !isAuthPage) ? extractThumbnailUrl(html, url) : null;

    pageMap.set(url, {
      url,
      title,
      parentUrl,
      authRequired: status === 401 || status === 403,
      thumbnailUrl: thumbnailUrl || undefined,
    });

    const links = extractLinks(html, url);
    const allowedLinks = links.filter((link) => allowUrl(link));
    linksByUrl.set(url, allowedLinks);

    for (const link of links) {
      if (!allowUrl(link)) continue;

      if (scanOptions.brokenLinks && brokenChecks < MAX_BROKEN_LINK_CHECKS && !linkStatusCache.has(link)) {
        brokenChecks += 1;
        const statusResult = await checkLinkStatus(link, extraHeaders);
        linkStatusCache.set(link, statusResult.status);
        if (statusResult.status >= 400 || statusResult.status === 0) {
          brokenLinks.push({
            url: link,
            status: statusResult.status || undefined,
            sourceUrl: url,
          });
        }
      }

      // Skip obvious assets
      if (/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|mp4|mov|mp3|wav)$/i.test(link)) {
        if (scanOptions.files) files.push({ url: link, sourceUrl: url });
        continue;
      }

      const d = depth + 1;
      if (d > maxDepth) continue;
      if (visited.has(link)) continue;

      queue.push({ url: link, depth: d });
    }
  }

  // Ensure the root exists
  if (!pageMap.has(seed)) {
    pageMap.set(seed, { url: seed, title: new URL(seed).hostname, parentUrl: null });
  }

  // Build nodes
  const nodes = new Map();
  for (const [url, meta] of pageMap.entries()) {
    nodes.set(url, {
      id: safeIdFromUrl(url),
      url,
      title: meta.title || url,
      parentUrl: meta.parentUrl,
      authRequired: meta.authRequired || false,
      thumbnailUrl: meta.thumbnailUrl || undefined,
      children: [],
    });
  }

  // Link children using parentUrl chain, falling back to root when parent missing
  const rootUrl = seed;
  const rootHost = new URL(rootUrl).hostname;
  const orphanNodes = [];
  const subdomainNodes = [];
  for (const node of nodes.values()) {
    if (node.url === rootUrl) continue;

    const parentUrl = node.parentUrl;

    if (parentUrl && nodes.has(parentUrl)) {
      nodes.get(parentUrl).children.push(node);
    } else {
      const nodeHost = new URL(node.url).hostname;
      const isSubdomainRoot = scanOptions.subdomains && nodeHost !== rootHost;
      if (isSubdomainRoot) {
        subdomainNodes.push(node);
      } else if (scanOptions.orphanPages) {
        orphanNodes.push(node);
      } else {
        // If parent missing, attach to root
        nodes.get(rootUrl).children.push(node);
      }
    }
  }

  // Sort children by URL path so output is stable
  function sortTree(n) {
    n.children.sort((a, b) => a.url.localeCompare(b.url));
    n.children.forEach(sortTree);
  }

  const root = nodes.get(rootUrl);
  sortTree(root);

  let crosslinks = [];
  if (scanOptions.crosslinks) {
    const edgeSet = new Set();
    for (const [sourceUrl, targets] of linksByUrl.entries()) {
      if (!nodes.has(sourceUrl)) continue;
      targets.forEach((targetUrl) => {
        if (!nodes.has(targetUrl)) return;
        const sourceNode = nodes.get(sourceUrl);
        const targetNode = nodes.get(targetUrl);
        if (sourceNode.parentUrl === targetUrl || targetNode.parentUrl === sourceUrl) return;
        const key = `${sourceNode.id}->${targetNode.id}`;
        if (!edgeSet.has(key)) edgeSet.add(key);
      });
    }
    crosslinks = Array.from(edgeSet).map((key) => {
      const [sourceId, targetId] = key.split('->');
      return { sourceId, targetId };
    });
  }

  return {
    root,
    orphans: scanOptions.orphanPages ? orphanNodes : [],
    subdomains: scanOptions.subdomains ? subdomainNodes : [],
    errors: scanOptions.errorPages ? errors : [],
    inactivePages: scanOptions.inactivePages ? inactivePages : [],
    brokenLinks: scanOptions.brokenLinks ? brokenLinks : [],
    files: scanOptions.files ? files : [],
    crosslinks,
  };
}

app.get('/', (_, res) => res.status(200).send('Loxo backend OK'));
app.get('/health', (_, res) => res.json({ ok: true }));

app.post('/scan', async (req, res) => {
  const { url, maxPages, maxDepth, options } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const result = await crawlSite(
      url,
      Number.isFinite(maxPages) ? maxPages : DEFAULT_MAX_PAGES,
      Number.isFinite(maxDepth) ? maxDepth : DEFAULT_MAX_DEPTH,
      options || {}
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Scan failed' });
  }
});

// SSE endpoint for scan with progress updates
app.get('/scan-stream', async (req, res) => {
  const { url, maxPages, maxDepth, options } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.flushHeaders();

  // Handle client disconnect
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  const sendEvent = (event, data) => {
    if (aborted) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let parsedOptions = {};
    try {
      parsedOptions = options ? JSON.parse(options) : {};
    } catch {
      parsedOptions = {};
    }

    const result = await crawlSite(
      url,
      Number.isFinite(Number(maxPages)) ? Number(maxPages) : DEFAULT_MAX_PAGES,
      Number.isFinite(Number(maxDepth)) ? Number(maxDepth) : DEFAULT_MAX_DEPTH,
      parsedOptions,
      (progress) => sendEvent('progress', progress)
    );

    sendEvent('complete', result);
    res.end();
  } catch (e) {
    sendEvent('error', { error: e.message || 'Scan failed' });
    res.end();
  }
});

// Screenshot endpoint - captures full-page screenshot
// Note: Playwright requires browser binaries which may not be available on all hosts
app.get('/screenshot', async (req, res) => {
  const { url, type = 'full' } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  // Check if we're in production without Playwright support
  if (process.env.DISABLE_SCREENSHOTS === 'true') {
    return res.status(503).json({
      error: 'Screenshots not available',
      reason: 'Feature disabled in this environment'
    });
  }

  try {
    // Create a unique filename based on URL hash
    const urlHash = crypto.createHash('sha256').update(url).digest('hex');
    const filename = `${urlHash}_${type}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);

    // Check if screenshot already exists and is recent (less than 1 hour old)
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < 3600000) { // 1 hour
        const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
          : `http://localhost:${PORT}`;
        return res.json({
          url: `${baseUrl}/screenshots/${filename}`,
          cached: true
        });
      }
    }

    const host = new URL(url).hostname;
    const now = Date.now();
    const last = lastScreenshotByHost.get(host) || 0;
    const waitMs = Math.max(0, SCREENSHOT_MIN_GAP_MS - (now - last));

    const shotResult = await enqueueScreenshot(async () => {
      if (waitMs > 0) await sleep(waitMs);
      lastScreenshotByHost.set(host, Date.now());

      const b = await getBrowser();
      const page = await b.newPage();
      const ua = SCREENSHOT_USER_AGENTS[Math.floor(Math.random() * SCREENSHOT_USER_AGENTS.length)];

      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        DNT: '1',
      });
      await page.setUserAgent(ua);
      await page.setViewportSize({
        width: 1240 + Math.floor(Math.random() * 120),
        height: 720 + Math.floor(Math.random() * 120),
      });

      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await page.waitForTimeout(1200);

          const title = await page.title();
          const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) || '');
          const blocked = isLikelyBlocked(title, bodyText);

          if (type === 'full') {
            await page.screenshot({
              path: filepath,
              fullPage: true,
              type: 'png'
            });
          } else {
            await page.screenshot({
              path: filepath,
              fullPage: false,
              type: 'png'
            });
          }

          await page.close();
          if (blocked) {
            return { blocked: true };
          }
          return { blocked: false };
        } catch (err) {
          lastError = err;
          await page.waitForTimeout(800 + Math.floor(Math.random() * 400));
        }
      }

      await page.close();
      throw lastError || new Error('Screenshot failed');
    });

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;
    res.json({
      url: `${baseUrl}/screenshots/${filename}`,
      cached: false,
      blocked: shotResult?.blocked || false
    });
  } catch (e) {
    console.error('Screenshot error:', e.message);
    // Return a short, user-friendly error
    const shortError = e.message?.includes('Executable')
      ? 'Screenshots not available in this environment'
      : 'Screenshot failed';
    res.status(500).json({ error: shortError });
  }
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit();
});

app.listen(PORT, () => {
  console.log(`Map Mat Backend running on http://localhost:${PORT}`);
});
