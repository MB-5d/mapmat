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

const PORT = process.env.PORT || 4000;

// Browser instance for screenshots
let browser = null;

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

async function fetchPage(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MapMatBot/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return res.data;
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

async function crawlSite(startUrl, maxPages, maxDepth, onProgress = null) {
  const seed = normalizeUrl(startUrl);
  if (!seed) throw new Error('Invalid URL');

  const origin = new URL(seed).origin;

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

  while (queue.length && visited.size < maxPages) {
    const { url, depth } = queue.shift();

    if (visited.has(url)) continue;
    visited.add(url);

    // Send progress update
    if (onProgress) {
      onProgress({ scanned: visited.size, queued: queue.length });
    }

    if (depth > maxDepth) continue;
    if (!sameOrigin(url, origin)) continue;

    let html;
    try {
      html = await fetchPage(url);
    } catch (e) {
      // Still store node with fallback title so tree doesn't break
      if (!pageMap.has(url)) {
        pageMap.set(url, {
          url,
          title: new URL(url).pathname === '/' ? new URL(url).hostname : url,
          parentUrl: getParentUrl(url),
        });
      }
      continue;
    }

    const title = extractTitle(html, url);
    const parentUrl = getParentUrl(url);

    pageMap.set(url, { url, title, parentUrl });

    const links = extractLinks(html, url);

    for (const link of links) {
      if (!sameOrigin(link, origin)) continue;

      // Skip obvious assets
      if (/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|mp4|mov|mp3|wav)$/i.test(link)) continue;

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
      children: [],
    });
  }

  // Link children using parentUrl chain, falling back to root when parent missing
  const rootUrl = seed;
  for (const node of nodes.values()) {
    if (node.url === rootUrl) continue;

    const parentUrl = node.parentUrl;

    if (parentUrl && nodes.has(parentUrl)) {
      nodes.get(parentUrl).children.push(node);
    } else {
      // If parent missing, attach to root
      nodes.get(rootUrl).children.push(node);
    }
  }

  // Sort children by URL path so output is stable
  function sortTree(n) {
    n.children.sort((a, b) => a.url.localeCompare(b.url));
    n.children.forEach(sortTree);
  }

  const root = nodes.get(rootUrl);
  sortTree(root);

  return root;
}

app.get('/', (_, res) => res.status(200).send('Loxo backend OK'));
app.get('/health', (_, res) => res.json({ ok: true }));

app.post('/scan', async (req, res) => {
  const { url, maxPages, maxDepth } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const tree = await crawlSite(
      url,
      Number.isFinite(maxPages) ? maxPages : DEFAULT_MAX_PAGES,
      Number.isFinite(maxDepth) ? maxDepth : DEFAULT_MAX_DEPTH
    );
    res.json({ root: tree });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Scan failed' });
  }
});

// SSE endpoint for scan with progress updates
app.get('/scan-stream', async (req, res) => {
  const { url, maxPages, maxDepth } = req.query;
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
    const tree = await crawlSite(
      url,
      Number.isFinite(Number(maxPages)) ? Number(maxPages) : DEFAULT_MAX_PAGES,
      Number.isFinite(Number(maxDepth)) ? Number(maxDepth) : DEFAULT_MAX_DEPTH,
      (progress) => sendEvent('progress', progress)
    );

    sendEvent('complete', { root: tree });
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
    const urlHash = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
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

    const b = await getBrowser();
    const page = await b.newPage();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait a bit for any lazy-loaded content
    await page.waitForTimeout(1000);

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

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;
    res.json({
      url: `${baseUrl}/screenshots/${filename}`,
      cached: false
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