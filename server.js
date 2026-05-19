/**
 * MAP MAT BACKEND SERVER - PORT 4002
 * Visual sitemap generator with user accounts, projects, and sharing.
 *
 * Run:
 *   cd vellic
 *   npm i
 *   node server.js
 */

const express = require('express');
const http = require('http');
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
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/ms-playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/ms-playwright';
}
const { chromium } = require('playwright');
const dns = require('dns').promises;
const net = require('net');
const { probePostgres } = require('./utils/postgresProbe');
const jobStore = require('./stores/jobStore');
const mapStore = require('./stores/mapStore');
const imageAssetStore = require('./stores/imageAssetStore');
const pageStore = require('./stores/pageStore');
const usageStore = require('./stores/usageStore');
const permissionPolicy = require('./policies/permissionPolicy');
const emailDeliveryStore = require('./stores/emailDeliveryStore');
const { getCoeditingHealthSnapshotAsync } = require('./utils/coeditingObservability');
const {
  createExpressSentryErrorMiddleware,
  installBackendSentryProcessHandlers,
  isBackendSentryEnabled,
} = require('./utils/sentryBackend');
const {
  summarizeCoeditingRolloutConfigAsync,
  resolveCoeditingSystemStatusAsync,
} = require('./utils/coeditingRollout');
const { buildHealthSnapshot: getEmailHealthSnapshot } = require('./utils/emailProvider');
const { JOB_TYPES: EMAIL_JOB_TYPES, processEmailDeliveryJobAsync } = require('./utils/emailDelivery');
const { AVATAR_PUBLIC_BASE, AVATAR_STORAGE_DIR } = require('./utils/avatarStorage');
const { FEEDBACK_PUBLIC_BASE, FEEDBACK_STORAGE_DIR } = require('./utils/feedbackStorage');
const {
  extractSeoMetadata,
  getPrimaryDescription,
  getPrimaryMetaTags,
} = require('./utils/scanMetadata');
const {
  classifyScanResponse,
  getUrlFallbackTitle,
} = require('./utils/scanPageClassification');
const {
  collectImageCaptureRecords,
  buildImageCapturePhases,
} = require('./utils/imageCapturePlan');
const {
  SCREENSHOT_LOCAL_DIR,
  SCREENSHOT_PUBLIC_BASE,
  buildPublicUrl,
  extractScreenshotStorageKey,
  getContentTypeForKey,
  getScreenshotStorageProvider,
  listLocalScreenshotFiles,
  readScreenshotObject,
  removeLocalScreenshotFile,
  saveScreenshotJson,
  saveScreenshotObject,
  statScreenshotObject,
} = require('./utils/screenshotStorage');

// Initialize database (creates tables if needed)
const db = require('./db');

// Import routes
const { router: authRouter, authMiddleware, requireAuth } = require('./routes/auth');
const apiRouter = require('./routes/api');
const adminRouter = require('./routes/admin');
const collaborationRouter = require('./routes/collaboration');
const realtimeRouter = require('./routes/realtime');
const coeditingRouter = require('./routes/coediting');
const emailWebhookRouter = require('./routes/emailWebhooks');
const { attachCoeditingTransport } = require('./utils/coeditingTransport');

const app = express();
const isProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_PUBLIC_DOMAIN;
const RUN_MODE = process.env.RUN_MODE || 'both'; // 'web' | 'worker' | 'both'
const RUN_WEB = RUN_MODE === 'both' || RUN_MODE === 'web';
const RUN_WORKER = RUN_MODE === 'both' || RUN_MODE === 'worker';
const REQUEST_JSON_LIMIT = process.env.REQUEST_JSON_LIMIT || '25mb';
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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use('/api/email/webhooks', emailWebhookRouter);
app.use(express.json({ limit: REQUEST_JSON_LIMIT }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'This map is too large to save right now. Please try again after image capture finishes.',
      code: 'REQUEST_BODY_TOO_LARGE',
    });
  }
  if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({ error: 'Invalid JSON request body' });
  }
  return next(err);
});

const SCREENSHOT_DIR = SCREENSHOT_LOCAL_DIR;
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
app.get(`${SCREENSHOT_PUBLIC_BASE}/:filename`, async (req, res) => {
  try {
    const key = extractScreenshotStorageKey(req.params.filename);
    if (!key) return res.status(404).send('Not found');

    const object = await readScreenshotObject(key);
    if (!object?.buffer?.length) return res.status(404).send('Not found');

    res.setHeader('Content-Type', object.contentType || getContentTypeForKey(key));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(object.buffer);
  } catch (error) {
    console.warn('Screenshot asset read error:', error.message);
    return res.status(404).send('Not found');
  }
});
app.use(AVATAR_PUBLIC_BASE, express.static(AVATAR_STORAGE_DIR));
app.use(FEEDBACK_PUBLIC_BASE, express.static(FEEDBACK_STORAGE_DIR));

// Mount routes
app.use('/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api', apiRouter);
registerImageCaptureRoutes(app);
app.use('/api', collaborationRouter);
app.use('/api', realtimeRouter);
app.use('/api', coeditingRouter);

const PORT = process.env.PORT || 4002;
const HOST = String(process.env.HOST || '').trim();
const DB_RUNTIME = db.runtime || {
  requestedProvider: (process.env.DB_PROVIDER || 'sqlite').trim().toLowerCase(),
  activeProvider: 'sqlite',
  supportedProviders: ['sqlite'],
  fallback: false,
};
const DB_PROVIDER = DB_RUNTIME.activeProvider;
const EMAIL_HEALTH = getEmailHealthSnapshot();
console.log(`[email] provider=${EMAIL_HEALTH.provider} configured=${EMAIL_HEALTH.providerConfigured ? 'yes' : 'no'} appBaseUrl=${EMAIL_HEALTH.appBaseUrl}`);
console.log(`[monitoring] backend_sentry=${isBackendSentryEnabled() ? 'enabled' : 'disabled'}`);
installBackendSentryProcessHandlers();

// Browser instance for screenshots
let browser = null;
const SCAN_LIMITS = {
  maxDepthDefault: Number(process.env.SCAN_MAX_DEPTH_DEFAULT ?? 6),
  maxDepthHard: Number(process.env.SCAN_MAX_DEPTH_HARD ?? 25),
  maxPagesDefault: Math.max(1, Number(process.env.SCAN_JOB_MAX_PAGES_DEFAULT ?? 5000)),
};
const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};
const toBoundedNumber = (value, { min, max, fallback }) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};
const SCAN_PAGE_CONCURRENCY = Math.max(
  1,
  toPositiveInt(process.env.SCAN_PAGE_CONCURRENCY, isProd ? 6 : 8)
);
const SCAN_BROKEN_LINK_CONCURRENCY = Math.max(
  1,
  toPositiveInt(process.env.SCAN_BROKEN_LINK_CONCURRENCY, isProd ? 8 : 10)
);
const SCAN_API_KEY = process.env.SCAN_API_KEY || null;
const ALLOW_PRIVATE_NETWORKS = process.env.ALLOW_PRIVATE_NETWORKS === 'true'
  || (!isProd && process.env.ALLOW_PRIVATE_NETWORKS !== 'false');
const SCAN_RATE_WINDOW_MS = Number(process.env.SCAN_RATE_WINDOW_MS ?? (isProd ? 60000 : 10000));
const SCAN_RATE_LIMIT = Number(process.env.SCAN_RATE_LIMIT ?? (isProd ? 60 : 120));
const SCREENSHOT_QUEUE_MAX = Number(process.env.SCREENSHOT_QUEUE_MAX ?? (isProd ? 25 : 100));
const SCREENSHOT_MIN_GAP_MS = Number(
  process.env.SCREENSHOT_MIN_GAP_MS ?? (isProd ? 500 : 150)
);
const SCREENSHOT_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.SCREENSHOT_MAX_CONCURRENCY ?? (isProd ? 3 : 6))
);
const SCREENSHOT_CAPTURE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.SCREENSHOT_CAPTURE_TIMEOUT_MS ?? 45000)
);
const SCREENSHOT_THUMB_CAPTURE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.SCREENSHOT_THUMB_CAPTURE_TIMEOUT_MS ?? 20000)
);
const SCREENSHOT_CACHE_TTL_MS = Math.max(
  60000,
  Number(process.env.SCREENSHOT_CACHE_TTL_MS ?? 604800000)
);
const SCREENSHOT_FULL_MAX_HEIGHT = Math.max(
  720,
  Number(process.env.SCREENSHOT_FULL_MAX_HEIGHT ?? 12000)
);
const SCREENSHOT_FULL_MAX_WIDTH = Math.max(
  320,
  Number(process.env.SCREENSHOT_FULL_MAX_WIDTH ?? 1920)
);
const SCREENSHOT_FULL_VIEWPORT_WIDTH = Math.max(
  1280,
  Number(process.env.SCREENSHOT_FULL_VIEWPORT_WIDTH ?? 1280)
);
const SCREENSHOT_FULL_VIEWPORT_HEIGHT = Math.max(
  720,
  Number(process.env.SCREENSHOT_FULL_VIEWPORT_HEIGHT ?? 720)
);
const SCREENSHOT_THUMB_VIEWPORT_WIDTH = Math.max(
  640,
  Number(process.env.SCREENSHOT_THUMB_VIEWPORT_WIDTH ?? 1280)
);
const SCREENSHOT_THUMB_VIEWPORT_HEIGHT = Math.max(
  360,
  Number(process.env.SCREENSHOT_THUMB_VIEWPORT_HEIGHT ?? 720)
);
const SCREENSHOT_CANVAS_THUMB_WIDTH = Math.max(
  160,
  Number(process.env.SCREENSHOT_CANVAS_THUMB_WIDTH ?? 360)
);
const SCREENSHOT_CANVAS_THUMB_HEIGHT = Math.max(
  90,
  Number(process.env.SCREENSHOT_CANVAS_THUMB_HEIGHT ?? 203)
);
const SCREENSHOT_THUMB_DEVICE_SCALE_FACTOR = Math.max(
  1,
  Number(process.env.SCREENSHOT_THUMB_DEVICE_SCALE_FACTOR ?? 1.5)
);
const SCREENSHOT_FULL_DEVICE_SCALE_FACTOR = Math.max(
  1,
  Number(process.env.SCREENSHOT_FULL_DEVICE_SCALE_FACTOR ?? 1.5)
);
const SCREENSHOT_FULL_JPEG_QUALITY = Math.round(toBoundedNumber(
  process.env.SCREENSHOT_FULL_JPEG_QUALITY,
  { min: 60, max: 92, fallback: 88 }
));
const IMAGE_CAPTURE_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.IMAGE_CAPTURE_MAX_ATTEMPTS ?? 3)
);
const IMAGE_CAPTURE_RETRY_BASE_DELAY_MS = Math.max(
  100,
  Number(process.env.IMAGE_CAPTURE_RETRY_BASE_DELAY_MS ?? 800)
);
const IMAGE_CAPTURE_ASSET_SAVE_BATCH_SIZE = Math.max(
  1,
  Number(process.env.IMAGE_CAPTURE_ASSET_SAVE_BATCH_SIZE ?? 12)
);
const IMAGE_CAPTURE_PROGRESS_RESULT_LIMIT = Math.max(
  100,
  Number(process.env.IMAGE_CAPTURE_PROGRESS_RESULT_LIMIT ?? 2000)
);
const SCREENSHOT_THUMB_PREVIEW_JPEG_QUALITY = Math.round(toBoundedNumber(
  process.env.SCREENSHOT_THUMB_PREVIEW_JPEG_QUALITY,
  { min: 60, max: 92, fallback: 84 }
));
const SCREENSHOT_NETWORK_SETTLE_TIMEOUT_MS = Math.max(
  250,
  Number(process.env.SCREENSHOT_NETWORK_SETTLE_TIMEOUT_MS ?? 1200)
);
const SCREENSHOT_FULL_WARMUP_MAX_STOPS = Math.max(
  2,
  Number(process.env.SCREENSHOT_FULL_WARMUP_MAX_STOPS ?? 8)
);
const SCREENSHOT_FULL_WARMUP_STEP_PX = Math.max(
  720,
  Number(process.env.SCREENSHOT_FULL_WARMUP_STEP_PX ?? 1800)
);
const SCREENSHOT_CLEANUP_INTERVAL_MS = Math.max(
  10000,
  Number(process.env.SCREENSHOT_CLEANUP_INTERVAL_MS ?? 300000)
);
const SCREENSHOT_CLEANUP_MAX_FILES = Math.max(
  1,
  Number(process.env.SCREENSHOT_CLEANUP_MAX_FILES ?? 50)
);
const screenshotQueue = [];
let screenshotActive = 0;
const lastScreenshotByHost = new Map();
let screenshotLastCleanupAt = 0;
let screenshotProtectedFilenames = new Set();
let screenshotProtectedFilenamesLoadedAt = 0;

const SCREENSHOT_TYPES = Object.freeze({
  full: 'full',
  thumb: 'thumb',
});
const IMAGE_CAPTURE_TARGET_MODES = Object.freeze({
  remaining: 'remaining',
  captured: 'captured',
});
const SCREENSHOT_META_SUFFIX = '.meta.json';
const SCREENSHOT_CAPTURE_CACHE_VERSION = 'v12';
const SCREENSHOT_ASSET_FILENAME_PATTERN = /^[a-f0-9]{64}_(?:full|thumb|thumb_preview|thumb_small|full_thumb|full_viewport)_v\d+\.(?:jpe?g|png|webp)$/i;
const SCREENSHOT_BLOCKED_RESOURCE_TYPES = new Set(['media', 'eventsource', 'websocket']);
const SCREENSHOT_BLOCKED_URL_PATTERN = /(?:google-analytics|googletagmanager|doubleclick|facebook\.com\/tr|connect\.facebook\.net|hotjar|segment\.io|fullstory|clarity\.ms|sentry\.io|datadoghq-browser-agent|newrelic|amplitude\.com|mixpanel\.com)/i;

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

const normalizeMaxPagesLimit = (value, fallback = null) => {
  const raw = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(1, Math.floor(raw));
};

const normalizeScanDepthLimit = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_DEPTH;
  return Math.min(Math.max(Math.floor(parsed), 1), SCAN_LIMITS.maxDepthHard);
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
const getJobAccessToken = (req) => (
  req.get('x-job-access-token')
  || req.query?.access_token
  || req.body?.access_token
  || null
);
const hashIp = (ip) => (ip ? crypto.createHash('sha256').update(ip).digest('hex') : null);

const recordUsage = (req, eventType, quantity = 1, meta = null) => {
  const userId = req.user?.id || null;
  const apiKey = getApiKey(req);
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  usageStore.insertUsageEventAsync({
    id: crypto.randomUUID(),
    userId,
    apiKey,
    ipHash,
    eventType,
    quantity,
    meta,
  }).catch((error) => {
    console.warn('Usage record error:', error.message);
  });
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

const checkUsageLimit = async (req, eventType) => {
  const limit = getUsageLimit(eventType);
  if (!limit) return { allowed: true };

  const identity = getUsageIdentity(req);
  if (!identity) return { allowed: true };

  const used = await usageStore.getUsageTotalForWindowAsync({
    eventType,
    identityColumn: identity.column,
    identityValue: identity.value,
    windowHours: USAGE_WINDOW_HOURS,
  });

  if (used >= limit) {
    return { allowed: false, limit, used };
  }

  return { allowed: true, limit, used };
};

const enforceUsageLimit = (eventType) => async (req, res, next) => {
  const check = await checkUsageLimit(req, eventType);
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

const normalizeScreenshotType = (type) => {
  const normalized = String(type || '').trim().toLowerCase();
  if (!normalized) return SCREENSHOT_TYPES.full;
  if (normalized === SCREENSHOT_TYPES.full || normalized === SCREENSHOT_TYPES.thumb) {
    return normalized;
  }
  return null;
};

const normalizeImageCaptureTargetMode = (mode) => {
  const normalized = String(mode || '').trim().toLowerCase();
  if (!normalized) return IMAGE_CAPTURE_TARGET_MODES.remaining;
  if (
    normalized === IMAGE_CAPTURE_TARGET_MODES.remaining
    || normalized === IMAGE_CAPTURE_TARGET_MODES.captured
  ) {
    return normalized;
  }
  return null;
};

const isJobVisibleToRequest = (row, req) => {
  if (!row) return false;
  const jobAccessToken = getJobAccessToken(req);
  const rowAccessToken = getJobPayload(row)?.accessToken || null;
  const userId = req.user?.id || null;
  const apiKey = getApiKey(req);
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  if (rowAccessToken && jobAccessToken) {
    return rowAccessToken === jobAccessToken;
  }
  if (row.user_id && userId) {
    return row.user_id === userId;
  }
  if (row.api_key && apiKey) {
    return row.api_key === apiKey;
  }
  if (row.ip_hash && ipHash) {
    return row.ip_hash === ipHash;
  }
  return false;
};

const refreshProtectedScreenshotFilenames = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && now - screenshotProtectedFilenamesLoadedAt < SCREENSHOT_CLEANUP_INTERVAL_MS) {
    return screenshotProtectedFilenames;
  }
  try {
    const filenames = await mapStore.listPersistedScreenshotFilenamesAsync();
    screenshotProtectedFilenames = new Set(filenames || []);
    screenshotProtectedFilenamesLoadedAt = now;
  } catch (error) {
    console.warn('Screenshot reference refresh error:', error.message);
  }
  return screenshotProtectedFilenames;
};

const cleanupStaleScreenshots = async () => {
  const now = Date.now();
  if (now - screenshotLastCleanupAt < SCREENSHOT_CLEANUP_INTERVAL_MS) return;
  screenshotLastCleanupAt = now;
  const protectedFilenames = await refreshProtectedScreenshotFilenames();

  let entries = [];
  try {
    entries = await listLocalScreenshotFiles();
  } catch (error) {
    console.warn('Screenshot cleanup read error:', error.message);
    return;
  }

  let deleted = 0;
  for (const entry of entries) {
    if (deleted >= SCREENSHOT_CLEANUP_MAX_FILES) break;
    if (!entry.isFile()) continue;
    if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
    if (protectedFilenames.has(entry.name)) continue;

    try {
      const filepath = path.join(SCREENSHOT_DIR, entry.name);
      const stats = fs.statSync(filepath);
      const ageMs = now - stats.mtimeMs;
      if (ageMs <= SCREENSHOT_CACHE_TTL_MS) continue;
      await removeLocalScreenshotFile(entry.name);
      const metaPath = path.join(SCREENSHOT_DIR, `${entry.name}${SCREENSHOT_META_SUFFIX}`);
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }
      deleted += 1;
    } catch {
      // Ignore stale file races and permission edge-cases.
    }
  }
};

function readScreenshotMeta(metaPath) {
  try {
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getScreenshotAssetFilename(value) {
  const filename = extractScreenshotStorageKey(value);
  return SCREENSHOT_ASSET_FILENAME_PATTERN.test(filename) ? filename : '';
}

async function validateScreenshotAssetUrl(value) {
  const filename = getScreenshotAssetFilename(value);
  if (!filename) {
    return { available: false, reason: 'not_screenshot_asset' };
  }
  const stats = await statScreenshotObject(filename);
  if (stats) {
    const isFile = typeof stats.isFile === 'function' ? stats.isFile() : true;
    return {
      available: isFile && Number(stats.size || 0) > 0,
      filename,
      size: stats.size || 0,
      contentType: stats.contentType || getContentTypeForKey(filename),
      provider: getScreenshotStorageProvider(),
    };
  }
  return {
    available: false,
    filename,
    provider: getScreenshotStorageProvider(),
    reason: 'missing_file',
  };
}

function writeScreenshotMeta(metaPath, value) {
  try {
    fs.writeFileSync(metaPath, JSON.stringify(value, null, 2), 'utf8');
  } catch (error) {
    console.warn('Screenshot metadata write error:', error.message);
  }
}

async function saveAndVerifyScreenshotFile({ filename, filepath, baseUrl }) {
  const key = getScreenshotAssetFilename(filename);
  if (!key) throw new Error('Invalid screenshot asset filename');
  const buffer = await fs.promises.readFile(filepath);
  const url = await saveScreenshotObject({
    key,
    buffer,
    contentType: getContentTypeForKey(key),
    baseUrl,
  });
  const stats = await statScreenshotObject(key);
  if (!stats || Number(stats.size || 0) <= 0) {
    throw new Error('Saved screenshot asset could not be verified');
  }
  return {
    key,
    url,
    size: stats.size || buffer.length,
    contentType: stats.contentType || getContentTypeForKey(key),
  };
}

async function saveAndVerifyScreenshotMeta({ key, value, baseUrl }) {
  await saveScreenshotJson({ key, value, baseUrl });
  const stats = await statScreenshotObject(key);
  return Boolean(stats && Number(stats.size || 0) > 0);
}

async function resizeScreenshotForCanvas(context, sourcePath, targetPath) {
  const source = fs.readFileSync(sourcePath);
  const sourceMime = /\.jpe?g$/i.test(sourcePath) ? 'image/jpeg' : 'image/png';
  const sourceDataUrl = `data:${sourceMime};base64,${source.toString('base64')}`;
  let resizePage = null;
  try {
    resizePage = await context.newPage();
    const resizedDataUrl = await resizePage.evaluate(async ({ dataUrl, width, height }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
      const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
      const targetRatio = width / height;
      const sourceRatio = sourceWidth / sourceHeight;
      let cropX = 0;
      let cropY = 0;
      let cropWidth = sourceWidth;
      let cropHeight = sourceHeight;
      if (sourceRatio > targetRatio) {
        cropWidth = sourceHeight * targetRatio;
        cropX = (sourceWidth - cropWidth) / 2;
      } else if (sourceRatio < targetRatio) {
        cropHeight = sourceWidth / targetRatio;
        cropY = 0;
      }
      ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.74);
    }, {
      dataUrl: sourceDataUrl,
      width: SCREENSHOT_CANVAS_THUMB_WIDTH,
      height: SCREENSHOT_CANVAS_THUMB_HEIGHT,
    });
    const [, payload] = resizedDataUrl.split(',');
    fs.writeFileSync(targetPath, Buffer.from(payload || '', 'base64'));
  } finally {
    if (resizePage) {
      await resizePage.close().catch(() => {});
    }
  }
}

async function installScreenshotRequestFilters(page) {
  await page.route('**/*', (route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    const requestUrl = request.url();
    if (
      SCREENSHOT_BLOCKED_RESOURCE_TYPES.has(resourceType)
      || SCREENSHOT_BLOCKED_URL_PATTERN.test(requestUrl)
    ) {
      return route.abort().catch(() => {});
    }
    return route.continue().catch(() => {});
  });
}

const JOB_TYPES = {
  scan: 'scan',
  screenshot: 'screenshot',
  imageCapture: 'image_capture',
  discovery: 'discovery',
  email: EMAIL_JOB_TYPES.EMAIL,
};
const normalizeBackgroundJobType = (value) => {
  const type = String(value || '').trim();
  if (!type) return '';
  if (type === 'image-capture' || type === 'imageCapture') return JOB_TYPES.imageCapture;
  return type;
};
const ALL_BACKGROUND_JOB_TYPES = Object.freeze(Object.values(JOB_TYPES));
const getAllowedJobTypesForRunMode = () => {
  if (process.env.ALLOW_CROSS_MODE_JOB_TYPES === 'true') {
    return ALL_BACKGROUND_JOB_TYPES;
  }
  if (RUN_MODE === 'worker') return [JOB_TYPES.screenshot, JOB_TYPES.imageCapture];
  if (RUN_MODE === 'web') return [JOB_TYPES.scan, JOB_TYPES.discovery, JOB_TYPES.email, JOB_TYPES.imageCapture];
  return ALL_BACKGROUND_JOB_TYPES;
};
const ALLOWED_JOB_TYPES_FOR_RUN_MODE = getAllowedJobTypesForRunMode();
const parseJobWorkerTypes = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.toLowerCase() === 'all') return ALLOWED_JOB_TYPES_FOR_RUN_MODE;
  const requested = raw
    .split(',')
    .map((part) => normalizeBackgroundJobType(part))
    .filter(Boolean);
  const allowed = requested.filter((type) => ALLOWED_JOB_TYPES_FOR_RUN_MODE.includes(type));
  return allowed.length > 0 ? allowed : null;
};
const DEFAULT_JOB_WORKER_TYPES = RUN_MODE === 'worker'
  ? [JOB_TYPES.screenshot, JOB_TYPES.imageCapture]
  : (RUN_MODE === 'web'
    ? [JOB_TYPES.scan, JOB_TYPES.discovery, JOB_TYPES.email, JOB_TYPES.imageCapture]
    : ALL_BACKGROUND_JOB_TYPES);
const normalizeJobWorkerTypes = (types) => {
  const normalized = Array.isArray(types) && types.length > 0 ? [...types] : [...DEFAULT_JOB_WORKER_TYPES];
  if (ALLOWED_JOB_TYPES_FOR_RUN_MODE.includes(JOB_TYPES.imageCapture) && !normalized.includes(JOB_TYPES.imageCapture)) {
    normalized.push(JOB_TYPES.imageCapture);
  }
  return normalized;
};
const JOB_WORKER_TYPES = normalizeJobWorkerTypes(parseJobWorkerTypes(process.env.JOB_WORKER_TYPES));
const JOB_STATUS = {
  queued: 'queued',
  running: 'running',
  stopping: 'stopping',
  complete: 'complete',
  failed: 'failed',
  canceled: 'canceled',
};
const JOB_POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? (isProd ? 1000 : 500));
const JOB_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.JOB_MAX_CONCURRENCY ?? (isProd ? 1 : 2))
);
const SCREENSHOT_ACTIVE_LIMIT_PER_IDENTITY = Math.max(
  1,
  Number(process.env.SCREENSHOT_ACTIVE_LIMIT_PER_IDENTITY ?? (isProd ? 50 : 200))
);
const SCREENSHOT_ACTIVE_LIMIT_PER_HOST = Math.max(
  1,
  Number(process.env.SCREENSHOT_ACTIVE_LIMIT_PER_HOST ?? (isProd ? 25 : 100))
);
const SCREENSHOT_ACTIVE_LIMIT_GLOBAL = Math.max(
  1,
  Number(process.env.SCREENSHOT_ACTIVE_LIMIT_GLOBAL ?? (isProd ? 500 : 2000))
);
const SCREENSHOT_QUEUE_LIMIT_WINDOW_MS = Math.max(
  60000,
  Number(process.env.SCREENSHOT_QUEUE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000)
);

const parseJsonSafe = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const sanitizeJobPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'accessToken')) return payload;
  const { accessToken, ...safePayload } = payload;
  return safePayload;
};

const getJobPayload = (row) => parseJsonSafe(row?.payload) || {};

const serializeJobRow = (row, includeResult = true) => {
  if (!row) return null;
  const payload = getJobPayload(row);
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    payload: sanitizeJobPayload(payload),
    progress: parseJsonSafe(row.progress),
    result: includeResult ? parseJsonSafe(row.result) : null,
    error: row.error || null,
  };
};

const getJobRow = (id) => jobStore.getJobByIdAsync(id);

const findActiveDiscoveryJob = async (mapId) => {
  const rows = await jobStore.listJobPayloadsByTypeAndStatusesAsync(
    JOB_TYPES.discovery,
    [JOB_STATUS.queued, JOB_STATUS.running]
  );

  for (const row of rows) {
    const payload = getJobPayload(row);
    if (payload.mapId === mapId || payload.id === mapId) {
      return row.id;
    }
  }
  return null;
};

const findActiveImageCaptureJob = async (mapId, captureType) => {
  const rows = await jobStore.listJobPayloadsByTypeAndStatusesAsync(
    JOB_TYPES.imageCapture,
    [JOB_STATUS.queued, JOB_STATUS.running, JOB_STATUS.stopping]
  );

  for (const row of rows) {
    const payload = getJobPayload(row);
    if (payload.mapId === mapId && payload.captureType === captureType) {
      return row.id;
    }
  }
  return null;
};

const getRequestJobIdentity = (req) => {
  const userId = req.user?.id || null;
  if (userId) return { column: 'user_id', value: userId };
  const apiKey = getApiKey(req);
  if (apiKey) return { column: 'api_key', value: apiKey };
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  if (ipHash) return { column: 'ip_hash', value: ipHash };
  return null;
};

const enforceScreenshotJobQueueLimits = async (req, safeUrl) => {
  const rows = await jobStore.listJobPayloadsByTypeAndStatusesAsync(
    JOB_TYPES.screenshot,
    [JOB_STATUS.queued, JOB_STATUS.running, JOB_STATUS.stopping]
  );
  const cutoff = Date.now() - SCREENSHOT_QUEUE_LIMIT_WINDOW_MS;
  const activeRows = (rows || []).filter((row) => {
    const timestamp = row.started_at || row.created_at;
    const timeMs = timestamp ? new Date(timestamp).getTime() : Date.now();
    return Number.isFinite(timeMs) && timeMs >= cutoff;
  });
  const host = new URL(safeUrl).hostname;
  const identity = getRequestJobIdentity(req);
  let identityCount = 0;
  let hostCount = 0;

  (activeRows || []).forEach((row) => {
    const payload = getJobPayload(row);
    let payloadHost = payload.host || null;
    if (!payloadHost && payload.url) {
      try {
        payloadHost = new URL(payload.url).hostname;
      } catch {
        payloadHost = null;
      }
    }
    if (payloadHost === host) {
      hostCount += 1;
    }
    if (identity && row[identity.column] === identity.value) {
      identityCount += 1;
    }
  });

  if ((activeRows || []).length >= SCREENSHOT_ACTIVE_LIMIT_GLOBAL) {
    const error = new Error('Screenshot queue is busy. Try again shortly.');
    error.status = 429;
    throw error;
  }
  if (identity && identityCount >= SCREENSHOT_ACTIVE_LIMIT_PER_IDENTITY) {
    const error = new Error('You already have many screenshots queued. Let some finish before starting more.');
    error.status = 429;
    throw error;
  }
  if (hostCount >= SCREENSHOT_ACTIVE_LIMIT_PER_HOST) {
    const error = new Error('This website already has many screenshots queued. Let some finish before starting more.');
    error.status = 429;
    throw error;
  }
};

const createJob = async ({ type, payload, req }) => {
  const id = crypto.randomUUID();
  const userId = req.user?.id || null;
  const apiKey = getApiKey(req);
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  await jobStore.insertJobAsync({
    id,
    type,
    status: JOB_STATUS.queued,
    userId,
    apiKey,
    ipHash,
    payload: JSON.stringify(payload || {}),
  });

  return id;
};

let activeJobs = 0;

const takeNextJob = () => jobStore.takeNextQueuedJobAsync({
  queuedStatus: JOB_STATUS.queued,
  stoppingStatus: JOB_STATUS.stopping,
  runningStatus: JOB_STATUS.running,
  types: JOB_WORKER_TYPES,
});

const updateJobProgress = async (id, progress) => {
  await jobStore.updateJobProgressAsync(id, JSON.stringify(progress));
};

const markJobComplete = async (id, result) => {
  await jobStore.markJobCompleteAsync(id, JOB_STATUS.complete, JSON.stringify(result || {}));
};

const normalizeJobErrorMessage = (error) => {
  const message = error?.message || String(error || 'Job failed');
  if (message.includes('Executable') && message.includes('ms-playwright')) {
    return 'Screenshots are not available in this environment.';
  }
  return message;
};

const markJobFailed = async (id, error) => {
  await jobStore.markJobFailedAsync(
    id,
    JOB_STATUS.failed,
    normalizeJobErrorMessage(error)
  );
};

const markJobCanceled = async (id) => {
  await jobStore.markJobCanceledAsync(
    id,
    JOB_STATUS.canceled,
    JOB_STATUS.queued,
    JOB_STATUS.running
  );
};

const markJobStopping = async (id) => {
  await jobStore.markJobStoppingAsync(
    id,
    JOB_STATUS.stopping,
    JOB_STATUS.queued,
    JOB_STATUS.running
  );
};

const createJobStatusReader = (id, throttleMs = 1000) => {
  let lastCheck = 0;
  let lastStatus = null;
  return async () => {
    const now = Date.now();
    if (
      lastStatus
      && [JOB_STATUS.canceled, JOB_STATUS.stopping, JOB_STATUS.complete, JOB_STATUS.failed].includes(lastStatus)
    ) {
      return lastStatus;
    }
    if (now - lastCheck < throttleMs) return lastStatus;
    lastCheck = now;
    lastStatus = await jobStore.getJobStatusAsync(id);
    return lastStatus;
  };
};

const shouldAbortJob = (id, throttleMs = 1000) => {
  const readStatus = createJobStatusReader(id, throttleMs);
  return async () => {
    return (await readStatus()) === JOB_STATUS.canceled;
  };
};

const IMAGE_CAPTURE_STRING_FIELDS = new Set([
  'thumbnailUrl',
  'thumbnailFullUrl',
  'fullScreenshotUrl',
  'thumbnailCaptureError',
  'thumbnailCaptureFailedAt',
]);

const IMAGE_CAPTURE_BOOLEAN_FIELDS = new Set([
  'authRequired',
  'thumbnailCaptureFailed',
  'fullScreenshotTruncated',
]);

function normalizeImageCaptureType(value) {
  return normalizeScreenshotType(value) || SCREENSHOT_TYPES.thumb;
}

function normalizeImageCaptureAssetUpdates(assetUpdates = {}) {
  const normalized = {};
  Object.entries(assetUpdates || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    if (IMAGE_CAPTURE_STRING_FIELDS.has(key)) {
      if (value === null) {
        normalized[key] = null;
        return;
      }
      const nextValue = String(value || '').trim();
      normalized[key] = nextValue || null;
      return;
    }
    if (IMAGE_CAPTURE_BOOLEAN_FIELDS.has(key)) {
      normalized[key] = Boolean(value);
    }
  });
  return normalized;
}

function applyImageCaptureUpdatesToTree(node, updatesById, result) {
  if (!node || typeof node !== 'object') return node;

  let nextNode = node;
  const patch = updatesById.get(String(node.id || ''));
  if (patch) {
    nextNode = { ...node };
    Object.entries(patch).forEach(([key, value]) => {
      if (nextNode[key] !== value) {
        nextNode[key] = value;
        result.changed = true;
      }
    });
    result.updatedNodeIds.add(String(node.id));
  }

  if (Array.isArray(node.children)) {
    let childrenChanged = false;
    const nextChildren = node.children.map((child) => {
      const nextChild = applyImageCaptureUpdatesToTree(child, updatesById, result);
      if (nextChild !== child) childrenChanged = true;
      return nextChild;
    });
    if (childrenChanged) {
      if (nextNode === node) nextNode = { ...node };
      nextNode.children = nextChildren;
      result.changed = true;
    }
  }

  return nextNode;
}

function applyImageCaptureUpdatesToMapData({ root, orphans, updatesById }) {
  const result = { changed: false, updatedNodeIds: new Set() };
  const nextRoot = applyImageCaptureUpdatesToTree(root, updatesById, result);
  const nextOrphans = Array.isArray(orphans)
    ? orphans.map((orphan) => applyImageCaptureUpdatesToTree(orphan, updatesById, result))
    : [];
  return {
    root: nextRoot,
    orphans: nextOrphans,
    changed: result.changed,
    updatedNodeIds: Array.from(result.updatedNodeIds),
  };
}

async function persistImageCaptureNodeAssets({ mapId, nodeId, assetUpdates }) {
  const result = await persistImageCaptureNodeAssetBatch({
    mapId,
    updates: [{ nodeId, assets: assetUpdates }],
  });
  return {
    updated: result.verifiedEntries.length > 0,
    updatedNodeIds: result.verifiedEntries.map((entry) => entry.nodeId),
    root: result.root,
    orphans: result.orphans,
  };
}

function flattenImageCaptureNodes(root, orphans = []) {
  const nodesById = new Map();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const nodeId = String(node.id || '').trim();
    if (nodeId) nodesById.set(nodeId, node);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(root);
  if (Array.isArray(orphans)) orphans.forEach(visit);
  return nodesById;
}

function imageCaptureAssetPatchMatchesNode(node, assets) {
  if (!node || !assets || typeof assets !== 'object') return false;
  return Object.entries(assets).every(([key, value]) => {
    if (value === undefined) return true;
    if (value === null) return node[key] === null || node[key] === undefined || node[key] === '';
    return node[key] === value;
  });
}

const IMAGE_CAPTURE_ASSET_URL_FIELDS = new Set([
  'thumbnailUrl',
  'thumbnailFullUrl',
  'fullScreenshotUrl',
]);

function getImageCaptureAssetManifestType(assetField, assets) {
  if (assetField === 'fullScreenshotUrl') return 'full';
  if (assetField === 'thumbnailFullUrl') return 'thumbnail_preview';
  if (assetField === 'thumbnailUrl' && assets?.fullScreenshotUrl) return 'full_thumbnail';
  return 'thumbnail';
}

async function verifyImageCaptureAssetFields({ mapId, entry }) {
  const savedEntries = [];
  const missingFields = [];
  const urlEntries = Object.entries(entry.assets || {})
    .filter(([field, value]) => IMAGE_CAPTURE_ASSET_URL_FIELDS.has(field) && typeof value === 'string' && value.trim());

  if (urlEntries.length === 0) {
    return { ok: true, savedEntries, missingFields };
  }

  for (const [assetField, url] of urlEntries) {
    const storageKey = getScreenshotAssetFilename(url);
    const stats = storageKey ? await statScreenshotObject(storageKey) : null;
    const valid = stats && Number(stats.size || 0) > 0;
    const manifestBase = {
      mapId,
      nodeId: entry.nodeId,
      assetField,
      assetType: getImageCaptureAssetManifestType(assetField, entry.assets),
      storageKey: storageKey || null,
      url,
      provider: getScreenshotStorageProvider(),
      width: entry.meta?.width || null,
      height: entry.meta?.height || null,
      sizeBytes: stats?.size || null,
      contentType: stats?.contentType || (storageKey ? getContentTypeForKey(storageKey) : null),
      capturedAt: entry.meta?.capturedAt || new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    };
    if (!valid) {
      missingFields.push({
        ...manifestBase,
        status: 'missing',
        error: 'Missing saved asset',
      });
      continue;
    }
    savedEntries.push({
      ...manifestBase,
      status: 'saved',
      error: null,
    });
  }

  return {
    ok: missingFields.length === 0,
    savedEntries,
    missingFields,
  };
}

async function persistImageCaptureNodeAssetBatch({ mapId, updates }) {
  const normalizedEntries = (Array.isArray(updates) ? updates : [])
    .map((entry) => ({
      nodeId: String(entry?.nodeId || '').trim(),
      assets: normalizeImageCaptureAssetUpdates(entry?.assets || entry?.assetUpdates || {}),
      meta: entry?.meta || {},
    }))
    .filter((entry) => entry.nodeId && Object.keys(entry.assets).length > 0);

  if (normalizedEntries.length === 0) {
    return { changed: false, verifiedEntries: [], missingEntries: [] };
  }

  const mapRow = await mapStore.getMapByIdAsync(mapId);
  if (!mapRow) throw new Error('Map not found');

  const currentRoot = parseJsonSafe(mapRow.root_data);
  const currentOrphans = parseJsonSafe(mapRow.orphans_data) || [];
  const updatesById = new Map();
  normalizedEntries.forEach((entry) => {
    updatesById.set(entry.nodeId, {
      ...(updatesById.get(entry.nodeId) || {}),
      ...entry.assets,
    });
  });
  const nextMap = applyImageCaptureUpdatesToMapData({
    root: currentRoot,
    orphans: currentOrphans,
    updatesById,
  });

  if (nextMap.changed) {
    await mapStore.updateMapByIdAsync(mapId, {
      rootData: JSON.stringify(nextMap.root),
      orphansData: nextMap.orphans.length ? JSON.stringify(nextMap.orphans) : null,
    });
  }

  const storedMap = await mapStore.getMapByIdAsync(mapId);
  const storedRoot = parseJsonSafe(storedMap?.root_data);
  const storedOrphans = parseJsonSafe(storedMap?.orphans_data) || [];
  const storedNodesById = flattenImageCaptureNodes(storedRoot, storedOrphans);
  const mapVerifiedEntries = [];
  const missingEntries = [];
  normalizedEntries.forEach((entry) => {
    const node = storedNodesById.get(entry.nodeId);
    if (imageCaptureAssetPatchMatchesNode(node, entry.assets)) {
      mapVerifiedEntries.push(entry);
    } else {
      missingEntries.push(entry);
    }
  });

  const verifiedEntries = [];
  const manifestEntries = [];
  for (const entry of mapVerifiedEntries) {
    const assetVerification = await verifyImageCaptureAssetFields({ mapId, entry });
    manifestEntries.push(...assetVerification.savedEntries, ...assetVerification.missingFields);
    if (assetVerification.ok) {
      verifiedEntries.push(entry);
    } else {
      missingEntries.push({
        ...entry,
        storageMissing: true,
      });
    }
  }
  if (manifestEntries.length > 0) {
    await imageAssetStore.upsertImageAssetsAsync(manifestEntries);
  }

  return {
    changed: nextMap.changed,
    verifiedEntries,
    missingEntries,
    root: storedRoot,
    orphans: storedOrphans,
  };
}

async function isUsableScreenshotAsset(value) {
  return (await validateScreenshotAssetUrl(value)).available === true;
}

function isTerminalThumbnailFailure(node) {
  return Boolean(
    node?.thumbnailCaptureFailed
    && node?.authRequired
    && String(node?.thumbnailCaptureError || '').toLowerCase().includes('requires')
  );
}

function getUrlExtension(value) {
  try {
    const pathname = new URL(value).pathname || '';
    const match = pathname.match(/\.([a-z0-9]{2,8})$/i);
    return match?.[1]?.toLowerCase() || '';
  } catch {
    return '';
  }
}

function getImageCaptureSkipReason(node) {
  const orphanType = String(node?.orphanType || '').toLowerCase();
  const pageType = String(node?.pageType || node?.type || '').toLowerCase();
  const scanStatus = String(node?.scanStatus || node?.status || '').toLowerCase();
  const extension = getUrlExtension(node?.url);
  const fileExtensions = new Set([
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'zip', 'rar', '7z', 'csv', 'tsv', 'txt', 'rtf',
  ]);
  if (
    node?.isFile
    || orphanType === 'file'
    || pageType === 'file'
    || fileExtensions.has(extension)
  ) {
    return {
      status: 'skipped',
      reason: extension ? `${extension.toUpperCase()} file` : 'File link',
    };
  }

  if (node?.authRequired) {
    return { status: 'blocked', reason: 'Requires login' };
  }

  const statusCode = Number(node?.httpStatus ?? node?.statusCode);
  if (
    node?.isBroken
    || orphanType === 'broken'
    || scanStatus === 'error'
    || scanStatus === 'failed'
    || (Number.isFinite(statusCode) && statusCode >= 400)
  ) {
    return { status: 'failed', reason: 'Error page' };
  }

  if (
    node?.isInactive
    || orphanType === 'inactive'
    || scanStatus === 'inactive'
    || statusCode === 0
  ) {
    return { status: 'skipped', reason: 'Inactive page' };
  }

  return null;
}

function getImageCaptureAssetUpdates(captureType, result) {
  if (captureType === SCREENSHOT_TYPES.full) {
    const updates = {
      fullScreenshotUrl: result.url,
      fullScreenshotTruncated: Boolean(result.truncated),
      authRequired: false,
    };
    if (result.thumbnailUrl) {
      updates.thumbnailUrl = result.thumbnailUrl;
      updates.thumbnailCaptureFailed = false;
      updates.thumbnailCaptureError = null;
      updates.thumbnailCaptureFailedAt = null;
    }
    return updates;
  }

  return {
    thumbnailUrl: result.thumbnailUrl || result.url,
    thumbnailFullUrl: result.thumbnailFullUrl || result.previewUrl || result.url,
    authRequired: false,
    thumbnailCaptureFailed: false,
    thumbnailCaptureError: null,
    thumbnailCaptureFailedAt: null,
  };
}

function getImageCaptureFailureUpdates(captureType, message, { authRequired = false } = {}) {
  if (captureType !== SCREENSHOT_TYPES.thumb && !authRequired) return {};
  return {
    ...(authRequired ? { authRequired: true } : {}),
    ...(captureType === SCREENSHOT_TYPES.thumb ? {
      thumbnailCaptureFailed: true,
      thumbnailCaptureError: message || 'Thumbnail capture failed',
      thumbnailCaptureFailedAt: new Date().toISOString(),
    } : {}),
  };
}

function getImageCaptureSkipUpdates(captureType, message, { authRequired = false } = {}) {
  if (captureType !== SCREENSHOT_TYPES.thumb) return {};
  return {
    thumbnailUrl: null,
    thumbnailFullUrl: null,
    authRequired,
    thumbnailCaptureFailed: true,
    thumbnailCaptureError: message || 'Preview unavailable',
    thumbnailCaptureFailedAt: new Date().toISOString(),
  };
}

async function validateImageCaptureResult(captureType, result) {
  if (!result?.url) {
    return { ok: false, status: 'missing_asset', error: 'No screenshot URL returned' };
  }
  if (result.blocked) {
    return { ok: false, status: 'blocked', error: 'Screenshot captured a blocked page' };
  }
  if (captureType === SCREENSHOT_TYPES.full) {
    if (!/_full_v\d+\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(String(result.url || ''))) {
      return { ok: false, status: 'missing_asset', error: 'Full screenshot asset was not returned' };
    }
    if (Number.isFinite(result.width) && result.width < 1000) {
      return { ok: false, status: 'low_resolution', error: 'Full screenshot resolution was too low' };
    }
    const fullAsset = await validateScreenshotAssetUrl(result.url);
    if (!fullAsset.available) {
      return { ok: false, status: 'missing_asset', error: 'Saved full screenshot is missing' };
    }
    return { ok: true };
  }

  const smallUrl = result.thumbnailUrl || result.url;
  const previewUrl = result.thumbnailFullUrl || result.previewUrl || result.url;
  const [smallAsset, previewAsset] = await Promise.all([
    validateScreenshotAssetUrl(smallUrl),
    validateScreenshotAssetUrl(previewUrl),
  ]);
  if (!smallAsset.available || !previewAsset.available) {
    return { ok: false, status: 'missing_asset', error: 'Saved thumbnail is missing' };
  }
  return { ok: true };
}

async function buildImageCaptureTargets({
  root,
  orphans,
  captureType,
  scope,
  nodeIds,
  force,
  targetMode = IMAGE_CAPTURE_TARGET_MODES.remaining,
}) {
  const selectedIds = new Set((Array.isArray(nodeIds) ? nodeIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean));
  const records = collectImageCaptureRecords(root, orphans);
  const scopedRecords = records.filter((record) => {
    if (!record?.node?.url) return false;
    if (scope === 'selected') return selectedIds.has(record.nodeId);
    return true;
  });

  let cached = 0;
  let unavailable = 0;
  const skippedRecords = [];
  const captureRecords = [];
  const recaptureCapturedOnly = targetMode === IMAGE_CAPTURE_TARGET_MODES.captured;
  for (const record of scopedRecords) {
    if (recaptureCapturedOnly) {
      const assetUrl = captureType === SCREENSHOT_TYPES.full
        ? record.node.fullScreenshotUrl
        : record.node.thumbnailUrl;
      const hasUsableAsset = await isUsableScreenshotAsset(assetUrl);
      if (!hasUsableAsset) {
        continue;
      }
    }
    const skipReason = getImageCaptureSkipReason(record.node);
    if (skipReason) {
      if (recaptureCapturedOnly) {
        continue;
      }
      skippedRecords.push({ ...record, skipReason });
      continue;
    }
    if (force) {
      captureRecords.push(record);
      continue;
    }
    if (captureType === SCREENSHOT_TYPES.full) {
      if (await isUsableScreenshotAsset(record.node.fullScreenshotUrl)) {
        cached += 1;
        continue;
      }
      captureRecords.push(record);
      continue;
    }
    if (await isUsableScreenshotAsset(record.node.thumbnailUrl)) {
      cached += 1;
      continue;
    }
    if (isTerminalThumbnailFailure(record.node)) {
      unavailable += 1;
      continue;
    }
    captureRecords.push(record);
  }

  return {
    records,
    scopedRecords,
    captureRecords,
    skippedRecords,
    workRecords: [...captureRecords, ...skippedRecords].sort(compareImageCaptureWorkRecords),
    phases: buildImageCapturePhases(captureRecords),
    cached,
    unavailable,
  };
}

function compareImageCaptureWorkRecords(left, right) {
  const leftRecord = left?.nodeId ? left : { ...left, nodeId: left?.nodeId };
  const rightRecord = right?.nodeId ? right : { ...right, nodeId: right?.nodeId };
  if (leftRecord.groupRank !== rightRecord.groupRank) return leftRecord.groupRank - rightRecord.groupRank;
  if (leftRecord.treeIndex !== rightRecord.treeIndex) return leftRecord.treeIndex - rightRecord.treeIndex;
  if (leftRecord.depth !== rightRecord.depth) return leftRecord.depth - rightRecord.depth;
  const pathOrder = String(leftRecord.orderPath || '').localeCompare(String(rightRecord.orderPath || ''));
  if (pathOrder !== 0) return pathOrder;
  return (leftRecord.sourceIndex || 0) - (rightRecord.sourceIndex || 0);
}

function trimImageCaptureResults(results) {
  if (!Array.isArray(results)) return [];
  if (results.length <= IMAGE_CAPTURE_PROGRESS_RESULT_LIMIT) return results;
  return results.slice(results.length - IMAGE_CAPTURE_PROGRESS_RESULT_LIMIT);
}

async function getImageCaptureMapForRequest(req, mapId) {
  let map = null;
  try {
    map = await mapStore.getMapAccessibleToUserAsync(mapId, req.user.id);
  } catch (error) {
    map = await mapStore.getMapForUserAsync(mapId, req.user.id);
  }
  if (!map) return null;
  const role = permissionPolicy.resolveResourceRole({
    actorUserId: req.user.id,
    resourceOwnerUserId: map.user_id,
    membershipRole: map.membership_role || null,
  });
  if (!permissionPolicy.can(permissionPolicy.ACTIONS.MAP_UPDATE, role)) return null;
  return map;
}

async function runImageCaptureJob(jobId, payload) {
  const mapId = String(payload?.mapId || '').trim();
  if (!mapId) throw new Error('Missing mapId');

  const captureType = normalizeImageCaptureType(payload?.captureType || payload?.type);
  const scope = payload?.scope === 'selected' ? 'selected' : 'all';
  const targetMode = normalizeImageCaptureTargetMode(payload?.targetMode)
    || IMAGE_CAPTURE_TARGET_MODES.remaining;
  const force = targetMode === IMAGE_CAPTURE_TARGET_MODES.captured || scope === 'selected' || Boolean(payload?.force);
  const nodeIds = Array.isArray(payload?.nodeIds) ? payload.nodeIds : [];
  const mapRow = await mapStore.getMapByIdAsync(mapId);
  if (!mapRow) throw new Error('Map not found');

  const root = parseJsonSafe(mapRow.root_data);
  const orphans = parseJsonSafe(mapRow.orphans_data) || [];
  const targetPlan = await buildImageCaptureTargets({
    root,
    orphans,
    captureType,
    scope,
    nodeIds,
    force,
    targetMode,
  });

  const startedAt = Date.now();
  const summary = {
    mapId,
    captureType,
    scope,
    targetMode,
    total: targetPlan.captureRecords.length + targetPlan.skippedRecords.length,
    eligibleTotal: targetPlan.scopedRecords.length,
    cached: targetPlan.cached,
    unavailable: targetPlan.unavailable,
    completed: 0,
    captured: 0,
    failed: 0,
    blocked: 0,
    missingAsset: 0,
    skipped: 0,
    batchIndex: 0,
    batchTotal: targetPlan.phases.length,
    currentNodeId: null,
    assetUpdateCursor: 0,
    targetIds: targetPlan.workRecords.map((record) => record.nodeId),
    results: [],
    nodeAssetUpdates: [],
  };
  await updateJobProgress(jobId, summary);

  const readStatus = createJobStatusReader(jobId, 500);
  const shouldStop = async () => {
    const status = await readStatus();
    return status === JOB_STATUS.canceled || status === JOB_STATUS.stopping;
  };
  const publishProgress = async () => {
    await updateJobProgress(jobId, {
      ...summary,
      results: trimImageCaptureResults(summary.results),
      elapsedMs: Date.now() - startedAt,
    });
  };

  const pendingAssetSaves = [];
  const appendNodeAssetUpdate = (nodeId, assets) => {
    summary.assetUpdateCursor += 1;
    summary.nodeAssetUpdates.push({
      seq: summary.assetUpdateCursor,
      nodeId,
      assets,
    });
  };
  const incrementResultCounter = (status) => {
    if (status === 'saved') summary.captured += 1;
    else if (status === 'skipped') summary.skipped += 1;
    else if (status === 'blocked') summary.blocked += 1;
    else if (status === 'missing_asset' || status === 'low_resolution') summary.missingAsset += 1;
    else summary.failed += 1;
  };
  const recordCompletedResult = (result, assets = null) => {
    summary.completed += 1;
    incrementResultCounter(result.status);
    if (assets && Object.keys(assets).length > 0) {
      appendNodeAssetUpdate(result.nodeId, assets);
    }
    summary.results.push(result);
  };
  const queueAssetSave = async (entry) => {
    if (!entry?.nodeId || !entry?.assets || Object.keys(entry.assets).length === 0) {
      recordCompletedResult(entry.result);
      return;
    }
    pendingAssetSaves.push(entry);
    if (pendingAssetSaves.length >= IMAGE_CAPTURE_ASSET_SAVE_BATCH_SIZE) {
      await flushAssetSaves();
    }
  };
  async function flushAssetSaves() {
    if (pendingAssetSaves.length === 0) return;
    const batch = pendingAssetSaves.splice(0, pendingAssetSaves.length);
    let persistenceResult;
    try {
      persistenceResult = await persistImageCaptureNodeAssetBatch({
        mapId,
        updates: batch.map((entry) => ({
          nodeId: entry.nodeId,
          assets: entry.assets,
          meta: entry.result || {},
        })),
      });
    } catch (error) {
      persistenceResult = {
        verifiedEntries: [],
        missingEntries: batch.map((entry) => ({
          ...entry,
          persistError: error?.message || 'Image asset save failed',
        })),
      };
    }

    const verifiedIds = new Set((persistenceResult.verifiedEntries || []).map((entry) => entry.nodeId));
    batch.forEach((entry) => {
      if (verifiedIds.has(entry.nodeId)) {
        recordCompletedResult(entry.result, entry.assets);
        return;
      }
      recordCompletedResult({
        nodeId: entry.nodeId,
        status: 'missing_asset',
        error: entry.persistError || 'Saved image fields were not found on the map',
      });
    });
  }

  for (const record of targetPlan.skippedRecords) {
    const reason = record.skipReason?.reason || 'Preview unavailable';
    const status = record.skipReason?.status || 'skipped';
    const assetUpdates = getImageCaptureSkipUpdates(captureType, reason, {
      authRequired: status === 'blocked',
    });
    await queueAssetSave({
      nodeId: record.nodeId,
      assets: assetUpdates,
      result: {
        nodeId: record.nodeId,
        status,
        error: reason,
      },
    });
  }
  if (targetPlan.skippedRecords.length > 0) {
    await flushAssetSaves();
    await publishProgress();
  }

  for (let phaseIndex = 0; phaseIndex < targetPlan.phases.length; phaseIndex += 1) {
    if (await shouldStop()) {
      summary.stopped = true;
      break;
    }
    const phase = targetPlan.phases[phaseIndex];
    summary.batchIndex = phaseIndex + 1;
    await publishProgress();

    for (const record of phase.records) {
      if (await shouldStop()) {
        summary.stopped = true;
        break;
      }
      summary.currentNodeId = record.nodeId;
      await publishProgress();

      let finalStatus = null;
      let lastError = null;
      for (let attempt = 0; attempt < IMAGE_CAPTURE_MAX_ATTEMPTS; attempt += 1) {
        if (await shouldStop()) {
          summary.stopped = true;
          break;
        }
        try {
          const safeUrl = await assertSafeUrl(record.node.url);
          const result = await captureScreenshot(safeUrl, captureType);
          const validation = await validateImageCaptureResult(captureType, result);
          if (!validation.ok) {
            finalStatus = validation.status;
            lastError = validation.error;
            if (validation.status === 'blocked') break;
            if (validation.status === 'low_resolution') break;
            throw new Error(validation.error);
          }

          const assetUpdates = getImageCaptureAssetUpdates(captureType, result);
          await queueAssetSave({
            nodeId: record.nodeId,
            assets: assetUpdates,
            result: {
              nodeId: record.nodeId,
              status: 'saved',
              url: result.url,
              thumbnailUrl: result.thumbnailUrl || null,
              width: result.width || null,
              height: result.height || null,
            },
          });
          finalStatus = 'saved';
          break;
        } catch (error) {
          lastError = error?.message || 'Image capture failed';
          const authRequired = error?.code === 'SCREENSHOT_AUTH_REQUIRED'
            || String(lastError).toLowerCase().includes('requires authentication')
            || String(lastError).toLowerCase().includes('requires login');
          if (authRequired) {
            finalStatus = 'blocked';
            lastError = 'Requires login';
            break;
          }
          if (attempt < IMAGE_CAPTURE_MAX_ATTEMPTS - 1) {
            await sleep(Math.min(IMAGE_CAPTURE_RETRY_BASE_DELAY_MS * (attempt + 1), 15000));
          }
        }
      }

      if (summary.stopped) break;
      if (finalStatus !== 'saved') {
        const status = finalStatus || 'failed';
        const assetUpdates = getImageCaptureFailureUpdates(
          captureType,
          lastError || 'Image capture failed',
          { authRequired: status === 'blocked' }
        );
        if (Object.keys(assetUpdates).length > 0) {
          await queueAssetSave({
            nodeId: record.nodeId,
            assets: assetUpdates,
            result: {
              nodeId: record.nodeId,
              status,
              error: lastError || 'Image capture failed',
            },
          });
        } else {
          recordCompletedResult({
            nodeId: record.nodeId,
            status,
            error: lastError || 'Image capture failed',
          });
        }
      }
      await publishProgress();
    }
    await flushAssetSaves();
    await publishProgress();
  }

  summary.currentNodeId = null;
  summary.elapsedMs = Date.now() - startedAt;
  await flushAssetSaves();
  await publishProgress();
  return summary;
}

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
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      || process.env.CHROME_EXECUTABLE_PATH
      || null;
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--disable-background-networking',
        '--disable-dev-shm-usage',
        '--disable-renderer-backgrounding',
        '--no-sandbox',
      ],
    });
    browser.on('disconnected', () => {
      browser = null;
    });
  }
  return browser;
}

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
const PAGE_TYPE_HOME = 'Home';
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

async function persistPagesForIa(
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

  const pageColumns = await pageStore.getPageColumnsAsync();
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

  const known = new Map();
  const readExisting = async (url) => {
    if (known.has(url)) return known.get(url);
    const row = (await pageStore.getPageByUrlAsync(url, selectColumns)) || null;
    known.set(url, row);
    return row;
  };

  const upsertPage = async ({
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
    const existing = await readExisting(url);
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
      await pageStore.insertPageAsync(row, { hasType, hasDepth });
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
      await pageStore.updatePageAsync(row, { hasType, hasDepth });
      known.set(url, row);
    }

    return { updated: needsUpdate, upgraded: isExistingVirtual && !isIncomingVirtual };
  };

  const ensureParentChain = async (url) => {
    const chain = [];
    let parentUrl = getParentUrl(url);
    while (parentUrl) {
      chain.unshift(parentUrl);
      parentUrl = getParentUrl(parentUrl);
    }
    for (const parent of chain) {
      const basePlacement = getPlacementForUrl(parent, baseHost);
      if (!basePlacement) continue;
      const depth = getUrlDepth(parent);
      const parentParent = getParentUrl(parent);
      await upsertPage({
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
    }
  };

  const pages = Array.from(nodes.values());
  let totalSaved = 0;
  let virtualInserted = 0;
  let subdomainCount = 0;

  const persisted = new Set();

  const run = pageStore.transactionAsync(async () => {
    for (const node of pages) {
      const canonicalUrl = normalizeUrl(node.url);
      if (!canonicalUrl) continue;
      if (persisted.has(canonicalUrl)) continue;
      persisted.add(canonicalUrl);

      const basePlacement = getPlacementForUrl(canonicalUrl, baseHost);
      if (!basePlacement) continue;
      if (basePlacement === 'Subdomain') subdomainCount += 1;

      await ensureParentChain(canonicalUrl);

      const depth = getUrlDepth(canonicalUrl);
      const parentUrl = getParentUrl(canonicalUrl);
      const isMissing = Boolean(node.isMissing);
      let status = isMissing
        ? PAGE_STATUS_MISSING
        : getStatusFromHttp(Number.isFinite(node.httpStatus) ? node.httpStatus : 0);
      if (!isMissing && status === PAGE_STATUS_ACTIVE && node.wasRedirect) {
        status = PAGE_STATUS_REDIRECT;
      }
      const type = isMissing
        ? PAGE_TYPE_VIRTUAL
        : (node.pageType === PAGE_TYPE_HOME ? PAGE_TYPE_HOME : PAGE_TYPE_PAGE);
      const title = node.title || getTitleFromUrl(canonicalUrl);
      const incomingLinks = linksInCounts.get(canonicalUrl) || 0;
      const discoverySource = isMissing
        ? 'crawl'
        : (discoverySourceByUrl.get(canonicalUrl) || 'crawl');

      const result = await upsertPage({
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
    }

    for (const [url, count] of linksInCounts.entries()) {
      if (!count) continue;
      if (persisted.has(url)) continue;

      const existing = await readExisting(url);
      if (!existing) continue;
      const basePlacement = getPlacementForUrl(url, baseHost);
      if (!basePlacement) continue;

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
        await pageStore.updatePageAsync(row, { hasType, hasDepth });
        known.set(url, row);
      }
    }
  });

  await run();

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
    return normalizeUrl(extractSeoMetadata(html, baseUrl).canonicalUrl) || null;
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
  const startedAt = Date.now();
  const res = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VellicBot/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...extraHeaders,
    },
    validateStatus: () => true,
  });
  const responseTime = Date.now() - startedAt;
  const responseUrl = res.request?.res?.responseUrl;
  const finalUrl = normalizeUrl(responseUrl || url);
  return { html: res.data, status: res.status, contentType: res.headers['content-type'], finalUrl, responseTime };
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
        'User-Agent': 'Mozilla/5.0 (compatible; VellicBot/1.0)',
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
        'User-Agent': 'Mozilla/5.0 (compatible; VellicBot/1.0)',
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

async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(workers);
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
    if (await abortCheck?.()) throw new Error('Discovery aborted');
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
    if (await abortCheck?.()) throw new Error('Discovery aborted');
    const normalizedSitemap = normalizeUrl(sitemapUrl);
    if (!normalizedSitemap) return;
    if (processed.has(normalizedSitemap)) return;
    if (processed.size >= MAX_SITEMAPS) return;
    processed.add(normalizedSitemap);

    try {
      const sitemapRes = await axios.get(sitemapUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'VellicBot/1.0' },
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

  const mapRow = await mapStore.getMapByIdAsync(mapId);
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
    if (await abortCheck()) throw new Error('Discovery aborted');
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
      if (await abortCheck()) throw new Error('Discovery aborted');
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
    iaSummary = await persistPagesForIa(nodes, baseHost, discoverySourceByUrl, linksInCounts);
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

async function crawlSite(startUrl, maxPages, maxDepth, options = {}, onProgress = null, readJobStatus = null) {
  const scanOptions = normalizeScanOptions(options);
  const seed = normalizeUrl(startUrl);
  if (!seed) throw new Error('Invalid URL');
  const pageLimit = normalizeMaxPagesLimit(maxPages);
  const depthLimit = normalizeScanDepthLimit(maxDepth);

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
  const isWithinScanDepth = (candidate) => {
    const normalized = normalizeUrl(candidate);
    if (!normalized) return false;
    if (normalized === seed) return true;
    if (depthLimit === null) return true;
    return getUrlDepth(normalized) <= depthLimit;
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
    if (!isWithinScanDepth(url)) return;
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
    if (commonUrl && isWithinScanDepth(commonUrl)) {
      recordDiscovery(commonUrl, 'crawl');
      enqueue(commonUrl, 1);
    }
  }

  const extraHeaders = {};
  let partialReason = null;
  let stopRequested = false;

  const pollJobStatus = async () => {
    const status = await readJobStatus?.();
    if (status === JOB_STATUS.canceled) {
      throw new Error('Scan aborted');
    }
    if (status === JOB_STATUS.stopping) {
      partialReason = 'stopped_by_user';
      stopRequested = true;
      return true;
    }
    return false;
  };

  const processedSitemaps = new Set();
  const MAX_SITEMAPS = 12;

  const processSitemap = async (sitemapUrl) => {
    if (await pollJobStatus()) return;
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
        headers: { 'User-Agent': 'VellicBot/1.0' },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (sitemapUrl.endsWith('.txt')) {
        const urls = sitemapRes.data.split('\n').map((u) => u.trim()).filter(Boolean);
        for (const u of urls) {
          const norm = normalizeUrl(u);
          if (norm && allowUrl(norm) && isWithinScanDepth(norm)) {
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
        if (norm && allowUrl(norm) && isWithinScanDepth(norm)) {
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
        if (await pollJobStatus()) return;
        await processSitemap(loc);
        if (stopRequested) return;
      }
    } catch {
      // Not available, continue
    }
  };

  await processSitemap(`${origin}/sitemap.xml`);
  for (const altSitemap of ['/sitemap_index.xml', '/sitemap-index.xml', '/sitemap.txt']) {
    if (stopRequested) break;
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
  const scheduledBrokenLinkChecks = new Set();
  const brokenLinkCandidates = [];
  const MAX_BROKEN_LINK_CHECKS = 500;
  let brokenChecks = 0;

  const scheduleBrokenLinkCheck = (link, sourceUrl) => {
    if (!scanOptions.brokenLinks) return;
    if (brokenChecks >= MAX_BROKEN_LINK_CHECKS) return;
    if (linkStatusCache.has(link) || scheduledBrokenLinkChecks.has(link)) return;
    scheduledBrokenLinkChecks.add(link);
    brokenChecks += 1;
    brokenLinkCandidates.push({ link, sourceUrl });
  };

  const takeNextQueueItem = () => {
    while (queueIndex < queue.length && (pageLimit === null || visited.size < pageLimit)) {
      const item = queue[queueIndex++];
      if (!item?.url || visited.has(item.url)) continue;
      visited.add(item.url);
      return item;
    }
    return null;
  };

  const processCrawlItem = async ({ url, depth }) => {
    visited.add(url);
    const discoveryIndex = discoveryCounter++;

    // Send progress update
    if (onProgress) {
      onProgress({ scanned: visited.size, queued: Math.max(0, queue.length - queueIndex) });
    }

    if ((depthLimit !== null && depth > depthLimit) || !isWithinScanDepth(url)) return;
    if (!allowUrl(url)) return;

    let html;
    let status = 0;
    let contentType = '';
    let finalUrl = url;
    let responseTime = null;
    try {
      const res = await fetchPage(url, extraHeaders);
      html = res.html;
      status = res.status;
      contentType = res.contentType;
      finalUrl = res.finalUrl || url;
      responseTime = res.responseTime;
    } catch (e) {
      // Still store node with fallback title so tree doesn't break
      if (scanOptions.brokenLinks) brokenLinks.push({ url, reason: 'fetch_failed' });
      if (scanOptions.inactivePages) inactivePages.push({ url, status: 0, reason: 'fetch_failed' });
      if (!pageMap.has(url)) {
        pageMap.set(url, {
          url,
          title: getUrlFallbackTitle(url),
          parentUrl: getParentUrl(url),
          discoveryIndex,
          httpStatus: status,
          wasRedirect: false,
          responseTime,
          titleSource: 'url_fallback',
          blockedReason: 'fetch_failed',
          metadataAvailable: false,
        });
      }
      return;
    }

    const classification = classifyScanResponse({ html, status, url, finalUrl });

    if (status >= 400) {
      const shouldKeep = (scanOptions.errorPages && (classification.isErrorStatus || classification.isBlockedStatus))
        || (scanOptions.authenticatedPages && classification.isAuthStatus)
        || (scanOptions.inactivePages && classification.isInactiveStatus);
      if (classification.isErrorStatus && scanOptions.errorPages) {
        errors.push({
          url,
          status,
          authRequired: false,
          blockedReason: classification.blockedReason,
        });
      }
      if (scanOptions.inactivePages && classification.isInactiveStatus) {
        inactivePages.push({ url, status, blockedReason: classification.blockedReason });
      }
      if (scanOptions.brokenLinks) {
        brokenLinks.push({ url, status });
      }
      if (!shouldKeep) {
        return;
      }
    }

    if (!isHtmlContentType(contentType)) {
      if (scanOptions.files) {
        files.push({ url, sourceUrl: getParentUrl(url) || null, contentType });
      }
      return;
    }

    const seoMetadata = classification.shouldExtractMetadata
      ? extractSeoMetadata(html, finalUrl || url)
      : {};
    const title = classification.shouldExtractMetadata
      ? extractTitle(html, finalUrl || url)
      : classification.fallbackTitle;
    const parentUrl = getParentUrl(finalUrl || url);
    const canonicalUrl = classification.shouldExtractMetadata
      ? (normalizeUrl(seoMetadata.canonicalUrl) || extractCanonicalUrl(html, finalUrl || url))
      : null;
    const wasRedirect = normalizeUrl(finalUrl || url) !== normalizeUrl(url);
    const description = getPrimaryDescription(seoMetadata);
    const metaTags = getPrimaryMetaTags(seoMetadata);

    pageMap.set(url, {
      url,
      finalUrl: finalUrl || url,
      canonicalUrl,
      title,
      description,
      metaTags,
      seoMetadata,
      parentUrl,
      authRequired: classification.isAuthStatus,
      thumbnailUrl: undefined,
      discoveryIndex,
      httpStatus: status,
      wasRedirect,
      responseTime,
      titleSource: classification.titleSource,
      blockedReason: classification.blockedReason,
      isChallengePage: false,
      isBlocked: false,
      scanStatus: classification.scanStatus,
      metadataAvailable: classification.metadataAvailable,
    });

    const links = classification.shouldExtractLinks ? extractLinks(html, finalUrl || url) : [];
    const allowedLinks = links.filter((link) => allowUrl(link));
    linksByUrl.set(url, allowedLinks);

    for (const link of links) {
      if (await pollJobStatus()) break;
      if (!allowUrl(link)) continue;

      // Skip obvious assets
      if (/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|mp4|mov|mp3|wav)$/i.test(link)) {
        scheduleBrokenLinkCheck(link, url);
        if (scanOptions.files) files.push({ url: link, sourceUrl: url });
        continue;
      }

      recordLinkEdge(url, link);
      recordDiscovery(link, 'crawl');

      const d = depth + 1;
      if ((depthLimit !== null && d > depthLimit) || !isWithinScanDepth(link)) {
        scheduleBrokenLinkCheck(link, url);
        continue;
      }

      const normalizedReferrer = normalizeUrl(url);
      if (!referrerMap.has(link) && link !== normalizedReferrer) {
        referrerMap.set(link, normalizedReferrer);
      }
      if (visited.has(link)) continue;
      enqueue(link, d);
    }

    if (stopRequested) return;
  };

  const crawlWorker = async () => {
    while (!stopRequested) {
      if (await pollJobStatus()) break;
      const item = takeNextQueueItem();
      if (!item) {
        if (activeCrawlItems === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }
      activeCrawlItems += 1;
      try {
        await processCrawlItem(item);
      } finally {
        activeCrawlItems -= 1;
      }
    }
  };

  let activeCrawlItems = 0;
  const workerCount = Math.min(
    SCAN_PAGE_CONCURRENCY,
    Math.max(1, pageLimit === null ? SCAN_PAGE_CONCURRENCY : pageLimit)
  );
  await Promise.all(Array.from({ length: workerCount }, crawlWorker));

  if (scanOptions.brokenLinks && brokenLinkCandidates.length && !stopRequested) {
    await runWithConcurrency(
      brokenLinkCandidates,
      SCAN_BROKEN_LINK_CONCURRENCY,
      async ({ link, sourceUrl }) => {
        if (await pollJobStatus()) return;
        const statusResult = await checkLinkStatus(link, extraHeaders);
        linkStatusCache.set(link, statusResult.status);
        if (statusResult.status >= 400 || statusResult.status === 0) {
          brokenLinks.push({
            url: link,
            status: statusResult.status || undefined,
            sourceUrl,
          });
        }
      }
    );
  }

  if (!pageMap.has(seed) && !stopRequested) {
    await processCrawlItem({ url: seed, depth: 0 });
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
      pageType: url === seed ? PAGE_TYPE_HOME : PAGE_TYPE_PAGE,
      description: meta.description || '',
      metaTags: meta.metaTags || '',
      seoMetadata: meta.seoMetadata || {},
      h1s: Array.isArray(meta.seoMetadata?.h1s) ? meta.seoMetadata.h1s : [],
      h2s: Array.isArray(meta.seoMetadata?.h2s) ? meta.seoMetadata.h2s : [],
      imageCount: Number.isFinite(meta.seoMetadata?.imageCount) ? meta.seoMetadata.imageCount : null,
      missingImageAltCount: Number.isFinite(meta.seoMetadata?.missingImageAltCount) ? meta.seoMetadata.missingImageAltCount : null,
      parentUrl: meta.parentUrl,
      discoveryIndex: Number.isFinite(meta.discoveryIndex) ? meta.discoveryIndex : null,
      referrerUrl: referrerMap.get(url) || null,
      linksIn: linksInCounts.get(url) || 0,
      linksOut: Array.isArray(linksByUrl.get(url)) ? linksByUrl.get(url).length : 0,
      authRequired: meta.authRequired || false,
      thumbnailUrl: meta.thumbnailUrl || undefined,
      httpStatus: meta.httpStatus ?? null,
      statusCode: meta.httpStatus ?? null,
      wasRedirect: meta.wasRedirect || false,
      redirectTarget: meta.wasRedirect ? (meta.finalUrl || url) : null,
      responseTime: Number.isFinite(meta.responseTime) ? meta.responseTime : null,
      titleSource: meta.titleSource || 'html',
      blockedReason: meta.blockedReason || null,
      isChallengePage: false,
      isBlocked: false,
      scanStatus: meta.scanStatus || null,
      metadataAvailable: meta.metadataAvailable !== false,
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
  const shouldInferPathParents = (node) => {
    if (!node?.url || node.url === rootUrl) return false;
    try {
      const parsed = new URL(node.url);
      const pathDepth = parsed.pathname.split('/').filter(Boolean).length;
      return pathDepth > 1;
    } catch {
      return false;
    }
  };
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
    if (!shouldInferPathParents(node)) continue;
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

  const resolveNodeUrl = (url) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return null;
    if (nodes.has(normalized)) return normalized;
    const canonicalMatch = canonicalToUrl.get(getCanonicalKey(normalized));
    if (canonicalMatch && nodes.has(canonicalMatch)) return canonicalMatch;
    return null;
  };

  // Build deterministic adjacency from all collected page links after crawling.
  // This avoids parallel crawl timing deciding the final map shape.
  const linkChildren = new Map();
  for (const [sourceRaw, targets] of linksByUrl.entries()) {
    const sourceUrl = resolveNodeUrl(sourceRaw);
    if (!sourceUrl) continue;
    for (const targetRaw of targets || []) {
      const targetUrl = resolveNodeUrl(targetRaw);
      if (!targetUrl || targetUrl === sourceUrl) continue;
      if (!linkChildren.has(sourceUrl)) linkChildren.set(sourceUrl, []);
      const children = linkChildren.get(sourceUrl);
      if (!children.includes(targetUrl)) children.push(targetUrl);
    }
  }

  // Determine which nodes are linked to root via the completed link graph.
  const linked = new Set([rootUrl]);
  const linkedQueue = [rootUrl];
  const preferredReferrerMap = new Map();
  while (linkedQueue.length) {
    const current = linkedQueue.shift();
    const children = linkChildren.get(current) || [];
    for (const childUrl of children) {
      if (!nodes.has(childUrl)) continue;
      const childHost = new URL(childUrl).hostname;
      if (normalizeHost(childHost) !== rootHostNormalized) continue;
      if (linked.has(childUrl)) continue;
      linked.add(childUrl);
      preferredReferrerMap.set(childUrl, current);
      linkedQueue.push(childUrl);
    }
  }

  nodes.forEach((node) => {
    if (preferredReferrerMap.has(node.url)) {
      node.referrerUrl = preferredReferrerMap.get(node.url);
    }
  });

  // Keep all successfully scanned primary-domain pages visible. Some sites expose
  // pages through sitemap/common-path discovery without server-rendered root links.
  const visiblePrimaryUrls = new Set(linked);
  nodes.forEach((node) => {
    if (!node?.url || node.url === rootUrl) return;
    if (node.isMissing || node.isDuplicate) return;
    const nodeHost = normalizeHost(new URL(node.url).hostname);
    if (nodeHost === rootHostNormalized) {
      visiblePrimaryUrls.add(node.url);
    }
  });

  // Ensure path ancestors for visible nodes are also visible (for missing placeholders)
  Array.from(visiblePrimaryUrls).forEach((url) => {
    const linkedNode = nodes.get(url);
    if (linkedNode && !shouldInferPathParents(linkedNode)) return;
    let parentUrl = getParentUrl(url);
    while (parentUrl) {
      if (!nodes.has(parentUrl)) break;
      const parentHost = new URL(parentUrl).hostname;
      if (normalizeHost(parentHost) !== rootHostNormalized) break;
      if (visiblePrimaryUrls.has(parentUrl)) break;
      visiblePrimaryUrls.add(parentUrl);
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

    if (visiblePrimaryUrls.has(node.url)) {
      const parentUrl = node.parentUrl;
      if (parentUrl && nodes.has(parentUrl) && visiblePrimaryUrls.has(parentUrl)) {
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
    if (!shouldInferPathParents(node)) return;
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
    delete node.internalLinks;
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
    const iaSummary = await persistPagesForIa(nodes, baseHost, discoverySourceByUrl, linksInCounts);
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

  const includePartialOrphans = Boolean(partialReason);

  const result = {
    root,
    orphans: (scanOptions.orphanPages || includePartialOrphans) ? prunedOrphanNodes : [],
    subdomains: scanOptions.subdomains ? subdomainNodes : [],
    errors: scanOptions.errorPages ? errors : [],
    inactivePages: scanOptions.inactivePages ? inactivePages : [],
    brokenLinks: scanOptions.brokenLinks ? brokenLinks : [],
    files: scanOptions.files ? files : [],
    crosslinks,
  };

  if (partialReason) {
    result.partial = true;
    result.partialReason = partialReason;
  }

  return result;
}

const getBaseUrl = () => (
  process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`
);

const SCREENSHOT_CAPTURE_STABILIZE_STYLE = `
  html, body {
    scroll-behavior: auto !important;
    overscroll-behavior: auto !important;
  }
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  [class*="parallax"],
  [class*="Parallax"],
  [data-parallax],
  [data-scroll],
  [data-scroll-speed],
  [data-scroll-container],
  [data-scroll-section],
  [style*="background-attachment: fixed"] {
    background-attachment: scroll !important;
    will-change: auto !important;
  }
`;

async function captureScreenshot(safeUrl, type = SCREENSHOT_TYPES.full, options = {}) {
  const normalizedType = normalizeScreenshotType(type);
  if (!normalizedType) {
    throw new Error('Invalid screenshot type. Use full or thumb.');
  }
  const abortSignal = options?.signal || null;
  const throwIfAborted = () => {
    if (abortSignal?.aborted) {
      throw new Error('Screenshot capture stopped');
    }
  };

  await cleanupStaleScreenshots();

  const urlHash = crypto.createHash('sha256').update(safeUrl).digest('hex');
  const fullExtension = 'jpg';
  const filename = `${urlHash}_${normalizedType}_${SCREENSHOT_CAPTURE_CACHE_VERSION}.${normalizedType === SCREENSHOT_TYPES.full ? fullExtension : 'png'}`;
  const thumbPreviewFilename = `${urlHash}_thumb_preview_${SCREENSHOT_CAPTURE_CACHE_VERSION}.jpg`;
  const thumbSmallFilename = `${urlHash}_thumb_small_${SCREENSHOT_CAPTURE_CACHE_VERSION}.jpg`;
  const fullSmallFilename = `${urlHash}_full_thumb_${SCREENSHOT_CAPTURE_CACHE_VERSION}.jpg`;
  const fullViewportTempFilename = `${urlHash}_full_viewport_${SCREENSHOT_CAPTURE_CACHE_VERSION}.jpg`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  const thumbPreviewPath = path.join(SCREENSHOT_DIR, thumbPreviewFilename);
  const thumbSmallPath = path.join(SCREENSHOT_DIR, thumbSmallFilename);
  const fullSmallPath = path.join(SCREENSHOT_DIR, fullSmallFilename);
  const fullViewportTempPath = path.join(SCREENSHOT_DIR, fullViewportTempFilename);
  const primaryPath = normalizedType === SCREENSHOT_TYPES.thumb ? thumbSmallPath : filepath;
  const metaPath = path.join(SCREENSHOT_DIR, `${path.basename(primaryPath)}${SCREENSHOT_META_SUFFIX}`);
  const baseUrl = getBaseUrl();
  const publicUrl = (name) => buildPublicUrl(name, baseUrl);
  const storageProvider = getScreenshotStorageProvider();

  if (
    storageProvider === 'local'
    &&
    fs.existsSync(primaryPath)
    && (
      normalizedType !== SCREENSHOT_TYPES.thumb
      || fs.existsSync(thumbPreviewPath)
    )
  ) {
    const stats = fs.statSync(primaryPath);
    const ageMs = Date.now() - stats.mtimeMs;
    const meta = readScreenshotMeta(metaPath);
    if (
      ageMs < SCREENSHOT_CACHE_TTL_MS
      && meta
      && meta.url === safeUrl
    ) {
      const result = {
        url: publicUrl(path.basename(primaryPath)),
        cached: true,
        type: normalizedType,
        blocked: false,
        truncated: !!meta.truncated,
        width: meta.width || null,
        height: meta.height || null,
        durationMs: meta.durationMs || null,
      };
      if (normalizedType === SCREENSHOT_TYPES.thumb) {
        result.thumbnailUrl = publicUrl(thumbSmallFilename);
        result.thumbnailFullUrl = publicUrl(thumbPreviewFilename);
      } else if (fs.existsSync(fullSmallPath)) {
        result.thumbnailUrl = publicUrl(fullSmallFilename);
      }
      return result;
    }
  }

  const shotResult = await enqueueScreenshot(async () => {
    throwIfAborted();
    const host = new URL(safeUrl).hostname;
    const waitMs = reserveScreenshotSlot(host);
    if (waitMs > 0) await sleep(waitMs);
    throwIfAborted();

    const b = await getBrowser();
    const ua = SCREENSHOT_USER_AGENTS[Math.floor(Math.random() * SCREENSHOT_USER_AGENTS.length)];
    const viewport = normalizedType === SCREENSHOT_TYPES.thumb
      ? { width: SCREENSHOT_THUMB_VIEWPORT_WIDTH, height: SCREENSHOT_THUMB_VIEWPORT_HEIGHT }
      : { width: SCREENSHOT_FULL_VIEWPORT_WIDTH, height: SCREENSHOT_FULL_VIEWPORT_HEIGHT };
    const context = await b.newContext({
      userAgent: ua,
      viewport,
      deviceScaleFactor: normalizedType === SCREENSHOT_TYPES.full
        ? SCREENSHOT_FULL_DEVICE_SCALE_FACTOR
        : SCREENSHOT_THUMB_DEVICE_SCALE_FACTOR,
      reducedMotion: 'reduce',
      extraHTTPHeaders: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        DNT: '1',
        'Upgrade-Insecure-Requests': '1',
      },
    });
    let page = null;
    const abortActiveCapture = () => {
      if (page) {
        page.close().catch(() => {});
      }
      context.close().catch(() => {});
    };

    try {
      if (abortSignal) {
        abortSignal.addEventListener('abort', abortActiveCapture, { once: true });
      }
      throwIfAborted();
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      page = await context.newPage();
      await installScreenshotRequestFilters(page);

      let lastError = null;
      const captureTimeoutMs = normalizedType === SCREENSHOT_TYPES.thumb
        ? SCREENSHOT_THUMB_CAPTURE_TIMEOUT_MS
        : SCREENSHOT_CAPTURE_TIMEOUT_MS;
      page.setDefaultTimeout(captureTimeoutMs);
      page.setDefaultNavigationTimeout(captureTimeoutMs);
      const maxAttempts = 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const captureStartedAt = Date.now();
        try {
          throwIfAborted();
          await page.goto(safeUrl, {
            waitUntil: 'domcontentloaded',
            timeout: captureTimeoutMs,
          });
          throwIfAborted();
          await page.waitForTimeout(normalizedType === SCREENSHOT_TYPES.thumb ? 450 : 650);
          await page.addStyleTag({ content: SCREENSHOT_CAPTURE_STABILIZE_STYLE }).catch(() => {});
          await page.evaluate(async ({
            shouldWarmFull,
            maxCaptureHeight,
            maxStops,
            stepPx,
          }) => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const warmImages = () => {
              Array.from(document.images || []).forEach((image) => {
                try {
                  image.loading = 'eager';
                  image.decoding = 'sync';
                  const src = image.getAttribute('data-src') || image.getAttribute('data-lazy-src') || image.getAttribute('data-original');
                  const srcset = image.getAttribute('data-srcset') || image.getAttribute('data-lazy-srcset');
                  if (src && !image.getAttribute('src')) image.setAttribute('src', src);
                  if (srcset && !image.getAttribute('srcset')) image.setAttribute('srcset', srcset);
                } catch {
                  // Ignore per-image mutations for screenshot warmup.
                }
              });
            };
            warmImages();

            const nodes = Array.from(document.querySelectorAll('*'));
            nodes.forEach((node) => {
              try {
                const el = node;
                const style = window.getComputedStyle(el);
                const classes = `${el.className || ''}`.toLowerCase();
                const dataFlags = [
                  el.getAttribute('data-parallax'),
                  el.getAttribute('data-scroll'),
                  el.getAttribute('data-scroll-speed'),
                  el.getAttribute('data-scroll-container'),
                  el.getAttribute('data-scroll-section'),
                ].filter(Boolean).join(' ').toLowerCase();
                const looksParallax = classes.includes('parallax')
                  || dataFlags.includes('parallax')
                  || dataFlags.includes('scroll');

                if (style.backgroundAttachment === 'fixed') {
                  el.style.setProperty('background-attachment', 'scroll', 'important');
                }
                if (looksParallax) {
                  el.style.setProperty('transform', 'none', 'important');
                  el.style.setProperty('will-change', 'auto', 'important');
                  el.style.setProperty('background-attachment', 'scroll', 'important');
                }
                if (style.animationName && style.animationName !== 'none') {
                  el.style.setProperty('animation', 'none', 'important');
                }
                if (style.transitionProperty && style.transitionProperty !== 'none') {
                  el.style.setProperty('transition', 'none', 'important');
                }
              } catch {
                // Ignore capture stabilization edge cases per element.
              }
            });

            await document.fonts?.ready?.catch?.(() => {});
            await wait(shouldWarmFull ? 100 : 300);

            if (shouldWarmFull) {
              const root = document.scrollingElement || document.documentElement || document.body;
              const viewportHeight = Math.max(window.innerHeight || 720, 320);
              const maxScrollTop = Math.max((root?.scrollHeight || 0) - viewportHeight, 0);
              const captureScrollTop = Math.max(0, Math.min(maxScrollTop, Math.max(maxCaptureHeight - viewportHeight, 0)));
              const stopsByStep = Math.ceil(captureScrollTop / Math.max(stepPx || 1800, 720)) + 1;
              const stops = Math.min(Math.max(2, maxStops || 8), Math.max(2, stopsByStep));
              const positions = new Set([0, captureScrollTop]);
              for (let index = 1; index < stops - 1; index += 1) {
                positions.add(Math.round((captureScrollTop * index) / (stops - 1)));
              }
              for (const y of Array.from(positions).sort((a, b) => a - b)) {
                window.scrollTo(0, y);
                warmImages();
                await wait(80);
              }
            }

            window.scrollTo(0, 0);
            await wait(shouldWarmFull ? 100 : 260);
            await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
          }, {
            shouldWarmFull: normalizedType === SCREENSHOT_TYPES.full,
            maxCaptureHeight: SCREENSHOT_FULL_MAX_HEIGHT,
            maxStops: SCREENSHOT_FULL_WARMUP_MAX_STOPS,
            stepPx: SCREENSHOT_FULL_WARMUP_STEP_PX,
          });
          throwIfAborted();
          await page.waitForLoadState('load', {
            timeout: normalizedType === SCREENSHOT_TYPES.full ? SCREENSHOT_NETWORK_SETTLE_TIMEOUT_MS : 2500,
          }).catch(() => {});
          if (normalizedType === SCREENSHOT_TYPES.thumb) {
            await page.waitForLoadState('networkidle', { timeout: SCREENSHOT_NETWORK_SETTLE_TIMEOUT_MS }).catch(() => {});
          }
          await page.waitForTimeout(normalizedType === SCREENSHOT_TYPES.thumb ? 250 : 150);
          throwIfAborted();

          const title = await page.title();
          const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) || '');
          const blocked = isLikelyBlocked(title, bodyText);
          const capturedAt = new Date().toISOString();

          let truncated = false;
          let width = null;
          let height = null;
          if (normalizedType === SCREENSHOT_TYPES.full) {
            const metrics = await page.evaluate(() => {
              const doc = document.documentElement;
              const body = document.body;
              const scrollWidth = Math.max(doc?.scrollWidth || 0, body?.scrollWidth || 0, 1);
              const scrollHeight = Math.max(doc?.scrollHeight || 0, body?.scrollHeight || 0, 1);
              return { scrollWidth, scrollHeight };
            });

            const clipWidth = Math.max(1, Math.min(Math.ceil(metrics.scrollWidth), SCREENSHOT_FULL_MAX_WIDTH));
            const scrollHeight = Math.max(1, Math.ceil(metrics.scrollHeight));
            const clipHeight = Math.min(scrollHeight, SCREENSHOT_FULL_MAX_HEIGHT);
            width = Math.round(clipWidth * SCREENSHOT_FULL_DEVICE_SCALE_FACTOR);
            height = Math.round(clipHeight * SCREENSHOT_FULL_DEVICE_SCALE_FACTOR);

            await page.screenshot({
              path: fullViewportTempPath,
              fullPage: false,
              type: 'jpeg',
              quality: SCREENSHOT_FULL_JPEG_QUALITY,
              animations: 'disabled',
              timeout: captureTimeoutMs,
            });

            if (scrollHeight > SCREENSHOT_FULL_MAX_HEIGHT) {
              truncated = true;
              await page.setViewportSize({
                width: Math.max(320, clipWidth),
                height: SCREENSHOT_FULL_MAX_HEIGHT,
              });
              await page.screenshot({
                path: filepath,
                type: 'jpeg',
                quality: SCREENSHOT_FULL_JPEG_QUALITY,
                animations: 'disabled',
                timeout: captureTimeoutMs,
                clip: {
                  x: 0,
                  y: 0,
                  width: clipWidth,
                  height: SCREENSHOT_FULL_MAX_HEIGHT,
                },
              });
            } else {
              await page.screenshot({
                path: filepath,
                fullPage: true,
                type: 'jpeg',
                quality: SCREENSHOT_FULL_JPEG_QUALITY,
                animations: 'disabled',
                timeout: captureTimeoutMs,
              });
            }
            await resizeScreenshotForCanvas(context, fullViewportTempPath, fullSmallPath);
            fs.unlink(fullViewportTempPath, () => {});
          } else {
            await page.screenshot({
              path: thumbPreviewPath,
              fullPage: false,
              type: 'jpeg',
              quality: SCREENSHOT_THUMB_PREVIEW_JPEG_QUALITY,
              animations: 'disabled',
              timeout: captureTimeoutMs,
            });
            await resizeScreenshotForCanvas(context, thumbPreviewPath, thumbSmallPath);
          }

          writeScreenshotMeta(metaPath, {
            url: safeUrl,
            type: normalizedType,
            blocked,
            truncated,
            width,
            height,
            durationMs: Date.now() - captureStartedAt,
            capturedAt,
          });

          return {
            blocked,
            truncated,
            width,
            height,
            durationMs: Date.now() - captureStartedAt,
            capturedAt,
          };
        } catch (err) {
          lastError = err;
          await page.waitForTimeout(800 + Math.floor(Math.random() * 400));
        }
      }

      throw lastError || new Error('Screenshot failed');
    } finally {
      if (normalizedType === SCREENSHOT_TYPES.full && fs.existsSync(fullViewportTempPath)) {
        fs.unlink(fullViewportTempPath, () => {});
      }
      if (abortSignal) {
        abortSignal.removeEventListener('abort', abortActiveCapture);
      }
      if (page) {
        await page.close().catch(() => {});
      }
      await context.close().catch(() => {});
    }
  });

  const meta = {
    url: safeUrl,
    type: normalizedType,
    blocked: shotResult?.blocked || false,
    truncated: shotResult?.truncated || false,
    width: shotResult?.width || null,
    height: shotResult?.height || null,
    durationMs: shotResult?.durationMs || null,
    capturedAt: shotResult?.capturedAt || new Date().toISOString(),
  };
  const primaryAsset = await saveAndVerifyScreenshotFile({
    filename: path.basename(primaryPath),
    filepath: primaryPath,
    baseUrl,
  });
  await saveAndVerifyScreenshotMeta({
    key: `${path.basename(primaryPath)}${SCREENSHOT_META_SUFFIX}`,
    value: meta,
    baseUrl,
  }).catch((error) => {
    console.warn('Screenshot metadata durable save error:', error.message);
  });
  let thumbPreviewAsset = null;
  let fullSmallAsset = null;
  if (normalizedType === SCREENSHOT_TYPES.thumb) {
    thumbPreviewAsset = await saveAndVerifyScreenshotFile({
      filename: thumbPreviewFilename,
      filepath: thumbPreviewPath,
      baseUrl,
    });
  } else if (fs.existsSync(fullSmallPath)) {
    fullSmallAsset = await saveAndVerifyScreenshotFile({
      filename: fullSmallFilename,
      filepath: fullSmallPath,
      baseUrl,
    });
  }

  const result = {
    url: normalizedType === SCREENSHOT_TYPES.thumb
      ? primaryAsset.url
      : primaryAsset.url,
    cached: false,
    type: normalizedType,
    blocked: shotResult?.blocked || false,
    truncated: shotResult?.truncated || false,
    width: shotResult?.width || null,
    height: shotResult?.height || null,
    durationMs: shotResult?.durationMs || null,
  };
  if (normalizedType === SCREENSHOT_TYPES.thumb) {
    result.thumbnailUrl = primaryAsset.url;
    result.thumbnailFullUrl = thumbPreviewAsset?.url || publicUrl(thumbPreviewFilename);
  } else if (fullSmallAsset) {
    result.thumbnailUrl = fullSmallAsset.url;
  }
  return result;
}

async function processJob(job) {
  const jobId = job.id;
  const jobType = normalizeBackgroundJobType(job.type);
  const payload = parseJsonSafe(job.payload) || {};
  try {
    if (jobType === JOB_TYPES.scan) {
      const progressState = { lastUpdate: 0, lastScanned: 0 };
      const readJobStatus = createJobStatusReader(jobId);
      const progressCb = (progress) => {
        const now = Date.now();
        if (progress.scanned - progressState.lastScanned < 5 && now - progressState.lastUpdate < 500) {
          return;
        }
        progressState.lastUpdate = now;
        progressState.lastScanned = progress.scanned;
        updateJobProgress(jobId, progress).catch((err) => {
          console.error('Job progress update error:', err);
        });
      };

      const result = await crawlSite(
        payload.url,
        payload.maxPages,
        payload.maxDepth,
        payload.options || {},
        progressCb,
        readJobStatus
      );

      if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;

      await markJobComplete(jobId, result);
      return;
    }

    if (jobType === JOB_TYPES.screenshot) {
      const result = await captureScreenshot(payload.url, payload.type || 'full');
      if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;
      await markJobComplete(jobId, result);
      return;
    }

    if (jobType === JOB_TYPES.imageCapture) {
      const result = await runImageCaptureJob(jobId, payload);
      if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;
      await markJobComplete(jobId, result);
      return;
    }

    if (jobType === JOB_TYPES.discovery) {
      const result = await runDiscoveryJob(jobId, payload);
      if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;
      await markJobComplete(jobId, result);
      return;
    }

    if (jobType === JOB_TYPES.email) {
      const result = await processEmailDeliveryJobAsync(job);
      if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;
      await markJobComplete(jobId, result);
      return;
    }

    throw new Error(`Unknown job type: ${job.type}`);
  } catch (error) {
    if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;
    console.error(`[jobs] ${jobType || job.type} job ${jobId} failed:`, error?.message || error);
    await markJobFailed(jobId, error);
  }
}

let jobLoopRunning = false;
const runJobLoop = async () => {
  if (jobLoopRunning) return;
  jobLoopRunning = true;
  while (activeJobs < JOB_MAX_CONCURRENCY) {
    const job = await takeNextJob();
    if (!job) break;
    activeJobs += 1;
    processJob(job)
      .catch((err) => console.error('Job processing error:', err))
      .finally(() => {
        activeJobs -= 1;
      });
  }
  jobLoopRunning = false;
};

if (JOB_WORKER_TYPES.length > 0) {
  console.log(`[jobs] processor enabled for types=${JOB_WORKER_TYPES.join(',')}`);
  setInterval(() => {
    runJobLoop().catch((err) => console.error('Job loop error:', err));
  }, JOB_POLL_INTERVAL_MS);
  setTimeout(() => {
    runJobLoop().catch((err) => console.error('Job loop error:', err));
  }, 0);
} else {
  console.log('[jobs] processor disabled');
}

app.get('/', (_, res) => res.status(200).send('Loxo backend OK'));
const PG_HEALTH_CACHE_MS = Number(process.env.PG_HEALTH_CACHE_MS || 30000);
let pgHealthCache = {
  ts: 0,
  value: null,
};

const getCachedPostgresHealth = async () => {
  const now = Date.now();
  if (pgHealthCache.value && now - pgHealthCache.ts < PG_HEALTH_CACHE_MS) {
    return pgHealthCache.value;
  }
  const value = await probePostgres(process.env.DATABASE_URL);
  pgHealthCache = { ts: now, value };
  return value;
};

app.get('/health', (_, res) => res.status(200).json({ ok: true }));

app.get('/health/db', async (_, res) => {
  const pg = await getCachedPostgresHealth();
  return res.status(200).json({
    ok: true,
    runtime: DB_PROVIDER,
    runtimeRequested: DB_RUNTIME.requestedProvider,
    runtimeFallback: DB_RUNTIME.fallback,
    supportedRuntimes: DB_RUNTIME.supportedProviders,
    postgres: pg,
  });
});

app.get('/health/jobs', async (_req, res) => {
  const rows = await jobStore.summarizeJobsByTypeAndStatusAsync();
  const counts = {};
  (rows || []).forEach((row) => {
    const type = row.type || 'unknown';
    const status = row.status || 'unknown';
    if (!counts[type]) counts[type] = {};
    counts[type][status] = Number(row.count || 0);
  });
  const recentScreenshotRows = await jobStore.listRecentJobsByTypeAsync(JOB_TYPES.screenshot, 10);
  const recentScreenshots = (recentScreenshotRows || []).map((row) => {
    const payload = getJobPayload(row);
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      host: payload.host || null,
      type: payload.type || null,
      error: row.error || null,
    };
  });
  return res.status(200).json({
    ok: true,
    runMode: RUN_MODE,
    processorEnabled: JOB_WORKER_TYPES.length > 0,
    workerTypes: JOB_WORKER_TYPES,
    allowedWorkerTypes: ALLOWED_JOB_TYPES_FOR_RUN_MODE,
    activeJobs,
    pollIntervalMs: JOB_POLL_INTERVAL_MS,
    maxConcurrency: JOB_MAX_CONCURRENCY,
    scanMaxPagesDefault: SCAN_LIMITS.maxPagesDefault,
    counts,
    recentScreenshots,
  });
});

app.get('/health/email', async (_req, res) => {
  await emailDeliveryStore.ensureEmailDeliverySchemaAsync();
  return res.status(200).json(getEmailHealthSnapshot());
});

app.get('/health/coediting', async (_req, res) => {
  try {
    const health = await getCoeditingHealthSnapshotAsync();
    const rollout = await summarizeCoeditingRolloutConfigAsync(process.env, {
      includeConfigErrors: false,
      includeSensitive: false,
    });
    const status = await resolveCoeditingSystemStatusAsync({ healthSnapshot: health });
    return res.status(200).json({
      ok: true,
      status: status.status,
      reason: status.reason,
      reasons: status.reasons,
      health: {
        status: health.status,
        readOnlyFallbackActive: health.readOnlyFallbackActive,
        reasons: health.reasons,
        windowSec: health.windowSec,
        observedAt: health.observedAt,
      },
      rollout,
    });
  } catch (error) {
    console.error('Get coediting health error:', error);
    return res.status(500).json({ error: 'Failed to resolve coediting health' });
  }
});

app.post('/scan', authMiddleware, scanLimiter, requireApiKey, enforceUsageLimit('scan'), async (req, res) => {
  const { url, maxPages, maxDepth, options } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const safeUrl = await assertSafeUrl(url);
    const maxPagesSafe = normalizeMaxPagesLimit(maxPages, SCAN_LIMITS.maxPagesDefault);
    const maxDepthSafe = normalizeScanDepthLimit(maxDepth);

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

    const maxPagesSafe = normalizeMaxPagesLimit(maxPages, SCAN_LIMITS.maxPagesDefault);
    const maxDepthSafe = normalizeScanDepthLimit(maxDepth);

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
    const maxPagesSafe = normalizeMaxPagesLimit(maxPages, SCAN_LIMITS.maxPagesDefault);
    const maxDepthSafe = normalizeScanDepthLimit(maxDepth);
    const jobAccessToken = crypto.randomBytes(24).toString('hex');

    const jobId = await createJob({
      type: JOB_TYPES.scan,
      payload: {
        url: safeUrl,
        maxPages: maxPagesSafe,
        maxDepth: maxDepthSafe,
        options: options || {},
        accessToken: jobAccessToken,
      },
      req,
    });

    recordUsage(req, 'scan_job', 1, {
      host: new URL(safeUrl).hostname,
      maxPages: maxPagesSafe,
      maxDepth: maxDepthSafe,
    });

    res.json({ jobId, jobAccessToken });
  } catch (e) {
    const message = e.message || 'Failed to create scan job';
    const status = message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/scan-jobs/:id', authMiddleware, requireApiKey, async (req, res) => {
  const { id } = req.params;
  const includeResult = req.query.include_result !== 'false';
  const row = await getJobRow(id);
  if (!row || row.type !== JOB_TYPES.scan) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (!isJobVisibleToRequest(row, req)) {
    return res.status(403).json({ error: 'This scan is no longer available in this browser session' });
  }
  res.json({ job: serializeJobRow(row, includeResult) });
});

app.post('/scan-jobs/:id/cancel', authMiddleware, requireApiKey, async (req, res) => {
  const { id } = req.params;
  const row = await getJobRow(id);
  if (!row || row.type !== JOB_TYPES.scan) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (!isJobVisibleToRequest(row, req)) {
    return res.status(403).json({ error: 'This scan is no longer available in this browser session' });
  }
  await markJobCanceled(id);
  res.json({ success: true });
});

app.post('/scan-jobs/:id/stop', authMiddleware, requireApiKey, async (req, res) => {
  const { id } = req.params;
  const row = await getJobRow(id);
  if (!row || row.type !== JOB_TYPES.scan) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (!isJobVisibleToRequest(row, req)) {
    return res.status(403).json({ error: 'This scan is no longer available in this browser session' });
  }
  await markJobStopping(id);
  res.json({ success: true });
});

app.get('/scan-jobs/:id/stream', authMiddleware, requireApiKey, (req, res) => {
  const { id } = req.params;

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

  const interval = setInterval(async () => {
    if (closed) {
      clearInterval(interval);
      return;
    }
    const row = await getJobRow(id);
    if (!row || row.type !== JOB_TYPES.scan) {
      sendEvent('job-error', { error: 'Job not found' });
      clearInterval(interval);
      res.end();
      return;
    }
    if (!isJobVisibleToRequest(row, req)) {
      sendEvent('job-error', { error: 'This scan is no longer available in this browser session' });
      clearInterval(interval);
      res.end();
      return;
    }
    const terminal = [JOB_STATUS.complete, JOB_STATUS.failed, JOB_STATUS.canceled].includes(row.status);
    if (terminal) {
      sendEvent('complete', serializeJobRow(row, false));
      clearInterval(interval);
      res.end();
      return;
    }

    sendEvent('update', serializeJobRow(row, false));
  }, 1000);
});

// Background discovery job (subdomain sitemap ingestion)
app.post('/api/maps/:id/discovery', authMiddleware, requireAuth, async (req, res) => {
  const { id } = req.params;

  const map = await mapStore.getMapForUserAsync(id, req.user.id);
  if (!map) {
    return res.status(404).json({ error: 'Map not found' });
  }

  const canRunDiscovery = permissionPolicy.canForResource(
    permissionPolicy.ACTIONS.DISCOVERY_RUN,
    {
      actorUserId: req.user.id,
      resourceOwnerUserId: map.user_id,
    }
  );

  if (!canRunDiscovery) {
    return res.status(404).json({ error: 'Map not found' });
  }

  try {
    const existingJobId = await findActiveDiscoveryJob(id);
    if (existingJobId) {
      return res.json({
        ok: true,
        alreadyRunning: true,
        jobId: existingJobId,
        jobType: JOB_TYPES.discovery,
        mapId: id,
      });
    }

    const jobId = await createJob({
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

function registerImageCaptureRoutes(targetApp) {
  // Bulk image capture job for thumbnails and full screenshots.
  targetApp.post('/api/maps/:id/image-capture-jobs', authMiddleware, requireAuth, async (req, res) => {
    const { id } = req.params;
    const captureType = normalizeScreenshotType(req.body?.captureType || req.body?.type);
    if (!captureType) {
      return res.status(400).json({ error: 'Invalid type. Use full or thumb.' });
    }
    const targetMode = normalizeImageCaptureTargetMode(req.body?.targetMode);
    if (!targetMode) {
      return res.status(400).json({ error: 'Invalid target mode. Use remaining or captured.' });
    }

    const scope = req.body?.scope === 'selected' ? 'selected' : 'all';
    const nodeIds = Array.isArray(req.body?.nodeIds)
      ? req.body.nodeIds.map((nodeId) => String(nodeId || '').trim()).filter(Boolean)
      : [];
    if (scope === 'selected' && nodeIds.length === 0) {
      return res.status(400).json({ error: 'No selected pages provided' });
    }
    if (nodeIds.length > 2000) {
      return res.status(400).json({ error: 'Too many selected pages' });
    }

    try {
      const map = await getImageCaptureMapForRequest(req, id);
      if (!map) return res.status(404).json({ error: 'Map not found' });

      const existingJobId = await findActiveImageCaptureJob(id, captureType);
      if (existingJobId) {
        return res.json({
          ok: true,
          alreadyRunning: true,
          jobId: existingJobId,
          jobType: JOB_TYPES.imageCapture,
          mapId: id,
        });
      }

      const jobId = await createJob({
        type: JOB_TYPES.imageCapture,
        payload: {
          mapId: id,
          captureType,
          scope,
          nodeIds,
          targetMode,
          force: targetMode === IMAGE_CAPTURE_TARGET_MODES.captured || scope === 'selected' || Boolean(req.body?.force),
        },
        req,
      });

      recordUsage(req, 'screenshot_job', 1, {
        mapId: id,
        type: captureType,
        scope,
        targetMode,
        selected: nodeIds.length,
      });

      return res.json({
        ok: true,
        jobId,
        jobType: JOB_TYPES.imageCapture,
        mapId: id,
      });
    } catch (error) {
      console.error('Create image capture job error:', error);
      return res.status(error?.status || 500).json({ error: error?.message || 'Failed to create image capture job' });
    }
  });

  targetApp.get('/api/maps/:id/image-capture-jobs/:jobId', authMiddleware, requireAuth, async (req, res) => {
    const { id, jobId } = req.params;
    const includeResult = req.query.include_result !== 'false';
    const assetUpdateCursor = Number.parseInt(req.query.asset_update_cursor, 10) || 0;
    const row = await getJobRow(jobId);
    const payload = getJobPayload(row);
    if (
      !row
      || normalizeBackgroundJobType(row.type) !== JOB_TYPES.imageCapture
      || payload.mapId !== id
      || !isJobVisibleToRequest(row, req)
    ) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = serializeJobRow(row, includeResult);
    if (job?.progress && Array.isArray(job.progress.nodeAssetUpdates)) {
      job.progress.nodeAssetUpdates = job.progress.nodeAssetUpdates.filter((entry) => {
        const seq = Number(entry?.seq || 0);
        return seq === 0 || seq > assetUpdateCursor;
      });
    }
    return res.json({ job });
  });

  targetApp.post('/api/maps/:id/image-capture-jobs/:jobId/cancel', authMiddleware, requireAuth, async (req, res) => {
    const { id, jobId } = req.params;
    const row = await getJobRow(jobId);
    const payload = getJobPayload(row);
    if (
      !row
      || normalizeBackgroundJobType(row.type) !== JOB_TYPES.imageCapture
      || payload.mapId !== id
      || !isJobVisibleToRequest(row, req)
    ) {
      return res.status(404).json({ error: 'Job not found' });
    }
    await markJobCanceled(jobId);
    return res.json({ success: true });
  });
}

// Screenshot endpoint - captures full-page screenshot
// Note: Playwright requires browser binaries which may not be available on all hosts
app.get('/screenshot', authMiddleware, requireApiKey, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  const screenshotType = normalizeScreenshotType(req.query?.type);
  if (!screenshotType) {
    return res.status(400).json({ error: 'Invalid type. Use full or thumb.' });
  }
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

  const abortController = new AbortController();
  let clientGone = false;
  req.on('close', () => {
    if (!res.writableEnded) {
      clientGone = true;
      abortController.abort();
    }
  });

  try {
    recordUsage(req, 'screenshot', 1, { host: new URL(safeUrl).hostname, type: screenshotType });
    const result = await captureScreenshot(safeUrl, screenshotType, { signal: abortController.signal });
    if (clientGone) return;
    res.json(result);
  } catch (e) {
    if (clientGone) return;
    console.error('Screenshot error:', e.message);
    // Return a short, user-friendly error
    if (e.message?.includes('Screenshot capture stopped')) {
      return res.status(499).json({ error: 'Screenshot capture stopped' });
    }
    if (e.code === 'SCREENSHOT_AUTH_REQUIRED' || e.message?.includes('requires authentication')) {
      return res.status(409).json({ error: 'Screenshot capture requires authentication. Prompted credentials are not supported yet.' });
    }
    if (e.message?.includes('Screenshot queue full')) {
      return res.status(429).json({ error: 'Screenshot queue full' });
    }
    const shortError = e.message?.includes('Executable')
      ? 'Screenshots not available in this environment'
      : 'Screenshot failed';
    res.status(500).json({ error: shortError });
  }
});

app.post('/screenshot-assets/validate', authMiddleware, requireApiKey, async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
  const limitedUrls = urls.slice(0, 1500);
  const results = {};
  const uniqueUrls = [];
  limitedUrls.forEach((url) => {
    const key = String(url || '').trim();
    if (!key || Object.prototype.hasOwnProperty.call(results, key)) return;
    results[key] = null;
    uniqueUrls.push(key);
  });
  const validationConcurrency = 12;
  for (let start = 0; start < uniqueUrls.length; start += validationConcurrency) {
    const batch = uniqueUrls.slice(start, start + validationConcurrency);
    const batchResults = await Promise.all(batch.map((key) => validateScreenshotAssetUrl(key)));
    batch.forEach((key, index) => {
      results[key] = batchResults[index];
    });
  }
  res.json({
    ok: true,
    total: limitedUrls.length,
    results,
  });
});

// Background screenshot jobs
app.post('/screenshot-jobs', authMiddleware, requireApiKey, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });
  const screenshotType = normalizeScreenshotType(req.body?.type);
  if (!screenshotType) {
    return res.status(400).json({ error: 'Invalid type. Use full or thumb.' });
  }

  try {
    const safeUrl = await assertSafeUrl(url);
    await enforceScreenshotJobQueueLimits(req, safeUrl);
    const host = new URL(safeUrl).hostname;
    const jobId = await createJob({
      type: JOB_TYPES.screenshot,
      payload: { url: safeUrl, type: screenshotType, host },
      req,
    });

    recordUsage(req, 'screenshot_job', 1, { host, type: screenshotType });

    res.json({ jobId });
  } catch (e) {
    const message = e.message || 'Failed to create screenshot job';
    const status = e.status || (message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500);
    res.status(status).json({ error: message });
  }
});

app.get('/screenshot-jobs/:id', authMiddleware, requireApiKey, async (req, res) => {
  const { id } = req.params;
  const includeResult = req.query.include_result !== 'false';
  const row = await getJobRow(id);
  if (!row || row.type !== JOB_TYPES.screenshot || !isJobVisibleToRequest(row, req)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ job: serializeJobRow(row, includeResult) });
});

app.post('/screenshot-jobs/:id/cancel', authMiddleware, requireApiKey, async (req, res) => {
  const { id } = req.params;
  const row = await getJobRow(id);
  if (!row || row.type !== JOB_TYPES.screenshot || !isJobVisibleToRequest(row, req)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  await markJobCanceled(id);
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

  const interval = setInterval(async () => {
    if (closed) {
      clearInterval(interval);
      return;
    }
    const row = await getJobRow(id);
    if (!row || row.type !== JOB_TYPES.screenshot || !isJobVisibleToRequest(row, req)) {
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

app.use(createExpressSentryErrorMiddleware());

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit();
});

if (RUN_WEB) {
  const server = http.createServer(app);
  attachCoeditingTransport({ server });
  const listenArgs = HOST ? [PORT, HOST] : [PORT];
  server.listen(...listenArgs, () => {
    console.log(`Vellic Backend running on http://${HOST || 'localhost'}:${PORT}`);
  });
}
