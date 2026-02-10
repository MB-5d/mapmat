/**
 * MAP MAT BACKEND SERVER - PORT 4002
 * Visual sitemap generator with user accounts, projects, and sharing.
 *
 * Run:
 *   cd mapmat
 *   npm i
 *   node server.js
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
let helmet = null;
try {
  helmet = require('helmet');
} catch {
  // Optional at runtime until dependencies are refreshed.
  helmet = null;
}
const axios = require('axios');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

// Initialize database (creates tables if needed)
const db = require('./db');

// Import routes
const { router: authRouter, authMiddleware, requireAuth } = require('./routes/auth');
const apiRouter = require('./routes/api');

const app = express();
const isProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_PUBLIC_DOMAIN;
const RUN_MODE = process.env.RUN_MODE || 'both'; // 'web' | 'worker' | 'both'
const RUN_WEB = RUN_MODE === 'both' || RUN_MODE === 'web';
const RUN_WORKER = RUN_MODE === 'both' || RUN_MODE === 'worker';
if (process.env.TRUST_PROXY === 'true' || isProd) {
  app.set('trust proxy', 1);
}
app.disable('x-powered-by');

// CORS configuration - allow credentials for cookies
const parseEnvBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '');
const ALLOW_VERCEL_PREVIEWS = parseEnvBool(process.env.ALLOW_VERCEL_PREVIEWS, false);
const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];
const envOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((origin) => normalizeOrigin(origin)).filter(Boolean)
  : [];
const allowedOrigins = envOrigins.length ? envOrigins : defaultOrigins;
const isAllowedVercelPreviewOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};
const isCorsOriginAllowed = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOrigins.includes(normalizedOrigin)) return true;
  return ALLOW_VERCEL_PREVIEWS && isAllowedVercelPreviewOrigin(normalizedOrigin);
};

if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
} else {
  console.warn('[security] {"event":"helmet_unavailable","message":"Install dependencies to enable Helmet"}');
}

app.use(cors({
  origin: (origin, callback) => {
    if (isCorsOriginAllowed(origin)) return callback(null, true);
    logSecurityEvent('cors_blocked_origin', {
      origin: origin || null,
      allowVercelPreviews: ALLOW_VERCEL_PREVIEWS,
    });
    return callback(null, false);
  },
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

const PORT = process.env.PORT || 4002;

// Browser instance for screenshots
let browser = null;
const SCAN_LIMITS = {
  maxPagesDefault: Number(process.env.SCAN_MAX_PAGES_DEFAULT ?? 300),
  maxPagesHard: Number(process.env.SCAN_MAX_PAGES_HARD ?? 1000),
  maxDepthDefault: Number(process.env.SCAN_MAX_DEPTH_DEFAULT ?? 6),
  maxDepthHard: Number(process.env.SCAN_MAX_DEPTH_HARD ?? 10),
};
const SCAN_API_KEY = process.env.SCAN_API_KEY || null;
const ALLOW_PRIVATE_NETWORKS = process.env.ALLOW_PRIVATE_NETWORKS === 'true'
  || (!isProd && process.env.ALLOW_PRIVATE_NETWORKS !== 'false');
const SCAN_RATE_WINDOW_MS = Number(process.env.SCAN_RATE_WINDOW_MS ?? (isProd ? 60000 : 10000));
const SCAN_RATE_LIMIT = Number(process.env.SCAN_RATE_LIMIT ?? (isProd ? 60 : 120));
const SCREENSHOT_RATE_WINDOW_MS = Number(process.env.SCREENSHOT_RATE_WINDOW_MS ?? (isProd ? 60000 : 10000));
const SCREENSHOT_RATE_LIMIT = Number(process.env.SCREENSHOT_RATE_LIMIT ?? (isProd ? 30 : 60));
const SCREENSHOT_QUEUE_MAX = Number(process.env.SCREENSHOT_QUEUE_MAX ?? (isProd ? 25 : 100));
const SCREENSHOT_MIN_GAP_MS = Number(
  process.env.SCREENSHOT_MIN_GAP_MS ?? (isProd ? 2000 : 300)
);
const SCREENSHOT_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.SCREENSHOT_MAX_CONCURRENCY ?? (isProd ? 1 : 4))
);
const screenshotQueue = [];
let screenshotActive = 0;
const lastScreenshotByHost = new Map();

const SCREENSHOT_USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const DISCOVERY_SUBDOMAIN_PREFIXES = [
  'dev',
  'staging',
  'test',
  'beta',
  'qa',
  'old',
  'legacy',
  'v1',
  'archive',
  'admin',
  'internal',
  'portal',
  'api',
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeIp = (ip) => (ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip);

const isPrivateIp = (ip) => {
  const normalized = normalizeIp(ip);
  const version = net.isIP(normalized);
  if (version === 4) {
    const [a, b] = normalized.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (version === 6) {
    const lower = normalized.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7));
    return false;
  }
  return true;
};

const isHostBlocked = (hostname) => {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost'
    || lower.endsWith('.localhost')
    || lower.endsWith('.local')
  );
};

async function assertSafeUrl(rawUrl) {
  let urlObj;
  try {
    urlObj = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error('Invalid URL protocol');
  }

  const hostname = urlObj.hostname;
  if (!ALLOW_PRIVATE_NETWORKS) {
    if (isHostBlocked(hostname)) throw new Error('Blocked host');
    if (net.isIP(hostname)) {
      if (isPrivateIp(hostname)) throw new Error('Blocked host');
    } else {
      let records = [];
      try {
        records = await dns.lookup(hostname, { all: true, verbatim: true });
      } catch {
        throw new Error('Unable to resolve host');
      }
      if (!records.length) throw new Error('Unable to resolve host');
      if (records.some((rec) => isPrivateIp(rec.address))) {
        throw new Error('Blocked host');
      }
    }
  }

  return urlObj.toString();
}

const clampInt = (value, { min, max, fallback }) => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const getClientIp = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return normalizeIp(ip);
};

const logSecurityEvent = (event, details = {}, level = 'warn') => {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...details,
  };
  const line = `[security] ${JSON.stringify(payload)}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.warn(line);
};

const SECURITY_SPIKE_WINDOW_MS = Number(process.env.SECURITY_SPIKE_WINDOW_MS ?? 60000);
const SECURITY_401_SPIKE_THRESHOLD = Number(process.env.SECURITY_401_SPIKE_THRESHOLD ?? (isProd ? 25 : 200));
const SECURITY_429_SPIKE_THRESHOLD = Number(process.env.SECURITY_429_SPIKE_THRESHOLD ?? (isProd ? 20 : 200));
const securitySpikeCounters = new Map();

const monitorStatusSpike = (req, statusCode) => {
  if (statusCode !== 401 && statusCode !== 429) return;
  const threshold = statusCode === 401 ? SECURITY_401_SPIKE_THRESHOLD : SECURITY_429_SPIKE_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold <= 0) return;

  const now = Date.now();
  const windowBucket = Math.floor(now / SECURITY_SPIKE_WINDOW_MS);
  const key = `${statusCode}:${windowBucket}`;
  const nextCount = (securitySpikeCounters.get(key) || 0) + 1;
  securitySpikeCounters.set(key, nextCount);

  if (nextCount === threshold || nextCount % threshold === 0) {
    logSecurityEvent('status_spike', {
      statusCode,
      count: nextCount,
      windowMs: SECURITY_SPIKE_WINDOW_MS,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: getClientIp(req) || 'unknown',
    });
  }

  // Remove old buckets
  if (securitySpikeCounters.size > 64) {
    const minActiveBucket = windowBucket - 2;
    for (const bucketKey of securitySpikeCounters.keys()) {
      const [, bucket] = bucketKey.split(':');
      if (Number(bucket) < minActiveBucket) {
        securitySpikeCounters.delete(bucketKey);
      }
    }
  }
};

app.use((req, res, next) => {
  res.on('finish', () => {
    monitorStatusSpike(req, res.statusCode);
  });
  next();
});

const createRateLimiter = ({ windowMs, max, name = 'default' }) => {
  const hits = new Map();
  let lastSweep = Date.now();

  return (req, res, next) => {
    const now = Date.now();
    const ip = getClientIp(req) || 'unknown';
    const entry = hits.get(ip);

    if (!entry || now - entry.start >= windowMs) {
      hits.set(ip, { start: now, count: 1 });
    } else if (entry.count >= max) {
      logSecurityEvent('rate_limit_blocked', {
        limiter: name,
        ip,
        method: req.method,
        path: req.originalUrl || req.url,
        windowMs,
        max,
      });
      return res.status(429).json({ error: 'Rate limit exceeded' });
    } else {
      entry.count += 1;
    }

    if (now - lastSweep >= windowMs) {
      lastSweep = now;
      for (const [key, value] of hits.entries()) {
        if (now - value.start >= windowMs) hits.delete(key);
      }
    }

    return next();
  };
};

const requireApiKey = (req, res, next) => {
  if (!SCAN_API_KEY) return next();
  const key = req.get('x-api-key') || req.query?.api_key || req.body?.api_key;
  if (key !== SCAN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
};

const getApiKey = (req) => req.get('x-api-key') || req.query?.api_key || req.body?.api_key || null;

const recordUsage = (req, eventType, quantity = 1, meta = null) => {
  try {
    const userId = req.user?.id || null;
    const apiKey = getApiKey(req);
    const ip = getClientIp(req);
    const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO usage_events (id, user_id, api_key, ip_hash, event_type, quantity, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      apiKey,
      ipHash,
      eventType,
      quantity,
      meta ? JSON.stringify(meta) : null
    );
  } catch (error) {
    console.warn('Usage record error:', error.message);
  }
};

const USAGE_WINDOW_HOURS = Number(process.env.USAGE_WINDOW_HOURS ?? 24);
const USAGE_LIMITS = {
  scan: Number(process.env.USAGE_LIMIT_SCAN ?? (isProd ? 100 : 1000)),
  scan_stream: Number(process.env.USAGE_LIMIT_SCAN_STREAM ?? (isProd ? 100 : 1000)),
  scan_job: Number(process.env.USAGE_LIMIT_SCAN_JOB ?? (isProd ? 100 : 1000)),
  screenshot: Number(process.env.USAGE_LIMIT_SCREENSHOT ?? (isProd ? 200 : 2000)),
  screenshot_job: Number(process.env.USAGE_LIMIT_SCREENSHOT_JOB ?? (isProd ? 200 : 2000)),
};

const getUsageLimit = (eventType) => {
  const limit = USAGE_LIMITS[eventType];
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return limit;
};

const getUsageIdentity = (req) => {
  if (req.user?.id) return { column: 'user_id', value: req.user.id };
  const apiKey = getApiKey(req);
  if (apiKey) return { column: 'api_key', value: apiKey };
  const ip = getClientIp(req);
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;
  if (ipHash) return { column: 'ip_hash', value: ipHash };
  return null;
};

const checkUsageLimit = (req, eventType) => {
  const limit = getUsageLimit(eventType);
  if (!limit) return { allowed: true };

  const identity = getUsageIdentity(req);
  if (!identity) return { allowed: true };

  const windowSpec = `-${USAGE_WINDOW_HOURS} hours`;
  const row = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM usage_events
    WHERE event_type = ?
      AND ${identity.column} = ?
      AND created_at >= datetime('now', ?)
  `).get(eventType, identity.value, windowSpec);

  if (row?.total >= limit) {
    return { allowed: false, limit, used: row.total };
  }

  return { allowed: true, limit, used: row?.total || 0 };
};

const enforceUsageLimit = (eventType) => (req, res, next) => {
  const check = checkUsageLimit(req, eventType);
  if (!check.allowed) {
    return res.status(429).json({
      error: 'Usage limit exceeded',
      eventType,
      limit: check.limit,
      used: check.used,
    });
  }
  return next();
};

const scanLimiter = createRateLimiter({ windowMs: SCAN_RATE_WINDOW_MS, max: SCAN_RATE_LIMIT, name: 'scan' });
const screenshotLimiter = createRateLimiter({
  windowMs: SCREENSHOT_RATE_WINDOW_MS,
  max: SCREENSHOT_RATE_LIMIT,
  name: 'screenshot',
});

const processScreenshotQueue = () => {
  while (screenshotActive < SCREENSHOT_MAX_CONCURRENCY && screenshotQueue.length) {
    const next = screenshotQueue.shift();
    screenshotActive += 1;
    Promise.resolve()
      .then(() => next.fn())
      .then(next.resolve)
      .catch(next.reject)
      .finally(() => {
        screenshotActive -= 1;
        processScreenshotQueue();
      });
  }
};

const enqueueScreenshot = async (fn) => {
  return new Promise((resolve, reject) => {
    if (screenshotQueue.length >= SCREENSHOT_QUEUE_MAX) {
      reject(new Error('Screenshot queue full'));
      return;
    }
    screenshotQueue.push({ fn, resolve, reject });
    processScreenshotQueue();
  });
};

const reserveScreenshotSlot = (host) => {
  const now = Date.now();
  const last = lastScreenshotByHost.get(host) || 0;
  const earliest = Math.max(last + SCREENSHOT_MIN_GAP_MS, now);
  lastScreenshotByHost.set(host, earliest);
  return Math.max(0, earliest - now);
};

const JOB_TYPES = {
  scan: 'scan',
  screenshot: 'screenshot',
  discovery: 'discovery',
};
const JOB_STATUS = {
  queued: 'queued',
  running: 'running',
  complete: 'complete',
  failed: 'failed',
  canceled: 'canceled',
};
const JOB_POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? (isProd ? 1000 : 500));
const JOB_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.JOB_MAX_CONCURRENCY ?? (isProd ? 1 : 2))
);

const parseJsonSafe = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const serializeJobRow = (row, includeResult = true) => {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    payload: parseJsonSafe(row.payload),
    progress: parseJsonSafe(row.progress),
    result: includeResult ? parseJsonSafe(row.result) : null,
    error: row.error || null,
  };
};

const getJobRow = (id) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);

const findActiveDiscoveryJob = (mapId) => {
  const rows = db.prepare(`
    SELECT id, payload
    FROM jobs
    WHERE type = ? AND status IN (?, ?)
    ORDER BY created_at ASC
  `).all(JOB_TYPES.discovery, JOB_STATUS.queued, JOB_STATUS.running);

  for (const row of rows) {
    const payload = parseJsonSafe(row.payload) || {};
    if (payload.mapId === mapId || payload.id === mapId) {
      return row.id;
    }
  }
  return null;
};

const createJob = ({ type, payload, req }) => {
  const id = crypto.randomUUID();
  const userId = req.user?.id || null;
  const apiKey = getApiKey(req);
  const ip = getClientIp(req);
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;

  db.prepare(`
    INSERT INTO jobs (id, type, status, user_id, api_key, ip_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    type,
    JOB_STATUS.queued,
    userId,
    apiKey,
    ipHash,
    JSON.stringify(payload || {})
  );

  return id;
};

let activeJobs = 0;

const takeNextJob = db.transaction(() => {
  const job = db.prepare(`
    SELECT * FROM jobs
    WHERE status = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).get(JOB_STATUS.queued);
  if (!job) return null;

  const updated = db.prepare(`
    UPDATE jobs SET status = ?, started_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
  `).run(JOB_STATUS.running, job.id, JOB_STATUS.queued);

  if (updated.changes !== 1) return null;
  return job;
});

const updateJobProgress = (id, progress) => {
  db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(JSON.stringify(progress), id);
};

const markJobComplete = (id, result) => {
  db.prepare(`
    UPDATE jobs
    SET status = ?, result = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(JOB_STATUS.complete, JSON.stringify(result || {}), id);
};

const markJobFailed = (id, error) => {
  db.prepare(`
    UPDATE jobs
    SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(JOB_STATUS.failed, error?.message || String(error || 'Job failed'), id);
};

const markJobCanceled = (id) => {
  db.prepare(`
    UPDATE jobs
    SET status = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN (?, ?)
  `).run(JOB_STATUS.canceled, id, JOB_STATUS.queued, JOB_STATUS.running);
};

const shouldAbortJob = (id, throttleMs = 1000) => {
  let lastCheck = 0;
  return () => {
    const now = Date.now();
    if (now - lastCheck < throttleMs) return false;
    lastCheck = now;
    const row = db.prepare('SELECT status FROM jobs WHERE id = ?').get(id);
    return row?.status === JOB_STATUS.canceled;
  };
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

const DEFAULT_MAX_PAGES = SCAN_LIMITS.maxPagesDefault;
const DEFAULT_MAX_DEPTH = SCAN_LIMITS.maxDepthDefault;

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = normalizeHost(u.hostname);

    if (/\/index\.(html?|php|aspx)$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/index\.(html?|php|aspx)$/i, '/');
    }

    // Remove trailing slash except root
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }

    return u.toString();
  } catch {
    return null;
  }
}

function getUrlDepth(urlStr) {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length;
  } catch {
    return 0;
  }
}

function getPlacementForUrl(urlStr, baseHost) {
  try {
    const host = normalizeHost(new URL(urlStr).hostname);
    if (host === baseHost) return 'Primary';
    if (host.endsWith(`.${baseHost}`)) return 'Subdomain';
    return null;
  } catch {
    return null;
  }
}

function sameOrigin(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.protocol === ub.protocol
      && ua.port === ub.port
      && normalizeHost(ua.hostname) === normalizeHost(ub.hostname)
    );
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
      const parts = normalizeHost(hostname).split('.');
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

function normalizeHost(hostname) {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function getCanonicalKey(urlStr) {
  try {
    const u = new URL(urlStr);
    u.hash = '';
    u.hostname = normalizeHost(u.hostname);
    if (/\/index\.(html?|php|aspx)$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/index\.(html?|php|aspx)$/i, '/');
    }
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }

    if (u.search) {
      const params = new URLSearchParams(u.search);
      const trackingKeys = [
        'gclid', 'fbclid', 'ref', 'ref_src', 'mkt_tok', 'mc_cid', 'mc_eid',
      ];
      Array.from(params.keys()).forEach((key) => {
        if (key.startsWith('utm_') || trackingKeys.includes(key)) {
          params.delete(key);
        }
      });
      const next = params.toString();
      u.search = next ? `?${next}` : '';
    }

    const port = u.port ? `:${u.port}` : '';
    return `${u.hostname}${port}${u.pathname}${u.search}`;
  } catch {
    return urlStr;
  }
}

function getParentUrl(urlStr) {
  const u = new URL(urlStr);
  if (u.pathname === '/' || u.pathname === '') return null;

  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length <= 1) return u.origin + '/';

  const parentPath = '/' + parts.slice(0, -1).join('/');
  return normalizeUrl(u.origin + parentPath);
}

function getTitleFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.pathname === '/' || u.pathname === '') return u.hostname;
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || u.hostname;
    return decodeURIComponent(last).replace(/[-_]/g, ' ');
  } catch {
    return urlStr;
  }
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

const PAGE_STATUS_ACTIVE = 'Active';
const PAGE_STATUS_REDIRECT = 'Redirect';
const PAGE_STATUS_ERROR = 'Error';
const PAGE_STATUS_MISSING = 'Missing';
const PAGE_TYPE_PAGE = 'Page';
const PAGE_TYPE_VIRTUAL = 'Virtual Node';
const PAGE_SEVERITY_WARNING = 'Warning';

const getStatusFromHttp = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return PAGE_STATUS_ACTIVE;
  if (statusCode >= 300 && statusCode < 400) return PAGE_STATUS_REDIRECT;
  if (statusCode >= 400) return PAGE_STATUS_ERROR;
  return PAGE_STATUS_ERROR;
};

const getPlacementWithOrphan = ({ basePlacement, discoverySource, linksIn }) => {
  if (!basePlacement) return null;
  if (discoverySource === 'sitemap' && linksIn === 0) {
    return `${basePlacement} Orphan`;
  }
  return basePlacement;
};

const getSeverityForPage = ({ placement, status }) => {
  if (placement === 'Subdomain Orphan' && status === PAGE_STATUS_ACTIVE) {
    return 'Security Risk';
  }
  if (status === PAGE_STATUS_ERROR) return 'Critical';
  if (status === PAGE_STATUS_REDIRECT) return PAGE_SEVERITY_WARNING;
  if (placement === 'Primary Orphan') return 'High';
  if (status === PAGE_STATUS_MISSING) return 'Medium';
  return 'Healthy';
};

function persistPagesForIa(
  nodes,
  baseHost,
  discoverySourceByUrl = new Map(),
  linksInCounts = new Map()
) {
  if (!nodes || nodes.size === 0) {
    return {
      totalSaved: 0,
      virtualInserted: 0,
      subdomainCount: 0,
      queryBehavior: 'preserved',
      domainParsing: 'base-host-fallback',
    };
  }

  const pageColumns = db.prepare('PRAGMA table_info(pages)').all().map((col) => col.name);
  const hasType = pageColumns.includes('type');
  const hasDepth = pageColumns.includes('depth');

  const selectColumns = [
    'url',
    'title',
    'status',
    'placement',
    'parent_url',
    'severity',
    'discovery_source',
    'links_in',
  ];
  if (hasType) selectColumns.push('type');
  if (hasDepth) selectColumns.push('depth');

  const selectStmt = db.prepare(`
    SELECT ${selectColumns.join(', ')}
    FROM pages
    WHERE url = ?
  `);

  const insertColumns = [
    'url',
    'title',
    'status',
    'severity',
    'placement',
    'parent_url',
    'discovery_source',
    'links_in',
  ];
  if (hasType) insertColumns.push('type');
  if (hasDepth) insertColumns.push('depth');
  const insertStmt = db.prepare(`
    INSERT INTO pages (${insertColumns.join(', ')}, created_at, updated_at)
    VALUES (${insertColumns.map(() => '?').join(', ')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const updateColumns = [
    'title',
    'status',
    'severity',
    'placement',
    'parent_url',
    'discovery_source',
    'links_in',
  ];
  if (hasType) updateColumns.push('type');
  if (hasDepth) updateColumns.push('depth');
  const updateStmt = db.prepare(`
    UPDATE pages
    SET ${updateColumns.map((col) => `${col} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE url = ?
  `);

  const known = new Map();
  const readExisting = (url) => {
    if (known.has(url)) return known.get(url);
    const row = selectStmt.get(url) || null;
    known.set(url, row);
    return row;
  };

  const buildInsertValues = (row) => {
    const values = [
      row.url,
      row.title,
      row.status,
      row.severity,
      row.placement,
      row.parent_url,
      row.discovery_source,
      row.links_in,
    ];
    if (hasType) values.push(row.type ?? null);
    if (hasDepth) values.push(row.depth ?? null);
    return values;
  };

  const buildUpdateValues = (row) => {
    const values = [
      row.title,
      row.status,
      row.severity,
      row.placement,
      row.parent_url,
      row.discovery_source,
      row.links_in,
    ];
    if (hasType) values.push(row.type ?? null);
    if (hasDepth) values.push(row.depth ?? null);
    values.push(row.url);
    return values;
  };

  const upsertPage = ({
    url,
    title,
    status,
    type,
    basePlacement,
    parent_url,
    depth,
    discovery_source,
    incomingLinks = 0,
  }) => {
    const existing = readExisting(url);
    const isIncomingVirtual = type === PAGE_TYPE_VIRTUAL;
    const isExistingVirtual = existing
      && (existing.type === PAGE_TYPE_VIRTUAL || existing.status === PAGE_STATUS_MISSING);

    if (!existing) {
      const nextLinksIn = incomingLinks;
      const nextDiscoverySource = discovery_source || 'crawl';
      const nextPlacement = getPlacementWithOrphan({
        basePlacement,
        discoverySource: nextDiscoverySource,
        linksIn: nextLinksIn,
      });
      const nextSeverity = getSeverityForPage({ placement: nextPlacement, status });
      const row = {
        url,
        title,
        status,
        severity: nextSeverity,
        placement: nextPlacement,
        parent_url,
        discovery_source: nextDiscoverySource,
        links_in: nextLinksIn,
        type,
        depth,
      };
      insertStmt.run(...buildInsertValues(row));
      known.set(url, row);
      return { inserted: true, virtual: isIncomingVirtual };
    }

    if (!isExistingVirtual && isIncomingVirtual) {
      return { skipped: true };
    }

    const existingLinks = Number.isFinite(existing.links_in) ? existing.links_in : 0;
    const nextLinksIn = existingLinks + incomingLinks;

    const nextDiscoverySource = existing.discovery_source === 'crawl'
      ? 'crawl'
      : (discovery_source === 'crawl'
        ? 'crawl'
        : (discovery_source || existing.discovery_source || 'crawl'));

    const nextPlacement = getPlacementWithOrphan({
      basePlacement,
      discoverySource: nextDiscoverySource,
      linksIn: nextLinksIn,
    });

    const nextStatus = isExistingVirtual && !isIncomingVirtual
      ? status
      : (!isExistingVirtual && isIncomingVirtual ? existing.status : status);
    const nextType = hasType
      ? (isExistingVirtual && !isIncomingVirtual
        ? type
        : (!isExistingVirtual && isIncomingVirtual ? existing.type : type))
      : undefined;
    const nextTitle = title || existing.title || null;
    const nextParent = parent_url;
    const nextDepth = hasDepth ? depth : existing.depth ?? null;
    const nextSeverity = getSeverityForPage({ placement: nextPlacement, status: nextStatus });

    const needsUpdate = nextTitle !== existing.title
      || nextStatus !== existing.status
      || nextSeverity !== existing.severity
      || nextPlacement !== existing.placement
      || nextParent !== existing.parent_url
      || nextDiscoverySource !== existing.discovery_source
      || nextLinksIn !== existing.links_in
      || (hasType && nextType !== existing.type)
      || (hasDepth && nextDepth !== existing.depth);

    if (needsUpdate) {
      const row = {
        url,
        title: nextTitle,
        status: nextStatus,
        severity: nextSeverity,
        placement: nextPlacement,
        parent_url: nextParent,
        discovery_source: nextDiscoverySource,
        links_in: nextLinksIn,
        type: nextType,
        depth: nextDepth,
      };
      updateStmt.run(...buildUpdateValues(row));
      known.set(url, row);
    }

    return { updated: needsUpdate, upgraded: isExistingVirtual && !isIncomingVirtual };
  };

  const ensureParentChain = (url) => {
    const chain = [];
    let parentUrl = getParentUrl(url);
    while (parentUrl) {
      chain.unshift(parentUrl);
      parentUrl = getParentUrl(parentUrl);
    }
    chain.forEach((parent) => {
      const basePlacement = getPlacementForUrl(parent, baseHost);
      if (!basePlacement) return;
      const depth = getUrlDepth(parent);
      const parentParent = getParentUrl(parent);
      upsertPage({
        url: parent,
        title: getTitleFromUrl(parent),
        status: PAGE_STATUS_MISSING,
        type: PAGE_TYPE_VIRTUAL,
        basePlacement,
        parent_url: parentParent,
        depth,
        discovery_source: 'crawl',
        incomingLinks: 0,
      });
    });
  };

  const pages = Array.from(nodes.values());
  let totalSaved = 0;
  let virtualInserted = 0;
  let subdomainCount = 0;

  const persisted = new Set();

  const run = db.transaction(() => {
    pages.forEach((node) => {
      const canonicalUrl = normalizeUrl(node.url);
      if (!canonicalUrl) return;
      if (persisted.has(canonicalUrl)) return;
      persisted.add(canonicalUrl);

      const basePlacement = getPlacementForUrl(canonicalUrl, baseHost);
      if (!basePlacement) return;
      if (basePlacement === 'Subdomain') subdomainCount += 1;

      ensureParentChain(canonicalUrl);

      const depth = getUrlDepth(canonicalUrl);
      const parentUrl = getParentUrl(canonicalUrl);
      const isMissing = Boolean(node.isMissing);
      let status = isMissing
        ? PAGE_STATUS_MISSING
        : getStatusFromHttp(Number.isFinite(node.httpStatus) ? node.httpStatus : 0);
      if (!isMissing && status === PAGE_STATUS_ACTIVE && node.wasRedirect) {
        status = PAGE_STATUS_REDIRECT;
      }
      const type = isMissing ? PAGE_TYPE_VIRTUAL : PAGE_TYPE_PAGE;
      const title = node.title || getTitleFromUrl(canonicalUrl);
      const incomingLinks = linksInCounts.get(canonicalUrl) || 0;
      const discoverySource = isMissing
        ? 'crawl'
        : (discoverySourceByUrl.get(canonicalUrl) || 'crawl');

      const result = upsertPage({
        url: canonicalUrl,
        title,
        status,
        type,
        basePlacement,
        parent_url: parentUrl,
        depth,
        discovery_source: discoverySource,
        incomingLinks,
      });

      if (result?.inserted || result?.updated) {
        totalSaved += 1;
      }
      if (result?.inserted && result?.virtual) {
        virtualInserted += 1;
      }
    });

    linksInCounts.forEach((count, url) => {
      if (!count) return;
      if (persisted.has(url)) return;

      const existing = readExisting(url);
      if (!existing) return;
      const basePlacement = getPlacementForUrl(url, baseHost);
      if (!basePlacement) return;

      const nextLinksIn = (Number.isFinite(existing.links_in) ? existing.links_in : 0) + count;
      const nextDiscoverySource = 'crawl';
      const nextPlacement = getPlacementWithOrphan({
        basePlacement,
        discoverySource: nextDiscoverySource,
        linksIn: nextLinksIn,
      });
      const nextStatus = existing.status || PAGE_STATUS_ACTIVE;
      const nextSeverity = getSeverityForPage({ placement: nextPlacement, status: nextStatus });
      const parentUrl = getParentUrl(url);
      const depth = hasDepth ? getUrlDepth(url) : existing.depth ?? null;
      const nextTitle = existing.title || getTitleFromUrl(url);
      const nextType = hasType ? existing.type : undefined;

      const needsUpdate = nextTitle !== existing.title
        || nextStatus !== existing.status
        || nextSeverity !== existing.severity
        || nextPlacement !== existing.placement
        || parentUrl !== existing.parent_url
        || nextDiscoverySource !== existing.discovery_source
        || nextLinksIn !== existing.links_in
        || (hasType && nextType !== existing.type)
        || (hasDepth && depth !== existing.depth);

      if (needsUpdate) {
        const row = {
          url,
          title: nextTitle,
          status: nextStatus,
          severity: nextSeverity,
          placement: nextPlacement,
          parent_url: parentUrl,
          discovery_source: nextDiscoverySource,
          links_in: nextLinksIn,
          type: nextType,
          depth,
        };
        updateStmt.run(...buildUpdateValues(row));
        known.set(url, row);
      }
    });
  });

  run();

  return {
    totalSaved,
    virtualInserted,
    subdomainCount,
    queryBehavior: 'preserved',
    domainParsing: 'base-host-fallback',
  };
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

function extractCanonicalUrl(html, baseUrl) {
  try {
    const $ = cheerio.load(html);
    const href = ($('link[rel="canonical"]').attr('href') || '').trim();
    if (!href) return null;
    const abs = new URL(href, baseUrl).toString();
    return normalizeUrl(abs);
  } catch {
    return null;
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
  const responseUrl = res.request?.res?.responseUrl;
  const finalUrl = normalizeUrl(responseUrl || url);
  return { html: res.data, status: res.status, contentType: res.headers['content-type'], finalUrl };
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

const resolveMapBaseUrl = (mapRow) => {
  if (!mapRow) return null;
  if (mapRow.url) {
    try {
      return new URL(mapRow.url).toString();
    } catch {
      // fall through
    }
  }
  const root = parseJsonSafe(mapRow.root_data);
  if (root?.url) {
    try {
      return new URL(root.url).toString();
    } catch {
      // fall through
    }
  }
  return null;
};

const probeSubdomainOrigin = async (host, abortCheck = null) => {
  const attempts = [
    { protocol: 'https', url: `https://${host}/` },
    { protocol: 'http', url: `http://${host}/` },
  ];
  let lastError = null;
  for (const attempt of attempts) {
    if (abortCheck?.()) throw new Error('Discovery aborted');
    try {
      const res = await fetchPage(attempt.url);
      return {
        ok: true,
        protocol: attempt.protocol,
        origin: `${attempt.protocol}://${host}`,
        status: res.status,
      };
    } catch (err) {
      lastError = err;
    }
  }
  return { ok: false, error: lastError };
};

const collectSitemapUrls = async (origin, hostNormalized, protocol, abortCheck = null) => {
  const urls = new Set();
  const processed = new Set();
  const MAX_SITEMAPS = 12;

  const normalizeSitemapUrl = (loc) => {
    try {
      const resolved = new URL(loc, origin);
      if (normalizeHost(resolved.hostname) !== hostNormalized) return null;
      resolved.hostname = hostNormalized;
      resolved.protocol = `${protocol}:`;
      resolved.hash = '';
      return normalizeUrl(resolved.toString());
    } catch {
      return null;
    }
  };

  const processSitemap = async (sitemapUrl) => {
    if (abortCheck?.()) throw new Error('Discovery aborted');
    const normalizedSitemap = normalizeUrl(sitemapUrl);
    if (!normalizedSitemap) return;
    if (processed.has(normalizedSitemap)) return;
    if (processed.size >= MAX_SITEMAPS) return;
    processed.add(normalizedSitemap);

    try {
      const sitemapRes = await axios.get(sitemapUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'MapMatBot/1.0' },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (sitemapUrl.endsWith('.txt')) {
        const lines = sitemapRes.data.split('\n').map((u) => u.trim()).filter(Boolean);
        for (const line of lines) {
          const norm = normalizeSitemapUrl(line);
          if (norm) urls.add(norm);
        }
        return;
      }

      const $ = cheerio.load(sitemapRes.data, { xmlMode: true });
      const subSitemaps = [];

      $('url > loc').each((_, el) => {
        const loc = $(el).text().trim();
        const norm = normalizeSitemapUrl(loc);
        if (norm) urls.add(norm);
      });

      $('sitemap > loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) subSitemaps.push(loc);
      });

      for (const loc of subSitemaps) {
        await processSitemap(loc);
      }
    } catch {
      // ignore sitemap fetch errors
    }
  };

  await processSitemap(`${origin}/sitemap.xml`);
  return Array.from(urls);
};

const runDiscoveryJob = async (jobId, payload) => {
  const mapId = payload?.mapId || payload?.id;
  if (!mapId) throw new Error('Missing mapId');

  const mapRow = db.prepare('SELECT id, url, root_data FROM maps WHERE id = ?').get(mapId);
  if (!mapRow) throw new Error('Map not found');

  const baseUrl = resolveMapBaseUrl(mapRow);
  if (!baseUrl) throw new Error('Map url not found');

  const baseHost = normalizeHost(new URL(baseUrl).hostname);
  const abortCheck = shouldAbortJob(jobId);

  const nodes = new Map();
  const discoverySourceByUrl = new Map();
  const linksInCounts = new Map();

  const summary = {
    mapId,
    baseHost,
    prefixesChecked: 0,
    subdomainsFound: 0,
    urlsDiscovered: 0,
    urlsProcessed: 0,
  };

  let lastProgress = 0;
  const maybeUpdateProgress = () => {
    const now = Date.now();
    if (now - lastProgress < 500) return;
    lastProgress = now;
    updateJobProgress(jobId, summary);
  };

  for (const prefix of DISCOVERY_SUBDOMAIN_PREFIXES) {
    if (abortCheck()) throw new Error('Discovery aborted');
    summary.prefixesChecked += 1;

    const host = `${prefix}.${baseHost}`;
    const hostNormalized = normalizeHost(host);
    const probe = await probeSubdomainOrigin(host, abortCheck);
    if (!probe.ok) {
      maybeUpdateProgress();
      continue;
    }

    summary.subdomainsFound += 1;
    maybeUpdateProgress();

    const sitemapUrls = await collectSitemapUrls(probe.origin, hostNormalized, probe.protocol, abortCheck);
    if (!sitemapUrls.length) {
      continue;
    }

    for (const url of sitemapUrls) {
      if (abortCheck()) throw new Error('Discovery aborted');
      if (nodes.has(url)) continue;

      const statusResult = await checkLinkStatus(url);
      const httpStatus = Number.isFinite(statusResult.status) ? statusResult.status : 0;

      nodes.set(url, {
        url,
        title: getTitleFromUrl(url),
        httpStatus,
        wasRedirect: false,
      });
      discoverySourceByUrl.set(url, 'sitemap');
      summary.urlsDiscovered += 1;
      summary.urlsProcessed += 1;
      maybeUpdateProgress();
    }
  }

  let iaSummary = null;
  if (nodes.size) {
    iaSummary = persistPagesForIa(nodes, baseHost, discoverySourceByUrl, linksInCounts);
  }

  return {
    ...summary,
    saved: iaSummary?.totalSaved || 0,
    virtualInserted: iaSummary?.virtualInserted || 0,
    subdomainRows: iaSummary?.subdomainCount || 0,
  };
};

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
    duplicates: Boolean(options.duplicates),
    files: Boolean(options.files),
    crosslinks: Boolean(options.crosslinks),
  };
}

async function crawlSite(startUrl, maxPages, maxDepth, options = {}, onProgress = null, shouldAbort = null) {
  const scanOptions = normalizeScanOptions(options);
  const seed = normalizeUrl(startUrl);
  if (!seed) throw new Error('Invalid URL');

  const origin = new URL(seed).origin;
  const baseHost = normalizeHost(new URL(seed).hostname);
  const allowSubdomains = scanOptions.subdomains;
  const allowUrl = (candidate) => {
    const normalized = normalizeUrl(candidate);
    if (!normalized) return false;
    const placement = getPlacementForUrl(normalized, baseHost);
    if (!placement) return false;
    if (!allowSubdomains) {
      return placement === 'Primary' && sameOrigin(normalized, origin);
    }
    return true;
  };

  const discoverySourceByUrl = new Map();
  const linksInCounts = new Map();
  const linkEdgeSet = new Set();

  const recordDiscovery = (url, source) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    const existing = discoverySourceByUrl.get(normalized);
    if (existing === 'crawl') return;
    if (source === 'crawl' || !existing) {
      discoverySourceByUrl.set(normalized, source);
    }
  };

  const recordLinkEdge = (fromUrl, toUrl) => {
    const from = normalizeUrl(fromUrl);
    const to = normalizeUrl(toUrl);
    if (!from || !to) return;
    const edgeKey = `${from}>>${to}`;
    if (linkEdgeSet.has(edgeKey)) return;
    linkEdgeSet.add(edgeKey);
    linksInCounts.set(to, (linksInCounts.get(to) || 0) + 1);
  };

  const visited = new Set();
  const referrerMap = new Map();
  const queue = [];
  const queued = new Set();
  let queueIndex = 0;
  const enqueue = (url, depth) => {
    if (!url) return;
    if (queued.has(url)) return;
    queued.add(url);
    queue.push({ url, depth });
  };
  enqueue(seed, 0);
  recordDiscovery(seed, 'crawl');
  const sitemapOrder = new Map();
  let discoveryCounter = 0;

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
      recordDiscovery(commonUrl, 'crawl');
      enqueue(commonUrl, 1);
    }
  }

  const processedSitemaps = new Set();
  const MAX_SITEMAPS = 12;

  const processSitemap = async (sitemapUrl) => {
    const normalizedSitemap = normalizeUrl(sitemapUrl);
    if (!normalizedSitemap) return;
    if (processedSitemaps.has(normalizedSitemap)) return;
    if (processedSitemaps.size >= MAX_SITEMAPS) return;

    const placement = getPlacementForUrl(normalizedSitemap, baseHost);
    if (!placement) return;

    processedSitemaps.add(normalizedSitemap);

    try {
      const sitemapRes = await axios.get(sitemapUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'MapMatBot/1.0' },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (sitemapUrl.endsWith('.txt')) {
        const urls = sitemapRes.data.split('\n').map((u) => u.trim()).filter(Boolean);
        for (const u of urls) {
          const norm = normalizeUrl(u);
          if (norm && allowUrl(norm)) {
            recordDiscovery(norm, 'sitemap');
            if (!sitemapOrder.has(norm)) sitemapOrder.set(norm, sitemapOrder.size);
            enqueue(norm, 1);
          }
        }
        return;
      }

      const $ = cheerio.load(sitemapRes.data, { xmlMode: true });
      const subSitemaps = [];

      $('url > loc').each((_, el) => {
        const loc = $(el).text().trim();
        const norm = normalizeUrl(loc);
        if (norm && allowUrl(norm)) {
          recordDiscovery(norm, 'sitemap');
          if (!sitemapOrder.has(norm)) sitemapOrder.set(norm, sitemapOrder.size);
          enqueue(norm, 1);
        }
      });

      $('sitemap > loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) subSitemaps.push(loc);
      });

      for (const loc of subSitemaps) {
        await processSitemap(loc);
      }
    } catch {
      // Not available, continue
    }
  };

  await processSitemap(`${origin}/sitemap.xml`);
  for (const altSitemap of ['/sitemap_index.xml', '/sitemap-index.xml', '/sitemap.txt']) {
    await processSitemap(`${origin}${altSitemap}`);
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

  while (queueIndex < queue.length && visited.size < maxPages) {
    if (shouldAbort?.()) throw new Error('Scan aborted');
    const { url, depth } = queue[queueIndex++];

    if (visited.has(url)) continue;
    visited.add(url);
    const discoveryIndex = discoveryCounter++;

    // Send progress update
    if (onProgress) {
      onProgress({ scanned: visited.size, queued: Math.max(0, queue.length - queueIndex) });
    }

    if (depth > maxDepth) continue;
    if (!allowUrl(url)) continue;

    let html;
    let status = 0;
    let contentType = '';
    let finalUrl = url;
    try {
      const res = await fetchPage(url, extraHeaders);
      html = res.html;
      status = res.status;
      contentType = res.contentType;
      finalUrl = res.finalUrl || url;
    } catch (e) {
    // Still store node with fallback title so tree doesn't break
    if (scanOptions.brokenLinks) brokenLinks.push({ url, reason: 'fetch_failed' });
    if (scanOptions.inactivePages) inactivePages.push({ url, status: 0, reason: 'fetch_failed' });
      if (!pageMap.has(url)) {
        pageMap.set(url, {
          url,
          title: new URL(url).pathname === '/' ? new URL(url).hostname : url,
          parentUrl: getParentUrl(url),
          discoveryIndex,
          httpStatus: status,
          wasRedirect: false,
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

    const title = extractTitle(html, finalUrl || url);
    const parentUrl = getParentUrl(finalUrl || url);
    const canonicalUrl = extractCanonicalUrl(html, finalUrl || url);
    const isAuthPage = status === 401 || status === 403;
    const wasRedirect = normalizeUrl(finalUrl || url) !== normalizeUrl(url);

    pageMap.set(url, {
      url,
      finalUrl: finalUrl || url,
      canonicalUrl,
      title,
      parentUrl,
      authRequired: status === 401 || status === 403,
      thumbnailUrl: undefined,
      discoveryIndex,
      httpStatus: status,
      wasRedirect,
    });

    const links = extractLinks(html, finalUrl || url);
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

      recordLinkEdge(url, link);
      recordDiscovery(link, 'crawl');

      const d = depth + 1;
      if (d > maxDepth) continue;
      if (visited.has(link)) continue;

        const normalizedReferrer = normalizeUrl(url);
        if (!referrerMap.has(link) && link !== normalizedReferrer) {
          referrerMap.set(link, normalizedReferrer);
        }
      enqueue(link, d);
    }
  }

  // Ensure the root exists
  if (!pageMap.has(seed)) {
    pageMap.set(seed, {
      url: seed,
      title: new URL(seed).hostname,
      parentUrl: null,
      discoveryIndex: -1,
      httpStatus: null,
      wasRedirect: false,
    });
  }

  const scannedKeys = new Set();
  pageMap.forEach((meta) => {
    const key = getCanonicalKey(meta.canonicalUrl || meta.finalUrl || meta.url);
    if (key) scannedKeys.add(key);
  });

  // Build nodes
  const nodes = new Map();
  for (const [url, meta] of pageMap.entries()) {
    nodes.set(url, {
      id: safeIdFromUrl(url),
      url,
      finalUrl: meta.finalUrl || url,
      canonicalUrl: meta.canonicalUrl || null,
      title: meta.title || url,
      parentUrl: meta.parentUrl,
      discoveryIndex: Number.isFinite(meta.discoveryIndex) ? meta.discoveryIndex : null,
      referrerUrl: referrerMap.get(url) || null,
      authRequired: meta.authRequired || false,
      thumbnailUrl: meta.thumbnailUrl || undefined,
      httpStatus: meta.httpStatus ?? null,
      wasRedirect: meta.wasRedirect || false,
      children: [],
    });
  }

  // Clear missing flag for anything actually scanned
  pageMap.forEach((_, url) => {
    const node = nodes.get(url);
    if (node) node.isMissing = false;
  });

  // Link children using referrer graph for main tree and path graph for subdomain/orphan trees
  const rootUrl = seed;
  const rootHost = new URL(rootUrl).hostname;
  const rootHostNormalized = normalizeHost(rootHost);

  const canonicalKeyFor = (node) => getCanonicalKey(node.canonicalUrl || node.finalUrl || node.url);
  const canonicalToUrl = new Map();
  nodes.forEach((node) => {
    const key = canonicalKeyFor(node);
    if (!key) return;
    if (!canonicalToUrl.has(key)) canonicalToUrl.set(key, node.url);
  });

  const ensureParentChain = (url) => {
    let parentUrl = getParentUrl(url);
    while (parentUrl && !nodes.has(parentUrl)) {
      const canonicalMatch = canonicalToUrl.get(getCanonicalKey(parentUrl));
      if (canonicalMatch) return;
      nodes.set(parentUrl, {
        id: safeIdFromUrl(parentUrl),
        url: parentUrl,
        title: getTitleFromUrl(parentUrl),
        parentUrl: getParentUrl(parentUrl),
        referrerUrl: null,
        authRequired: false,
        thumbnailUrl: undefined,
        isMissing: true,
        children: [],
      });
      const key = getCanonicalKey(parentUrl);
      if (key && !canonicalToUrl.has(key)) canonicalToUrl.set(key, parentUrl);
      parentUrl = getParentUrl(parentUrl);
    }
  };

  for (const node of nodes.values()) {
    if (node.url === rootUrl) continue;
    ensureParentChain(node.url);
  }

  nodes.forEach((node) => {
    if (!node.parentUrl) return;
    if (nodes.has(node.parentUrl)) return;
    const canonicalMatch = canonicalToUrl.get(getCanonicalKey(node.parentUrl));
    if (canonicalMatch && nodes.has(canonicalMatch)) {
      node.parentUrl = canonicalMatch;
    }
  });

  if (scanOptions.duplicates) {
    const canonicalIndex = new Map();
    const rootNode = nodes.get(rootUrl);
    if (rootNode) {
      const rootKey = canonicalKeyFor(rootNode);
      if (rootKey) canonicalIndex.set(rootKey, rootNode.url);
      rootNode.isDuplicate = false;
      rootNode.duplicateOf = null;
    }
    nodes.forEach((node) => {
      if (node.url === rootUrl) return;
      const key = canonicalKeyFor(node);
      if (!key) return;
      if (!canonicalIndex.has(key)) {
        canonicalIndex.set(key, node.url);
        return;
      }
      if (canonicalIndex.get(key) !== node.url) {
        node.isDuplicate = true;
        node.duplicateOf = canonicalIndex.get(key);
      }
    });
  }

  // Reset children before regrouping
  nodes.forEach((node) => {
    node.children = [];
    node._childUrls = undefined;
  });

  // Build referrer adjacency (link graph)
  const referrerChildren = new Map();
  for (const [childUrl, referrerUrl] of referrerMap.entries()) {
    if (!referrerUrl) continue;
    if (!nodes.has(childUrl) || !nodes.has(referrerUrl)) continue;
    if (!referrerChildren.has(referrerUrl)) referrerChildren.set(referrerUrl, []);
    referrerChildren.get(referrerUrl).push(childUrl);
  }

  // Determine which nodes are linked to root via referrers
  const linked = new Set([rootUrl]);
  const linkedQueue = [rootUrl];
  while (linkedQueue.length) {
    const current = linkedQueue.shift();
    const children = referrerChildren.get(current) || [];
    for (const childUrl of children) {
      if (!nodes.has(childUrl)) continue;
      const childHost = new URL(childUrl).hostname;
      if (normalizeHost(childHost) !== rootHostNormalized) continue;
      if (linked.has(childUrl)) continue;
      linked.add(childUrl);
      linkedQueue.push(childUrl);
    }
  }

  // Ensure path ancestors for linked nodes are also linked (for missing placeholders)
  Array.from(linked).forEach((url) => {
    let parentUrl = getParentUrl(url);
    while (parentUrl) {
      if (!nodes.has(parentUrl)) break;
      const parentHost = new URL(parentUrl).hostname;
      if (normalizeHost(parentHost) !== rootHostNormalized) break;
      if (linked.has(parentUrl)) break;
      linked.add(parentUrl);
      parentUrl = getParentUrl(parentUrl);
    }
  });

  const orphanCandidates = [];
  const subdomainCandidates = [];

  const pushUniqueChild = (parent, child) => {
    if (!parent._childUrls) parent._childUrls = new Set();
    const key = normalizeUrl(child.url);
    if (parent._childUrls.has(key)) return;
    parent._childUrls.add(key);
    parent.children.push(child);
  };

  for (const node of nodes.values()) {
    if (node.url === rootUrl) continue;
    const nodeHost = new URL(node.url).hostname;
    const isSubdomain = scanOptions.subdomains && normalizeHost(nodeHost) !== rootHostNormalized;

    if (isSubdomain) {
      subdomainCandidates.push(node);
      continue;
    }

    if (node.isDuplicate) {
      if (scanOptions.orphanPages) orphanCandidates.push(node);
      continue;
    }

    if (linked.has(node.url)) {
      const parentUrl = node.parentUrl;
      if (parentUrl && nodes.has(parentUrl) && linked.has(parentUrl)) {
        pushUniqueChild(nodes.get(parentUrl), node);
      } else {
        pushUniqueChild(nodes.get(rootUrl), node);
      }
      continue;
    }

    if (scanOptions.orphanPages) {
      if (!node.isMissing) orphanCandidates.push(node);
    }
  }

  // Build subdomain trees
  const subdomainSet = new Set(subdomainCandidates.map((n) => n.url));
  const subdomainNodes = [];
  for (const node of subdomainCandidates) {
    const parentUrl = node.parentUrl;
    if (parentUrl && subdomainSet.has(parentUrl)) {
      pushUniqueChild(nodes.get(parentUrl), node);
    } else {
      subdomainNodes.push(node);
    }
  }

  // Build orphan trees with missing parent placeholders
  const orphanMap = new Map();
  const addOrphanNode = (node) => {
    if (!node?.url) return null;
    if (orphanMap.has(node.url)) return orphanMap.get(node.url);
    const sourceNode = nodes.get(node.url) || node;
    const normalized = {
      ...sourceNode,
      orphanType: node.orphanType || sourceNode.orphanType || 'orphan',
      children: [],
    };
    orphanMap.set(normalized.url, normalized);
    return normalized;
  };

  orphanCandidates.forEach((node) => addOrphanNode(node));

  const ensureOrphanParentChain = (url) => {
    let parentUrl = getParentUrl(url);
    while (parentUrl && parentUrl !== rootUrl) {
      if (!orphanMap.has(parentUrl)) {
        const sourceNode = nodes.get(parentUrl);
        orphanMap.set(parentUrl, {
          id: sourceNode?.id || safeIdFromUrl(parentUrl),
          url: parentUrl,
          title: sourceNode?.title || getTitleFromUrl(parentUrl),
          parentUrl: sourceNode?.parentUrl || getParentUrl(parentUrl),
          referrerUrl: sourceNode?.referrerUrl || null,
          authRequired: sourceNode?.authRequired || false,
          thumbnailUrl: sourceNode?.thumbnailUrl || undefined,
          isMissing: sourceNode ? false : true,
          orphanType: 'orphan',
          children: [],
        });
      }
      parentUrl = getParentUrl(parentUrl);
    }
  };

  Array.from(orphanMap.values()).forEach((node) => {
    ensureOrphanParentChain(node.url);
  });

  const orphanNodes = [];
  orphanMap.forEach((node) => {
    const parentUrl = node.parentUrl;
    if (parentUrl && orphanMap.has(parentUrl)) {
      pushUniqueChild(orphanMap.get(parentUrl), node);
    } else {
      orphanNodes.push(node);
    }
  });

  const getSitemapIndex = (node) => {
    const direct = sitemapOrder.get(node.finalUrl || node.url);
    if (direct !== undefined) return direct;
    return sitemapOrder.get(node.url);
  };

  const alphaKey = (node) => (node.title || node.url || '');

  const compareAlpha = (a, b) => alphaKey(a).localeCompare(alphaKey(b));

  const compareByStats = (a, b) => {
    if (a._treeDepth !== b._treeDepth) return b._treeDepth - a._treeDepth;
    if (a._treeSize !== b._treeSize) return b._treeSize - a._treeSize;
    return compareAlpha(a, b);
  };

  const computeStats = (node) => {
    if (!node) return { depth: 0, size: 0 };
    if (!node.children?.length) {
      node._treeDepth = 1;
      node._treeSize = 1;
      return { depth: 1, size: 1 };
    }
    let maxDepth = 1;
    let totalSize = 1;
    node.children.forEach((child) => {
      const stats = computeStats(child);
      maxDepth = Math.max(maxDepth, stats.depth + 1);
      totalSize += stats.size;
    });
    node._treeDepth = maxDepth;
    node._treeSize = totalSize;
    return { depth: maxDepth, size: totalSize };
  };

  const sortTree = (node, depth = 0) => {
    if (!node?.children?.length) return;
    node.children.sort((a, b) => {
      const sa = getSitemapIndex(a);
      const sb = getSitemapIndex(b);
      if (sa !== undefined && sb !== undefined && sa !== sb) return sa - sb;
      if (sa !== undefined && sb === undefined) return -1;
      if (sa === undefined && sb !== undefined) return 1;
      return compareByStats(a, b);
    });
    node.children.forEach((child) => sortTree(child, depth + 1));
  };

  const root = nodes.get(rootUrl);
  computeStats(root);
  subdomainNodes.forEach(computeStats);
  orphanNodes.forEach(computeStats);
  sortTree(root);
  subdomainNodes.forEach((node) => sortTree(node, 0));
  orphanNodes.forEach((node) => sortTree(node, 0));

  const sitemapKeys = new Set(
    Array.from(sitemapOrder.keys())
      .map((url) => getCanonicalKey(url))
      .filter(Boolean)
  );

  nodes.forEach((node) => {
    if (!node.isMissing) return;
    const key = getCanonicalKey(node.url);
    if (key && (sitemapKeys.has(key) || scannedKeys.has(key))) {
      node.isMissing = false;
    }
  });

  const pruneMissing = (node) => {
    if (node.children?.length) {
      node.children = node.children.filter(pruneMissing);
    }
    if (node.isMissing && (!node.children || node.children.length === 0)) return false;
    return true;
  };

  const prunedOrphanNodes = orphanNodes.filter(pruneMissing);

  const clearMissingIfKnown = (node) => {
    if (node.isMissing) {
      const key = getCanonicalKey(node.url);
      if (node.discoveryIndex !== null && node.discoveryIndex !== undefined) {
        node.isMissing = false;
      } else if (key && (sitemapKeys.has(key) || scannedKeys.has(key))) {
        node.isMissing = false;
      }
    }
    node.children?.forEach(clearMissingIfKnown);
  };

  if (root) clearMissingIfKnown(root);
  prunedOrphanNodes.forEach(clearMissingIfKnown);
  subdomainNodes.forEach(clearMissingIfKnown);

  const stripInternalFields = (node) => {
    if (!node) return;
    delete node._childUrls;
    delete node._treeDepth;
    delete node._treeSize;
    if (node.children?.length) {
      node.children.forEach(stripInternalFields);
    }
  };

  stripInternalFields(root);
  prunedOrphanNodes.forEach(stripInternalFields);
  subdomainNodes.forEach(stripInternalFields);

  if (scanOptions.duplicates) {
    const canonicalToRootUrl = new Map();
    const collectCanonical = (node) => {
      const key = canonicalKeyFor(node);
      if (key && !canonicalToRootUrl.has(key)) canonicalToRootUrl.set(key, node.url);
      node.children?.forEach(collectCanonical);
    };
    if (root) collectCanonical(root);

    const markDuplicateTree = (node) => {
      const key = canonicalKeyFor(node);
      if (key && canonicalToRootUrl.has(key) && canonicalToRootUrl.get(key) !== node.url) {
        node.isDuplicate = true;
        node.duplicateOf = canonicalToRootUrl.get(key);
      }
      node.children?.forEach(markDuplicateTree);
    };
    orphanNodes.forEach(markDuplicateTree);
    subdomainNodes.forEach(markDuplicateTree);
  }

  try {
    const iaSummary = persistPagesForIa(nodes, baseHost, discoverySourceByUrl, linksInCounts);
    console.log(
      `[scan] IA summary: saved=${iaSummary.totalSaved}, virtual=${iaSummary.virtualInserted}, subdomains=${iaSummary.subdomainCount}, queries=${iaSummary.queryBehavior}, domain=${iaSummary.domainParsing}`
    );
  } catch (err) {
    console.error('IA persistence failed:', err?.message || err);
  }

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
    orphans: scanOptions.orphanPages ? prunedOrphanNodes : [],
    subdomains: scanOptions.subdomains ? subdomainNodes : [],
    errors: scanOptions.errorPages ? errors : [],
    inactivePages: scanOptions.inactivePages ? inactivePages : [],
    brokenLinks: scanOptions.brokenLinks ? brokenLinks : [],
    files: scanOptions.files ? files : [],
    crosslinks,
  };
}

const getBaseUrl = () => (
  process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`
);

async function captureScreenshot(safeUrl, type = 'full') {
  const urlHash = crypto.createHash('sha256').update(safeUrl).digest('hex');
  const filename = `${urlHash}_${type}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  const baseUrl = getBaseUrl();

  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs < 3600000) { // 1 hour
      return {
        url: `${baseUrl}/screenshots/${filename}`,
        cached: true
      };
    }
  }

  const shotResult = await enqueueScreenshot(async () => {
    const host = new URL(safeUrl).hostname;
    const waitMs = reserveScreenshotSlot(host);
    if (waitMs > 0) await sleep(waitMs);

    const b = await getBrowser();
    const ua = SCREENSHOT_USER_AGENTS[Math.floor(Math.random() * SCREENSHOT_USER_AGENTS.length)];
    const context = await b.newContext({
      userAgent: ua,
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        DNT: '1',
      },
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await page.goto(safeUrl, {
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
        await context.close();
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
    await context.close();
    throw lastError || new Error('Screenshot failed');
  });

  return {
    url: `${baseUrl}/screenshots/${filename}`,
    cached: false,
    blocked: shotResult?.blocked || false
  };
}

async function processJob(job) {
  const jobId = job.id;
  const payload = parseJsonSafe(job.payload) || {};
  try {
    if (job.type === JOB_TYPES.scan) {
      const progressState = { lastUpdate: 0, lastScanned: 0 };
      const abortCheck = shouldAbortJob(jobId);
      const progressCb = (progress) => {
        const now = Date.now();
        if (progress.scanned - progressState.lastScanned < 5 && now - progressState.lastUpdate < 500) {
          return;
        }
        progressState.lastUpdate = now;
        progressState.lastScanned = progress.scanned;
        updateJobProgress(jobId, progress);
      };

      const result = await crawlSite(
        payload.url,
        payload.maxPages,
        payload.maxDepth,
        payload.options || {},
        progressCb,
        abortCheck
      );

      const statusRow = db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId);
      if (statusRow?.status === JOB_STATUS.canceled) return;

      markJobComplete(jobId, result);
      return;
    }

    if (job.type === JOB_TYPES.screenshot) {
      const result = await captureScreenshot(payload.url, payload.type || 'full');
      const statusRow = db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId);
      if (statusRow?.status === JOB_STATUS.canceled) return;
      markJobComplete(jobId, result);
      return;
    }

    if (job.type === JOB_TYPES.discovery) {
      const result = await runDiscoveryJob(jobId, payload);
      const statusRow = db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId);
      if (statusRow?.status === JOB_STATUS.canceled) return;
      markJobComplete(jobId, result);
      return;
    }

    throw new Error(`Unknown job type: ${job.type}`);
  } catch (error) {
    const statusRow = db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId);
    if (statusRow?.status === JOB_STATUS.canceled) return;
    markJobFailed(jobId, error);
  }
}

const runJobLoop = () => {
  while (activeJobs < JOB_MAX_CONCURRENCY) {
    const job = takeNextJob();
    if (!job) break;
    activeJobs += 1;
    processJob(job)
      .catch((err) => console.error('Job processing error:', err))
      .finally(() => {
        activeJobs -= 1;
      });
  }
};

if (RUN_WORKER) {
  setInterval(runJobLoop, JOB_POLL_INTERVAL_MS);
  setTimeout(runJobLoop, 0);
}

app.get('/', (_, res) => res.status(200).send('Loxo backend OK'));
app.get('/health', (_, res) => res.status(200).json({ ok: true }));

app.post('/scan', authMiddleware, scanLimiter, requireApiKey, enforceUsageLimit('scan'), async (req, res) => {
  const { url, maxPages, maxDepth, options } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const safeUrl = await assertSafeUrl(url);
    const maxPagesSafe = clampInt(maxPages, {
      min: 1,
      max: SCAN_LIMITS.maxPagesHard,
      fallback: DEFAULT_MAX_PAGES,
    });
    const maxDepthSafe = clampInt(maxDepth, {
      min: 1,
      max: SCAN_LIMITS.maxDepthHard,
      fallback: DEFAULT_MAX_DEPTH,
    });

    recordUsage(req, 'scan', 1, {
      host: new URL(safeUrl).hostname,
      maxPages: maxPagesSafe,
      maxDepth: maxDepthSafe,
    });

    const result = await crawlSite(
      safeUrl,
      maxPagesSafe,
      maxDepthSafe,
      options || {}
    );
    res.json(result);
  } catch (e) {
    const message = e.message || 'Scan failed';
    const status = message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500;
    res.status(status).json({ error: message });
  }
});

// SSE endpoint for scan with progress updates
app.get('/scan-stream', authMiddleware, scanLimiter, requireApiKey, enforceUsageLimit('scan_stream'), async (req, res) => {
  const { url, maxPages, maxDepth, options } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let safeUrl;
  try {
    safeUrl = await assertSafeUrl(url);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invalid url' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const requestOrigin = req.get('origin');
  const fallbackOrigin = allowedOrigins[0] || 'http://localhost:3000';
  res.setHeader(
    'Access-Control-Allow-Origin',
    isCorsOriginAllowed(requestOrigin) && requestOrigin ? requestOrigin : fallbackOrigin
  );
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.flushHeaders();

  // Handle client disconnect
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  const sendEvent = (event, data) => {
    if (aborted) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error('SSE serialization error:', err);
    }
  };

  const heartbeat = setInterval(() => {
    sendEvent('ping', { t: Date.now() });
  }, 15000);

  try {
    let parsedOptions = {};
    try {
      parsedOptions = options ? JSON.parse(options) : {};
    } catch {
      parsedOptions = {};
    }

    const maxPagesSafe = clampInt(maxPages, {
      min: 1,
      max: SCAN_LIMITS.maxPagesHard,
      fallback: DEFAULT_MAX_PAGES,
    });
    const maxDepthSafe = clampInt(maxDepth, {
      min: 1,
      max: SCAN_LIMITS.maxDepthHard,
      fallback: DEFAULT_MAX_DEPTH,
    });

    recordUsage(req, 'scan_stream', 1, {
      host: new URL(safeUrl).hostname,
      maxPages: maxPagesSafe,
      maxDepth: maxDepthSafe,
    });

    const result = await crawlSite(
      safeUrl,
      maxPagesSafe,
      maxDepthSafe,
      parsedOptions,
      (progress) => sendEvent('progress', progress),
      () => aborted
    );

    try {
      const payload = JSON.stringify(result);
      res.write(`event: complete\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.error('Scan serialization failed:', err);
      sendEvent('error', { error: err.message || 'Scan serialization failed' });
    }
    res.end();
  } catch (e) {
    console.error('Scan failed:', e);
    sendEvent('error', { error: e.message || 'Scan failed' });
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});

// Background scan jobs
app.post('/scan-jobs', authMiddleware, scanLimiter, requireApiKey, enforceUsageLimit('scan_job'), async (req, res) => {
  const { url, maxPages, maxDepth, options } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const safeUrl = await assertSafeUrl(url);
    const maxPagesSafe = clampInt(maxPages, {
      min: 1,
      max: SCAN_LIMITS.maxPagesHard,
      fallback: DEFAULT_MAX_PAGES,
    });
    const maxDepthSafe = clampInt(maxDepth, {
      min: 1,
      max: SCAN_LIMITS.maxDepthHard,
      fallback: DEFAULT_MAX_DEPTH,
    });

    const jobId = createJob({
      type: JOB_TYPES.scan,
      payload: {
        url: safeUrl,
        maxPages: maxPagesSafe,
        maxDepth: maxDepthSafe,
        options: options || {},
      },
      req,
    });

    recordUsage(req, 'scan_job', 1, {
      host: new URL(safeUrl).hostname,
      maxPages: maxPagesSafe,
      maxDepth: maxDepthSafe,
    });

    res.json({ jobId });
  } catch (e) {
    const message = e.message || 'Failed to create scan job';
    const status = message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/scan-jobs/:id', authMiddleware, requireApiKey, (req, res) => {
  const { id } = req.params;
  const includeResult = req.query.include_result !== 'false';
  const row = getJobRow(id);
  if (!row || row.type !== JOB_TYPES.scan) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ job: serializeJobRow(row, includeResult) });
});

app.post('/scan-jobs/:id/cancel', authMiddleware, requireApiKey, (req, res) => {
  const { id } = req.params;
  const row = getJobRow(id);
  if (!row || row.type !== JOB_TYPES.scan) {
    return res.status(404).json({ error: 'Job not found' });
  }
  markJobCanceled(id);
  res.json({ success: true });
});

app.get('/scan-jobs/:id/stream', authMiddleware, requireApiKey, (req, res) => {
  const { id } = req.params;
  const includeResult = req.query.include_result !== 'false';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const sendEvent = (event, data) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const interval = setInterval(() => {
    if (closed) {
      clearInterval(interval);
      return;
    }
    const row = getJobRow(id);
    if (!row || row.type !== JOB_TYPES.scan) {
      sendEvent('error', { error: 'Job not found' });
      clearInterval(interval);
      res.end();
      return;
    }
    const job = serializeJobRow(row, includeResult);
    sendEvent('update', job);
    if ([JOB_STATUS.complete, JOB_STATUS.failed, JOB_STATUS.canceled].includes(job.status)) {
      sendEvent('complete', job);
      clearInterval(interval);
      res.end();
    }
  }, 1000);
});

// Background discovery job (subdomain sitemap ingestion)
app.post('/api/maps/:id/discovery', authMiddleware, requireAuth, async (req, res) => {
  const { id } = req.params;

  const map = db.prepare('SELECT id FROM maps WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!map) {
    return res.status(404).json({ error: 'Map not found' });
  }

  try {
    const existingJobId = findActiveDiscoveryJob(id);
    if (existingJobId) {
      return res.json({
        ok: true,
        alreadyRunning: true,
        jobId: existingJobId,
        jobType: JOB_TYPES.discovery,
        mapId: id,
      });
    }

    const jobId = createJob({
      type: JOB_TYPES.discovery,
      payload: { mapId: id },
      req,
    });

    res.json({ ok: true, jobType: JOB_TYPES.discovery, mapId: id, jobId });
  } catch (e) {
    const message = e.message || 'Failed to create discovery job';
    res.status(500).json({ error: message });
  }
});

// Screenshot endpoint - captures full-page screenshot
// Note: Playwright requires browser binaries which may not be available on all hosts
app.get('/screenshot', authMiddleware, screenshotLimiter, requireApiKey, enforceUsageLimit('screenshot'), async (req, res) => {
  const { url, type = 'full' } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  let safeUrl;
  try {
    safeUrl = await assertSafeUrl(url);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invalid url' });
  }

  // Check if we're in production without Playwright support
  if (process.env.DISABLE_SCREENSHOTS === 'true') {
    return res.status(503).json({
      error: 'Screenshots not available',
      reason: 'Feature disabled in this environment'
    });
  }

  try {
    recordUsage(req, 'screenshot', 1, { host: new URL(safeUrl).hostname });
    const result = await captureScreenshot(safeUrl, type);
    res.json(result);
  } catch (e) {
    console.error('Screenshot error:', e.message);
    // Return a short, user-friendly error
    if (e.message?.includes('Screenshot queue full')) {
      return res.status(429).json({ error: 'Screenshot queue full' });
    }
    const shortError = e.message?.includes('Executable')
      ? 'Screenshots not available in this environment'
      : 'Screenshot failed';
    res.status(500).json({ error: shortError });
  }
});

// Background screenshot jobs
app.post('/screenshot-jobs', authMiddleware, screenshotLimiter, requireApiKey, enforceUsageLimit('screenshot_job'), async (req, res) => {
  const { url, type = 'full' } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const safeUrl = await assertSafeUrl(url);
    const jobId = createJob({
      type: JOB_TYPES.screenshot,
      payload: { url: safeUrl, type },
      req,
    });

    recordUsage(req, 'screenshot_job', 1, { host: new URL(safeUrl).hostname });

    res.json({ jobId });
  } catch (e) {
    const message = e.message || 'Failed to create screenshot job';
    const status = message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/screenshot-jobs/:id', authMiddleware, requireApiKey, (req, res) => {
  const { id } = req.params;
  const includeResult = req.query.include_result !== 'false';
  const row = getJobRow(id);
  if (!row || row.type !== JOB_TYPES.screenshot) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ job: serializeJobRow(row, includeResult) });
});

app.post('/screenshot-jobs/:id/cancel', authMiddleware, requireApiKey, (req, res) => {
  const { id } = req.params;
  const row = getJobRow(id);
  if (!row || row.type !== JOB_TYPES.screenshot) {
    return res.status(404).json({ error: 'Job not found' });
  }
  markJobCanceled(id);
  res.json({ success: true });
});

app.get('/screenshot-jobs/:id/stream', authMiddleware, requireApiKey, (req, res) => {
  const { id } = req.params;
  const includeResult = req.query.include_result !== 'false';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const sendEvent = (event, data) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const interval = setInterval(() => {
    if (closed) {
      clearInterval(interval);
      return;
    }
    const row = getJobRow(id);
    if (!row || row.type !== JOB_TYPES.screenshot) {
      sendEvent('error', { error: 'Job not found' });
      clearInterval(interval);
      res.end();
      return;
    }
    const job = serializeJobRow(row, includeResult);
    sendEvent('update', job);
    if ([JOB_STATUS.complete, JOB_STATUS.failed, JOB_STATUS.canceled].includes(job.status)) {
      sendEvent('complete', job);
      clearInterval(interval);
      res.end();
    }
  }, 1000);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit();
});

if (RUN_WEB) {
  app.listen(PORT, () => {
    console.log(`Map Mat Backend running on http://localhost:${PORT}`);
  });
}
