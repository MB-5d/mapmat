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
  isCloudflareChallengeResponse,
} = require('./utils/scanPageClassification');
const {
  getInvalidScanResultMessage,
  getInvalidScanResultReason,
  hardenCollapsedScanResult,
} = require('./utils/scanResultQuality');
const {
  REPETITIVE_GROUP_CAPTURE_LIMIT,
  REPETITIVE_GROUP_THRESHOLD,
  buildPreservedNumberMap,
  compareNaturalScanUrls,
  compareScanNumberStrings,
  createFocusedScanDescriptor,
  getFocusedAncestorUrls,
  getRepetitiveGroupDescriptor,
  getStableRepetitiveGroupId,
  isUrlWithinFocusedPath,
  sampleSignalsAreCompatible,
} = require('./utils/scanOptimization');
const {
  IMAGE_CAPTURE_SCALE_TIERS,
  collectImageCaptureRecords,
  buildImageCapturePhases,
  buildImageCaptureStages,
  getImageCaptureEligibility,
  getImageCaptureScaleTier,
  getImageCaptureStageSize,
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
const {
  createScreenshotWorkspace,
  normalizeScreenshotStorageError,
  removeScreenshotWorkspace,
} = require('./utils/screenshotWorkspace');
const { dismissScreenshotObstructions } = require('./utils/screenshotPreparation');
const {
  ACTIVITY_SCOPES,
  ACTIVITY_TYPES,
  ensureCollaborationActivitySchemaAsync,
  recordMapActivityBestEffortAsync,
} = require('./utils/collaborationActivity');

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
const billingRouter = require('./routes/billing');
const stripeWebhookRouter = require('./routes/stripeWebhooks');
const { attachCoeditingTransport } = require('./utils/coeditingTransport');
const {
  ACTIONS: ENTITLEMENT_ACTIONS,
  METERS: ENTITLEMENT_METERS,
  checkAccountActionAsync,
  requireAccountActionAsync,
  sendEntitlementError,
  recordMeterDebitAsync,
  getScanJobDebitIdempotencyKey,
  getScreenshotCreditCost,
} = require('./utils/entitlements');

const app = express();
const isProd = process.env.NODE_ENV === 'production' || process.env.RAILWAY_PUBLIC_DOMAIN;
const isStagingRuntime = [
  process.env.APP_BASE_URL,
  process.env.FRONTEND_URL,
  process.env.PUBLIC_APP_URL,
  process.env.RAILWAY_ENVIRONMENT_NAME,
  process.env.RAILWAY_SERVICE_NAME,
  process.env.RAILWAY_PUBLIC_DOMAIN,
].some((value) => String(value || '').toLowerCase().includes('staging'));
const runtimeDefault = (stagingValue, prodValue, devValue) => (
  isStagingRuntime ? stagingValue : (isProd ? prodValue : devValue)
);
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
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
}));

app.use(cookieParser());
app.use('/api/email/webhooks', emailWebhookRouter);
app.use('/api/billing/webhooks/stripe', stripeWebhookRouter);
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
app.use('/api/billing', billingRouter);
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
  guestPages: Math.max(1, Number(process.env.GUEST_SCAN_PAGE_LIMIT ?? 25)),
};
const SCAN_DISCOVERY_MANIFEST_ENTRY_LIMIT = Math.min(
  5000,
  Math.max(0, Number(process.env.SCAN_DISCOVERY_MANIFEST_ENTRY_LIMIT ?? 1000) || 0)
);
const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};
const SCAN_HTML_RESPONSE_MAX_BYTES = toPositiveInt(
  process.env.SCAN_HTML_RESPONSE_MAX_BYTES,
  5 * 1024 * 1024
);
const SCAN_SITEMAP_RESPONSE_MAX_BYTES = toPositiveInt(
  process.env.SCAN_SITEMAP_RESPONSE_MAX_BYTES,
  10 * 1024 * 1024
);
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
  process.env.SCREENSHOT_MIN_GAP_MS ?? runtimeDefault(150, 500, 150)
);
const SCREENSHOT_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.SCREENSHOT_MAX_CONCURRENCY ?? runtimeDefault(6, 3, 6))
);
const SCREENSHOT_CAPTURE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.SCREENSHOT_CAPTURE_TIMEOUT_MS ?? 45000)
);
const SCREENSHOT_THUMB_CAPTURE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.SCREENSHOT_THUMB_CAPTURE_TIMEOUT_MS ?? runtimeDefault(12000, 20000, 20000))
);
const SCREENSHOT_PRIMARY_THUMB_CAPTURE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.SCREENSHOT_PRIMARY_THUMB_CAPTURE_TIMEOUT_MS ?? runtimeDefault(5000, 6000, 6000))
);
const SCREENSHOT_PRIMARY_NETWORK_SETTLE_TIMEOUT_MS = Math.max(
  250,
  Number(process.env.SCREENSHOT_PRIMARY_NETWORK_SETTLE_TIMEOUT_MS ?? runtimeDefault(500, 750, 750))
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
const IMAGE_CAPTURE_PRIMARY_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.IMAGE_CAPTURE_PRIMARY_MAX_ATTEMPTS ?? 1)
);
const IMAGE_CAPTURE_RECOVERY_MAX_PASSES = Math.max(
  0,
  Number(process.env.IMAGE_CAPTURE_RECOVERY_MAX_PASSES ?? 2)
);
const IMAGE_CAPTURE_RECOVERY_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.IMAGE_CAPTURE_RECOVERY_MAX_ATTEMPTS ?? Math.min(2, IMAGE_CAPTURE_MAX_ATTEMPTS))
);
const IMAGE_CAPTURE_RETRY_BASE_DELAY_MS = Math.max(
  100,
  Number(process.env.IMAGE_CAPTURE_RETRY_BASE_DELAY_MS ?? 800)
);
const IMAGE_CAPTURE_ASSET_SAVE_BATCH_SIZE = Math.max(
  1,
  Number(process.env.IMAGE_CAPTURE_ASSET_SAVE_BATCH_SIZE ?? 12)
);
const IMAGE_CAPTURE_LARGE_THUMB_SAVE_BATCH_SIZE = Math.max(
  IMAGE_CAPTURE_ASSET_SAVE_BATCH_SIZE,
  Number(process.env.IMAGE_CAPTURE_LARGE_THUMB_SAVE_BATCH_SIZE ?? 100)
);
const IMAGE_CAPTURE_LARGE_FULL_SAVE_BATCH_SIZE = Math.max(
  IMAGE_CAPTURE_ASSET_SAVE_BATCH_SIZE,
  Number(process.env.IMAGE_CAPTURE_LARGE_FULL_SAVE_BATCH_SIZE ?? 50)
);
const IMAGE_CAPTURE_ASSET_SAVE_MAX_DELAY_MS = Math.max(
  500,
  Number(process.env.IMAGE_CAPTURE_ASSET_SAVE_MAX_DELAY_MS ?? 2500)
);
const IMAGE_CAPTURE_PRIMARY_CONCURRENCY = Math.max(
  1,
  Number(
    process.env.IMAGE_CAPTURE_PRIMARY_CONCURRENCY
    ?? Math.min(SCREENSHOT_MAX_CONCURRENCY, isStagingRuntime ? 5 : 3)
  )
);
const IMAGE_CAPTURE_RECOVERY_CONCURRENCY = Math.max(
  1,
  Number(
    process.env.IMAGE_CAPTURE_RECOVERY_CONCURRENCY
    ?? Math.min(SCREENSHOT_MAX_CONCURRENCY, isStagingRuntime ? 3 : 2)
  )
);
const IMAGE_CAPTURE_PROGRESS_MIN_INTERVAL_MS = Math.max(
  250,
  Number(process.env.IMAGE_CAPTURE_PROGRESS_MIN_INTERVAL_MS ?? 1000)
);
const IMAGE_CAPTURE_PROGRESS_RESULT_LIMIT = Math.max(
  100,
  Number(process.env.IMAGE_CAPTURE_PROGRESS_RESULT_LIMIT ?? 2000)
);
const IMAGE_CAPTURE_PROGRESS_ASSET_UPDATE_LIMIT = Math.max(
  100,
  Number(process.env.IMAGE_CAPTURE_PROGRESS_ASSET_UPDATE_LIMIT ?? 2000)
);
const IMAGE_CAPTURE_MANIFEST_VALIDATION_CONCURRENCY = Math.max(
  1,
  Number(process.env.IMAGE_CAPTURE_MANIFEST_VALIDATION_CONCURRENCY ?? 24)
);
const SCREENSHOT_THUMB_PREVIEW_JPEG_QUALITY = Math.round(toBoundedNumber(
  process.env.SCREENSHOT_THUMB_PREVIEW_JPEG_QUALITY,
  { min: 60, max: 92, fallback: 84 }
));
const SCREENSHOT_NETWORK_SETTLE_TIMEOUT_MS = Math.max(
  250,
  Number(process.env.SCREENSHOT_NETWORK_SETTLE_TIMEOUT_MS ?? 1200)
);
const SCREENSHOT_RECOVERY_THUMB_CAPTURE_TIMEOUT_MS = Math.max(
  SCREENSHOT_THUMB_CAPTURE_TIMEOUT_MS,
  Number(process.env.SCREENSHOT_RECOVERY_THUMB_CAPTURE_TIMEOUT_MS ?? runtimeDefault(20000, 45000, 45000))
);
const SCREENSHOT_RECOVERY_CAPTURE_TIMEOUT_MS = Math.max(
  SCREENSHOT_CAPTURE_TIMEOUT_MS,
  Number(process.env.SCREENSHOT_RECOVERY_CAPTURE_TIMEOUT_MS ?? 75000)
);
const SCREENSHOT_RECOVERY_NETWORK_SETTLE_TIMEOUT_MS = Math.max(
  SCREENSHOT_NETWORK_SETTLE_TIMEOUT_MS,
  Number(process.env.SCREENSHOT_RECOVERY_NETWORK_SETTLE_TIMEOUT_MS ?? runtimeDefault(2000, 5000, 5000))
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
const SCAN_REQUEST_USER_AGENT = String(
  process.env.SCAN_REQUEST_USER_AGENT || SCREENSHOT_USER_AGENTS[0]
).trim();
const CLOUDFLARE_UTILITY_PATHS = new Set([
  '/cdn-cgi/l/email-protection',
]);

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

async function assertSafeUrl(rawUrl, options = {}) {
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
        if (options?.allowUnresolved) return urlObj.toString();
        throw new Error('Unable to resolve host');
      }
      if (!records.length) {
        if (options?.allowUnresolved) return urlObj.toString();
        throw new Error('Unable to resolve host');
      }
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
const scanPreviewLimiter = createRateLimiter({
  windowMs: SCAN_RATE_WINDOW_MS,
  max: Math.max(SCAN_RATE_LIMIT, 240),
  name: 'scan_preview',
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

  if (rowAccessToken) {
    if (jobAccessToken) return rowAccessToken === jobAccessToken;
    if (!row.user_id) return false;
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
    const [filenames, manifestRows] = await Promise.all([
      mapStore.listPersistedScreenshotFilenamesAsync(),
      imageAssetStore.listSavedImageAssetStorageKeysAsync(),
    ]);
    screenshotProtectedFilenames = new Set(filenames || []);
    (manifestRows || []).forEach((row) => {
      const key = extractScreenshotStorageKey(row.storage_key || row.url || '');
      if (key) screenshotProtectedFilenames.add(key);
    });
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
  paused: 'paused',
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
  const progress = parseJsonSafe(row.progress);
  const result = includeResult ? parseJsonSafe(row.result) : null;
  if (includeResult && row.type === JOB_TYPES.scan && row.status === JOB_STATUS.complete && result?.root) {
    hardenCollapsedScanResult(result, {
      progress,
      entitlementCapped: Boolean(payload.entitlement?.capped),
    });
    applyScanEntitlementMetadata(result, payload.entitlement || null);
  }
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    payload: sanitizeJobPayload(payload),
    progress,
    result,
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

const findScanJobByIdempotencyKey = async (req, idempotencyKey, safeUrl) => {
  if (!idempotencyKey) return null;
  const identity = getRequestJobIdentity(req);
  if (!identity) return null;
  return jobStore.findJobByIdempotencyAsync({
    type: JOB_TYPES.scan,
    statuses: [JOB_STATUS.queued, JOB_STATUS.running, JOB_STATUS.stopping, JOB_STATUS.complete],
    identityColumn: identity.column,
    identityValue: identity.value,
    idempotencyKey,
    requestUrl: safeUrl,
  });
};

const normalizeImageCaptureNodeIdList = (nodeIds) => (
  Array.from(new Set(
    (Array.isArray(nodeIds) ? nodeIds : [])
      .map((nodeId) => String(nodeId || '').trim())
      .filter(Boolean)
  )).sort()
);

const imageCaptureRequestsMatch = (payload, request) => {
  const payloadScope = payload?.scope === 'selected' ? 'selected' : 'all';
  const requestScope = request?.scope === 'selected' ? 'selected' : 'all';
  if (payloadScope !== requestScope) return false;
  const payloadTargetMode = normalizeImageCaptureTargetMode(payload?.targetMode) || IMAGE_CAPTURE_TARGET_MODES.remaining;
  const requestTargetMode = normalizeImageCaptureTargetMode(request?.targetMode) || IMAGE_CAPTURE_TARGET_MODES.remaining;
  if (payloadTargetMode !== requestTargetMode) return false;
  if (payloadScope !== 'selected') return true;
  const left = normalizeImageCaptureNodeIdList(payload?.nodeIds);
  const right = normalizeImageCaptureNodeIdList(request?.nodeIds);
  if (left.length !== right.length) return false;
  return left.every((nodeId, index) => nodeId === right[index]);
};

const getSettledImageCaptureProgress = (row) => {
  const progress = parseJsonSafe(row?.progress);
  if (!progress || typeof progress !== 'object') return null;
  if (progress.stopped) return { status: JOB_STATUS.canceled, result: progress };
  const total = Math.max(0, Number(progress.total) || 0);
  const completed = Math.max(0, Number(progress.completed) || 0);
  if (total > 0 && completed >= total && !progress.currentNodeId) {
    return { status: JOB_STATUS.complete, result: progress };
  }
  return null;
};

function getImageCaptureActivityLabel(captureType) {
  return captureType === SCREENSHOT_TYPES.full ? 'full screenshots' : 'thumbnails';
}

async function recordImageCaptureCompletionActivity({ jobId, mapRow, summary }) {
  const mapId = String(summary?.mapId || mapRow?.id || '').trim();
  const updatedCount = Math.max(0, Number(summary?.captured || 0) || 0);
  if (!mapId || updatedCount <= 0) return;

  const label = getImageCaptureActivityLabel(summary?.captureType);
  const pageText = `${updatedCount} page${updatedCount === 1 ? '' : 's'}`;
  let actorUserId = null;
  try {
    const job = await jobStore.getJobByIdAsync(jobId);
    actorUserId = job?.user_id || null;
  } catch {
    actorUserId = null;
  }
  const actorRole = permissionPolicy.resolveResourceRole({
    actorUserId,
    resourceOwnerUserId: mapRow?.user_id || null,
    membershipRole: null,
  });

  try {
    await ensureCollaborationActivitySchemaAsync();
    await recordMapActivityBestEffortAsync({
      mapId,
      actorUserId,
      actorRole,
      eventType: ACTIVITY_TYPES.CONTENT_IMAGES_UPDATED,
      eventScope: ACTIVITY_SCOPES.CONTENT,
      entityType: 'map',
      entityId: mapId,
      summary: `Updated ${label} for ${pageText}`,
      payload: {
        jobId,
        captureType: summary?.captureType || null,
        scope: summary?.scope || null,
        targetMode: summary?.targetMode || null,
        updatedCount,
        saved: Number(summary?.saved || 0) || 0,
        total: Number(summary?.total || 0) || 0,
        failed: Number(summary?.failed || 0) || 0,
        skipped: Number(summary?.skipped || 0) || 0,
      },
    }, { label: 'image capture complete' });
  } catch (error) {
    console.error('Record image capture activity error:', error);
  }
}

const findActiveImageCaptureJob = async (mapId, captureType, request = {}) => {
  const rows = await jobStore.listJobPayloadsByTypeAndStatusesAsync(
    JOB_TYPES.imageCapture,
    [JOB_STATUS.queued, JOB_STATUS.running, JOB_STATUS.paused, JOB_STATUS.stopping]
  );

  for (const row of rows) {
    const payload = getJobPayload(row);
    if (payload.mapId === mapId && payload.captureType === captureType) {
      if (row.status === JOB_STATUS.stopping) {
        await markJobCanceled(row.id);
        continue;
      }
      const settledProgress = getSettledImageCaptureProgress(row);
      if (settledProgress?.status === JOB_STATUS.complete) {
        await markJobComplete(row.id, settledProgress.result);
        continue;
      }
      if (settledProgress?.status === JOB_STATUS.canceled) {
        await markJobCanceled(row.id);
        continue;
      }
      return {
        id: row.id,
        matchesRequest: imageCaptureRequestsMatch(payload, request),
      };
    }
  }
  return null;
};

const findAnyActiveImageCaptureJob = async (mapId) => {
  const rows = await jobStore.listJobPayloadsByTypeAndStatusesAsync(
    JOB_TYPES.imageCapture,
    [JOB_STATUS.queued, JOB_STATUS.running, JOB_STATUS.paused, JOB_STATUS.stopping]
  );

  for (const row of rows) {
    const payload = getJobPayload(row);
    if (payload.mapId !== mapId) continue;
    if (row.status === JOB_STATUS.stopping) {
      await markJobCanceled(row.id);
      continue;
    }
    const settledProgress = getSettledImageCaptureProgress(row);
    if (settledProgress?.status === JOB_STATUS.complete) {
      await markJobComplete(row.id, settledProgress.result);
      continue;
    }
    if (settledProgress?.status === JOB_STATUS.canceled) {
      await markJobCanceled(row.id);
      continue;
    }
    return row;
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

const createJob = async ({ type, payload, req, status = JOB_STATUS.queued }) => {
  const id = crypto.randomUUID();
  const userId = req.user?.id || null;
  const apiKey = getApiKey(req);
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  await jobStore.insertJobAsync({
    id,
    type,
    status,
    startedAt: status === JOB_STATUS.running ? new Date().toISOString() : null,
    userId,
    apiKey,
    ipHash,
    payload: JSON.stringify(payload || {}),
    idempotencyKey: payload?.idempotencyKey || null,
    requestUrl: payload?.url || null,
  });

  return id;
};

let activeJobs = 0;
const activeJobIds = new Set();

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
  await jobStore.markJobCompleteAsync(
    id,
    JOB_STATUS.complete,
    JSON.stringify(result || {}),
    JOB_STATUS.queued,
    JOB_STATUS.running,
    JOB_STATUS.paused,
    JOB_STATUS.stopping
  );
};

function countScanResultPages(result) {
  if (result?.captureSummary) {
    return Math.max(0, Number(result.captureSummary.capturedCount || 0) || 0);
  }
  const seen = new Set();
  const stack = [];
  if (result?.root) stack.push(result.root);
  if (Array.isArray(result?.orphans)) stack.push(...result.orphans);
  let count = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const key = String(node.id || node.url || `${seen.size}:${stack.length}`);
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      !node.isVirtualMissing
      && !node.isStructuralContext
      && !node.isEntitlementLocked
      && !node.entitlementLocked
      && node.nodeKind !== 'focus-ghost'
      && node.nodeKind !== 'deferred-group'
    ) {
      count += 1;
    }
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return count;
}

async function debitScanPagesForJobAsync({
  jobId,
  jobUserId,
  result,
}) {
  const pageCount = countScanResultPages(result);
  if (!jobUserId || pageCount <= 0) return;
  await recordMeterDebitAsync({
    user: { id: jobUserId },
    meter: ENTITLEMENT_METERS.crawlPages,
    quantity: pageCount,
    idempotencyKey: getScanJobDebitIdempotencyKey(jobId),
    metadata: { jobId, pageCount },
  });
}

function getFiniteNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function buildGuestScanEntitlementPayload(requestedPages) {
  const allowedPages = Math.min(requestedPages, SCAN_LIMITS.guestPages);
  return {
    mode: 'guest',
    planName: 'Guest',
    requestedPages,
    allowedPages,
    remaining: SCAN_LIMITS.guestPages,
    capped: allowedPages < requestedPages,
    capReason: allowedPages < requestedPages ? 'guest_limit' : null,
  };
}

function getAccountScanCapReason({ summary, requestedPages, allowedPages }) {
  if (allowedPages >= requestedPages) return null;
  const activePageLimit = summary?.limits?.activePages || summary?.meters?.activePages || summary?.meters?.crawlPages || {};
  const perScanLimit = summary?.limits?.scanPagesPerRun || {};
  const activeRemaining = activePageLimit.unlimited
    ? requestedPages
    : getFiniteNonNegativeInteger(activePageLimit.remaining, 0);
  const perScanAllowed = perScanLimit.unlimited
    ? requestedPages
    : Math.max(1, getFiniteNonNegativeInteger(perScanLimit.limit, requestedPages));

  if (!activePageLimit.unlimited && activeRemaining <= allowedPages) {
    return 'monthly_remaining';
  }
  if (!perScanLimit.unlimited && perScanAllowed <= activeRemaining && perScanAllowed <= allowedPages) {
    return 'per_scan_limit';
  }
  return 'account_limit';
}

function buildAccountScanEntitlementPayload(entitlement, requestedPages) {
  const summary = entitlement?.summary || null;
  const allowedPages = Math.max(1, getFiniteNonNegativeInteger(entitlement?.allowedQuantity, requestedPages));
  const activePageLimit = summary?.limits?.activePages || summary?.meters?.activePages || summary?.meters?.crawlPages || {};
  const remaining = activePageLimit.unlimited
    ? null
    : getFiniteNonNegativeInteger(activePageLimit.remaining, allowedPages);
  const capped = allowedPages < requestedPages;

  return {
    mode: 'account',
    accountId: summary?.account?.id || null,
    planName: summary?.plan?.name || 'Free',
    requestedPages,
    allowedPages,
    remaining,
    capped,
    capReason: getAccountScanCapReason({ summary, requestedPages, allowedPages }),
  };
}

async function resolveScanEntitlementForRequestAsync(req, requestedPages) {
  if (!req.user) {
    const entitlementPayload = buildGuestScanEntitlementPayload(requestedPages);
    return {
      allowed: true,
      entitledMaxPages: entitlementPayload.allowedPages,
      entitlementPayload,
      entitlement: null,
    };
  }

  const entitlement = await checkAccountActionAsync(req.user, ENTITLEMENT_ACTIONS.scanStart, {
    requestedPages,
  });
  if (!entitlement.allowed) {
    return { allowed: false, entitlement };
  }

  const entitlementPayload = buildAccountScanEntitlementPayload(entitlement, requestedPages);
  return {
    allowed: true,
    entitledMaxPages: entitlementPayload.allowedPages,
    entitlementPayload,
    entitlement,
  };
}

function applyScanEntitlementMetadata(result, entitlement = null) {
  if (!result || !entitlement) return result;
  const capped = Boolean(entitlement.capped);
  const requestedPages = Math.max(0, Number(entitlement.requestedPages || 0) || 0);
  const allowedPages = Math.max(0, Number(entitlement.allowedPages || 0) || 0);
  const visiblePageCount = countScanResultPages(result);
  if (!capped) {
    result.entitlement = {
      capped: false,
      mode: entitlement.mode || 'account',
      requestedPages: requestedPages || null,
      allowedPages: allowedPages || null,
      visiblePageCount,
    };
    return result;
  }

  const queueRemaining = Math.max(0, Number(result.scanDiagnostics?.queueRemaining || 0) || 0);
  const visitedCount = Math.max(0, Number(result.scanDiagnostics?.visitedCount || 0) || 0);
  const queuedCount = Math.max(0, Number(result.scanDiagnostics?.queuedCount || 0) || 0);
  const unvisitedQueued = Math.max(0, queuedCount - visitedCount);
  const manifestHiddenPageCount = Math.max(
    0,
    Number(result.discoveryManifest?.hiddenPageCount || result.scanDiagnostics?.discoveryManifest?.hiddenPageCount || 0) || 0
  );
  const lockedPageEstimate = Math.max(queueRemaining, unvisitedQueued, manifestHiddenPageCount);
  const limitReached = lockedPageEstimate > 0;
  if (!limitReached) {
    result.entitlement = {
      capped: true,
      limitReached: false,
      mode: entitlement.mode || 'account',
      requestedPages: requestedPages || null,
      allowedPages: allowedPages || null,
      visiblePageLimit: allowedPages || null,
      visiblePageCount,
      lockedPageEstimate: 0,
    };
    return result;
  }
  result.partial = true;
  result.partialReason = result.partialReason || 'entitlement_cap';
  result.entitlement = {
    capped: true,
    limitReached: true,
    mode: entitlement.mode || 'account',
    requestedPages: requestedPages || null,
    allowedPages: allowedPages || null,
    visiblePageLimit: allowedPages || null,
    visiblePageCount,
    lockedPageEstimate,
  };
  if (result.scanDiagnostics) {
    result.scanDiagnostics.entitlementCapped = true;
    result.scanDiagnostics.entitlementVisiblePageCount = visiblePageCount;
    result.scanDiagnostics.entitlementLockedPageEstimate = lockedPageEstimate;
  }
  return result;
}

function getScanResultFailureError(result) {
  const reason = getInvalidScanResultReason(result);
  if (!reason) return null;
  const error = new Error(getInvalidScanResultMessage(reason));
  error.status = 422;
  error.scanFailureReason = reason;
  return error;
}

function getScanOutcomeLabel(result, failureReason = null) {
  if (failureReason) return 'failed';
  if (result?.partialReason === 'entitlement_cap') return 'limited';
  if (result?.partialReason === 'stopped_by_user') return 'stopped';
  if (result?.partial) return result.partialReason || 'partial';
  return 'complete';
}

function logScanOutcome({ jobId = null, result = null, payload = null, failureReason = null }) {
  const diagnostics = result?.scanDiagnostics || {};
  const manifest = result?.discoveryManifest || diagnostics.discoveryManifest || {};
  const capturedCount = Math.max(
    Number(diagnostics.pageMapCount || 0) || 0,
    Number(manifest.capturedPageCount || 0) || 0,
    result ? countScanResultPages(result) : 0
  );
  const hiddenCount = Math.max(
    Number(manifest.hiddenPageCount || 0) || 0,
    Number(diagnostics.entitlementLockedPageEstimate || 0) || 0,
    Number(result?.entitlement?.lockedPageEstimate || 0) || 0
  );
  const discoveredCount = Math.max(
    Number(manifest.totalDiscoveredPageCount || 0) || 0,
    Number(diagnostics.queuedCount || 0) || 0,
    capturedCount + hiddenCount
  );

  console.info('[scan] Outcome:', {
    jobId,
    outcome: getScanOutcomeLabel(result, failureReason),
    partialReason: result?.partialReason || null,
    failureReason,
    discoveredCount,
    capturedCount,
    hiddenCount,
    stopped: result?.partialReason === 'stopped_by_user' || diagnostics.previousPartialReason === 'stopped_by_user',
    capped: Boolean(result?.entitlement?.capped || payload?.entitlement?.capped),
    collapseReason: diagnostics.collapseReason || null,
  });
}

async function debitScreenshotCreditsForJobAsync({ jobId, jobUserId, type, result }) {
  if (!jobUserId || result?.cached) return;
  const credits = getScreenshotCreditCost({ type });
  await recordMeterDebitAsync({
    user: { id: jobUserId },
    meter: ENTITLEMENT_METERS.screenshotCredits,
    quantity: credits,
    idempotencyKey: `screenshot-job:${jobId}:${type || 'full'}`,
    metadata: { jobId, type, credits },
  });
}

async function debitImageCaptureCreditsForJobAsync({ jobId, jobUserId, result }) {
  if (!jobUserId || !result || result.status === 'stopped') return;
  const captured = Math.max(0, Number(result.captured || 0) || 0);
  if (captured <= 0) return;
  const credits = captured * getScreenshotCreditCost({ type: result.captureType || 'thumb' });
  await recordMeterDebitAsync({
    user: { id: jobUserId },
    meter: ENTITLEMENT_METERS.screenshotCredits,
    quantity: credits,
    idempotencyKey: `image-capture-job:${jobId}:${result.captureType || 'thumb'}`,
    metadata: {
      jobId,
      mapId: result.mapId || null,
      captureType: result.captureType || null,
      captured,
      credits,
    },
  });
}

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
    JOB_STATUS.running,
    JOB_STATUS.paused,
    JOB_STATUS.stopping
  );
};

const markJobStopping = async (id) => {
  await jobStore.markJobStoppingAsync(
    id,
    JOB_STATUS.stopping,
    JOB_STATUS.queued,
    JOB_STATUS.running,
    JOB_STATUS.paused
  );
};

const markJobPaused = async (id) => {
  await jobStore.updateJobStatusAsync(id, JOB_STATUS.paused, [JOB_STATUS.running]);
};

const markJobResumed = async (id) => {
  await jobStore.updateJobStatusAsync(id, JOB_STATUS.running, [JOB_STATUS.paused]);
};

const recoverInterruptedScanJobs = async () => {
  if (!JOB_WORKER_TYPES.includes(JOB_TYPES.scan)) return;
  const interrupted = await jobStore.listJobPayloadsByTypeAndStatusesAsync(
    JOB_TYPES.scan,
    [JOB_STATUS.running, JOB_STATUS.stopping]
  );
  if (!interrupted.length) return;

  const error = new Error('Scan was interrupted before it could finish. No map was created.');
  for (const row of interrupted) {
    await markJobFailed(row.id, error);
  }
  console.warn('[scan] Marked interrupted scan jobs as failed on startup:', {
    count: interrupted.length,
    jobIds: interrupted.map((row) => row.id),
  });
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

function getImageCaptureManifestPrimaryField(captureType) {
  return captureType === SCREENSHOT_TYPES.full ? 'fullScreenshotUrl' : 'thumbnailUrl';
}

function getSavedImageCaptureManifestRows(manifestRows, captureType = null) {
  const primaryField = captureType ? getImageCaptureManifestPrimaryField(captureType) : null;
  return (Array.isArray(manifestRows) ? manifestRows : []).filter((row) => {
    if (String(row?.status || 'saved') !== 'saved') return false;
    if (!row?.url) return false;
    if (primaryField && row.asset_field !== primaryField) return false;
    return true;
  });
}

function getSavedImageCaptureManifestNodeIds(manifestRows, captureType) {
  return new Set(
    getSavedImageCaptureManifestRows(manifestRows, captureType)
      .map((row) => String(row.node_id || '').trim())
      .filter(Boolean)
  );
}

async function verifySavedImageCaptureManifestRows({ mapId, manifestRows }) {
  const savedRows = getSavedImageCaptureManifestRows(manifestRows);
  if (savedRows.length === 0) return [];

  const verifiedRows = [];
  const missingEntries = [];
  for (let start = 0; start < savedRows.length; start += IMAGE_CAPTURE_MANIFEST_VALIDATION_CONCURRENCY) {
    const batch = savedRows.slice(start, start + IMAGE_CAPTURE_MANIFEST_VALIDATION_CONCURRENCY);
    const results = await Promise.all(batch.map((row) => validateScreenshotAssetUrl(row.url)));
    batch.forEach((row, index) => {
      if (results[index]?.available) {
        verifiedRows.push(row);
        return;
      }
      missingEntries.push({
        mapId,
        nodeId: row.node_id,
        assetField: row.asset_field,
        assetType: row.asset_type,
        storageKey: row.storage_key,
        url: row.url,
        provider: row.provider || getScreenshotStorageProvider(),
        width: row.width,
        height: row.height,
        sizeBytes: row.size_bytes,
        contentType: row.content_type,
        error: 'Missing saved asset',
      });
    });
  }

  if (missingEntries.length > 0) {
    await imageAssetStore.markImageAssetsMissingAsync(missingEntries);
  }
  return verifiedRows;
}

async function repairImageCaptureMapFieldsFromManifest({ mapId, root, orphans, manifestRows }) {
  const updatesById = new Map();
  getSavedImageCaptureManifestRows(manifestRows).forEach((row) => {
    const nodeId = String(row.node_id || '').trim();
    const assetField = String(row.asset_field || '').trim();
    const url = String(row.url || '').trim();
    if (!nodeId || !url || !IMAGE_CAPTURE_ASSET_URL_FIELDS.has(assetField)) return;
    updatesById.set(nodeId, {
      ...(updatesById.get(nodeId) || {}),
      [assetField]: url,
      ...(assetField === 'thumbnailUrl' ? {
        thumbnailCaptureFailed: false,
        thumbnailCaptureError: null,
        thumbnailCaptureFailedAt: null,
      } : {}),
    });
  });

  if (updatesById.size === 0) return { root, orphans, changed: false };

  const nextMap = applyImageCaptureUpdatesToMapData({ root, orphans, updatesById });
  if (!nextMap.changed) return { root, orphans, changed: false };

  await mapStore.updateMapByIdAsync(mapId, {
    rootData: JSON.stringify(nextMap.root),
    orphansData: nextMap.orphans.length ? JSON.stringify(nextMap.orphans) : null,
  });
  return {
    root: nextMap.root,
    orphans: nextMap.orphans,
    changed: true,
  };
}

function isTerminalThumbnailFailure(node) {
  return false;
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

const RENDERABLE_TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'csv', 'tsv', 'rtf', 'md', 'markdown', 'log',
]);

const RENDERABLE_TEXT_CONTENT_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'text/markdown',
  'text/x-markdown',
  'text/rtf',
  'application/rtf',
]);

function isRenderableTextFileExtension(extension) {
  return RENDERABLE_TEXT_FILE_EXTENSIONS.has(String(extension || '').toLowerCase());
}

function isRenderableTextContentType(contentType) {
  return RENDERABLE_TEXT_CONTENT_TYPES.has(normalizeContentType(contentType));
}

function getImageCaptureSkipReason(node) {
  const eligibility = getImageCaptureEligibility(node);
  if (!eligibility.eligible) {
    return {
      status: 'not_eligible',
      code: eligibility.code,
      reason: eligibility.reason,
    };
  }
  const orphanType = String(node?.orphanType || '').toLowerCase();
  const pageType = String(node?.pageType || node?.type || '').toLowerCase();
  const extension = getUrlExtension(node?.url);
  const isRenderableTextFile = isRenderableTextFileExtension(extension);
  const fileExtensions = new Set([
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'zip', 'rar', '7z',
  ]);
  if (
    (!isRenderableTextFile && (
      node?.isFile
      || orphanType === 'file'
      || pageType === 'file'
    ))
    || fileExtensions.has(extension)
  ) {
    return {
      status: 'skipped',
      code: 'file',
      reason: extension ? `${extension.toUpperCase()} file` : 'File link',
    };
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
  manifestRows = [],
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
  const excludedRecords = [];
  const skippedRecords = [];
  const captureRecords = [];
  const recaptureCapturedOnly = targetMode === IMAGE_CAPTURE_TARGET_MODES.captured;
  const savedManifestNodeIds = getSavedImageCaptureManifestNodeIds(manifestRows, captureType);
  const targetScopedRecords = recaptureCapturedOnly
    ? scopedRecords.filter((record) => savedManifestNodeIds.has(record.nodeId))
    : scopedRecords;
  for (const record of targetScopedRecords) {
    if (recaptureCapturedOnly) {
      if (!savedManifestNodeIds.has(record.nodeId)) continue;
    }
    const skipReason = getImageCaptureSkipReason(record.node);
    if (skipReason) {
      if (skipReason.status === 'not_eligible') {
        excludedRecords.push({ ...record, skipReason });
        continue;
      }
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
    if (savedManifestNodeIds.has(record.nodeId)) {
      cached += 1;
      continue;
    }
    if (isTerminalThumbnailFailure(record.node)) {
      unavailable += 1;
      continue;
    }
    captureRecords.push(record);
  }

  const excludedNodeIds = new Set(excludedRecords.map((record) => record.nodeId));
  const eligibleScopedRecords = targetScopedRecords.filter(
    (record) => !excludedNodeIds.has(record.nodeId)
  );
  const excludedReasons = excludedRecords.reduce((counts, record) => {
    const code = record.skipReason?.code || 'not_eligible';
    counts[code] = (counts[code] || 0) + 1;
    return counts;
  }, {});
  return {
    records,
    scopedRecords: eligibleScopedRecords,
    captureRecords,
    skippedRecords,
    excludedRecords,
    excludedReasons,
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

function trimImageCaptureAssetUpdates(updates) {
  if (!Array.isArray(updates)) return [];
  if (updates.length <= IMAGE_CAPTURE_PROGRESS_ASSET_UPDATE_LIMIT) return updates;
  return updates.slice(updates.length - IMAGE_CAPTURE_PROGRESS_ASSET_UPDATE_LIMIT);
}

function getImageCaptureAssetSaveBatchSize(captureType, scaleTier) {
  if (scaleTier !== IMAGE_CAPTURE_SCALE_TIERS.large) return IMAGE_CAPTURE_ASSET_SAVE_BATCH_SIZE;
  return captureType === SCREENSHOT_TYPES.full
    ? IMAGE_CAPTURE_LARGE_FULL_SAVE_BATCH_SIZE
    : IMAGE_CAPTURE_LARGE_THUMB_SAVE_BATCH_SIZE;
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

  let root = parseJsonSafe(mapRow.root_data);
  let orphans = parseJsonSafe(mapRow.orphans_data) || [];
  const savedManifestRows = await imageAssetStore.listSavedImageAssetsByMapAsync(mapId);
  const manifestRows = await verifySavedImageCaptureManifestRows({
    mapId,
    manifestRows: savedManifestRows,
  });
  const repairedMap = await repairImageCaptureMapFieldsFromManifest({
    mapId,
    root,
    orphans,
    manifestRows,
  });
  root = repairedMap.root;
  orphans = repairedMap.orphans;
  const targetPlan = await buildImageCaptureTargets({
    root,
    orphans,
    captureType,
    scope,
    nodeIds,
    force,
    targetMode,
    manifestRows,
  });

  const startedAt = Date.now();
  const scaleTier = getImageCaptureScaleTier(captureType, targetPlan.captureRecords.length);
  const stageSize = getImageCaptureStageSize(captureType, targetPlan.captureRecords.length);
  const stages = buildImageCaptureStages(targetPlan.captureRecords, captureType);
  const assetSaveBatchSize = getImageCaptureAssetSaveBatchSize(captureType, scaleTier);
  const summary = {
    mapId,
    captureType,
    scope,
    targetMode,
    scaleTier,
    stageIndex: stages.length ? 1 : 0,
    stageTotal: stages.length,
    stageSize,
    total: targetPlan.scopedRecords.length,
    eligibleTotal: targetPlan.scopedRecords.length,
    excluded: targetPlan.excludedRecords.length,
    excludedReasons: targetPlan.excludedReasons,
    exclusions: targetPlan.excludedRecords.slice(0, IMAGE_CAPTURE_PROGRESS_RESULT_LIMIT).map((record) => ({
      nodeId: record.nodeId,
      status: 'not_eligible',
      code: record.skipReason?.code || 'not_eligible',
      error: record.skipReason?.reason || 'Page is not eligible for capture',
    })),
    cached: targetPlan.cached,
    unavailable: targetPlan.unavailable,
    completed: targetPlan.cached + targetPlan.unavailable,
    captured: 0,
    saved: targetPlan.cached,
    verified: targetPlan.cached,
    failed: 0,
    blocked: 0,
    missingAsset: 0,
    skipped: 0,
    batchIndex: 0,
    batchTotal: 0,
    phase: 'preparing',
    recoveryPass: 0,
    retrying: 0,
    paused: false,
    currentNodeId: null,
    assetUpdateCursor: 0,
    targetIds: targetPlan.scopedRecords.map((record) => record.nodeId),
    results: [],
    nodeAssetUpdates: [],
  };
  await updateJobProgress(jobId, summary);

  const readStatus = createJobStatusReader(jobId, 500);
  let progressWritePromise = Promise.resolve();
  let lastProgressPublishedAt = 0;
  const publishProgress = async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastProgressPublishedAt < IMAGE_CAPTURE_PROGRESS_MIN_INTERVAL_MS) return;
    lastProgressPublishedAt = now;
    const snapshot = {
      ...summary,
      results: trimImageCaptureResults(summary.results),
      nodeAssetUpdates: trimImageCaptureAssetUpdates(summary.nodeAssetUpdates),
      elapsedMs: now - startedAt,
    };
    progressWritePromise = progressWritePromise
      .catch(() => {})
      .then(() => updateJobProgress(jobId, snapshot));
    await progressWritePromise;
  };

  const pendingAssetSaves = [];
  let lastAssetFlushAt = Date.now();
  let assetFlushPromise = null;
  const appendNodeAssetUpdate = (nodeId, assets) => {
    summary.assetUpdateCursor += 1;
    summary.nodeAssetUpdates.push({
      seq: summary.assetUpdateCursor,
      nodeId,
      assets,
    });
  };
  const incrementResultCounter = (status) => {
    if (status === 'saved') {
      summary.captured += 1;
      summary.saved += 1;
      summary.verified += 1;
    }
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
    if (
      pendingAssetSaves.length >= assetSaveBatchSize
      || Date.now() - lastAssetFlushAt >= IMAGE_CAPTURE_ASSET_SAVE_MAX_DELAY_MS
    ) {
      await flushAssetSaves();
    }
  };
  async function flushAssetSaves() {
    while (assetFlushPromise) {
      await assetFlushPromise;
    }
    if (pendingAssetSaves.length === 0) return;
    const batch = pendingAssetSaves.splice(0, pendingAssetSaves.length);
    assetFlushPromise = (async () => {
      const previousPhase = summary.phase;
      summary.phase = 'saving';
      await publishProgress({ force: true });
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
      lastAssetFlushAt = Date.now();
      summary.phase = previousPhase;
    })();
    try {
      await assetFlushPromise;
    } finally {
      assetFlushPromise = null;
    }
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
        code: record.skipReason?.code || 'skipped',
        error: reason,
      },
    });
  }
  if (targetPlan.skippedRecords.length > 0) {
    await flushAssetSaves();
    await publishProgress({ force: true });
  }

  const getCaptureOptionsForPhase = (phaseName) => {
    if (phaseName !== 'recovering') {
      if (captureType !== SCREENSHOT_TYPES.thumb) return {};
      return {
        captureTimeoutMs: SCREENSHOT_PRIMARY_THUMB_CAPTURE_TIMEOUT_MS,
        networkSettleTimeoutMs: SCREENSHOT_PRIMARY_NETWORK_SETTLE_TIMEOUT_MS,
      };
    }
    return {
      captureTimeoutMs: captureType === SCREENSHOT_TYPES.thumb
        ? SCREENSHOT_RECOVERY_THUMB_CAPTURE_TIMEOUT_MS
        : SCREENSHOT_RECOVERY_CAPTURE_TIMEOUT_MS,
      networkSettleTimeoutMs: SCREENSHOT_RECOVERY_NETWORK_SETTLE_TIMEOUT_MS,
    };
  };

  const getNonRecoverableCaptureFailure = (error) => {
    const message = error?.message || String(error || '');
    const code = String(error?.code || '').toLowerCase();
    const text = message.toLowerCase();
    if (
      code === 'storage_exhausted'
      || code === 'enospc'
      || text.includes('no space left on device')
      || text.includes('screenshot storage is temporarily full')
    ) {
      return {
        status: 'storage_exhausted',
        code: 'storage_exhausted',
        error: 'Screenshot storage is temporarily full. Please retry after the worker recovers.',
      };
    }
    if (
      text.includes('invalid url')
      || text.includes('invalid url protocol')
      || text.includes('blocked host')
    ) {
      return {
        status: 'skipped',
        code: 'invalid_url',
        error: message || 'URL unavailable',
      };
    }
    return null;
  };

  const waitIfPaused = async () => {
    let status = await readStatus();
    if (status !== JOB_STATUS.paused) {
      return status === JOB_STATUS.canceled || status === JOB_STATUS.stopping;
    }
    summary.paused = true;
    await publishProgress({ force: true });
    while (status === JOB_STATUS.paused) {
      await sleep(1000);
      status = await readStatus();
    }
    summary.paused = false;
    await publishProgress({ force: true });
    return status === JOB_STATUS.canceled || status === JOB_STATUS.stopping;
  };

  const captureRecordOnce = async (record, phaseName) => {
    try {
      const safeUrl = await assertSafeUrl(record.node.url, { allowUnresolved: true });
      const result = await captureScreenshot(safeUrl, captureType, getCaptureOptionsForPhase(phaseName));
      const validation = await validateImageCaptureResult(captureType, result);
      if (!validation.ok) {
        return {
          status: validation.status || 'failed',
          error: validation.error || 'Image capture failed',
          retryable: validation.status !== 'low_resolution',
        };
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
      return { status: 'saved', retryable: false };
    } catch (error) {
      const message = error?.message || 'Image capture failed';
      const nonRecoverable = getNonRecoverableCaptureFailure(error);
      if (nonRecoverable) {
        return {
          ...nonRecoverable,
          retryable: false,
        };
      }
      return {
        status: 'failed',
        error: message,
        retryable: true,
      };
    }
  };

  const finalizeCaptureFailure = async (record, status, message, code = '') => {
    const normalizedStatus = status || 'failed';
    const errorMessage = message || 'Image capture failed';
    const assetUpdates = normalizedStatus === 'skipped'
      ? getImageCaptureSkipUpdates(captureType, errorMessage)
      : getImageCaptureFailureUpdates(
        captureType,
        errorMessage,
        { authRequired: normalizedStatus === 'blocked' }
      );
    if (Object.keys(assetUpdates).length > 0) {
      await queueAssetSave({
        nodeId: record.nodeId,
        assets: assetUpdates,
        result: {
          nodeId: record.nodeId,
          status: normalizedStatus,
          code: code || normalizedStatus,
          error: errorMessage,
        },
      });
      return;
    }
    recordCompletedResult({
      nodeId: record.nodeId,
      status: normalizedStatus,
      code: code || normalizedStatus,
      error: errorMessage,
    });
  };

  let storageCaptureCircuitOpen = false;
  let storageFailure = null;
  const runRecordAttempts = async (record, {
    phaseName,
    maxAttempts,
    finalizeFailures,
  }) => {
    let lastOutcome = {
      status: 'failed',
      error: 'Image capture failed',
      retryable: true,
    };

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (await waitIfPaused()) {
        summary.stopped = true;
        break;
      }
      lastOutcome = await captureRecordOnce(record, phaseName);
      if (lastOutcome.status === 'saved') return { status: 'saved' };
      if (lastOutcome.status === 'storage_exhausted') {
        storageCaptureCircuitOpen = true;
        storageFailure = {
          status: 'storage_exhausted',
          code: 'storage_exhausted',
          error: lastOutcome.error,
        };
      }
      if (!lastOutcome.retryable) break;
      if (attempt < maxAttempts - 1) {
        await sleep(Math.min(IMAGE_CAPTURE_RETRY_BASE_DELAY_MS * (attempt + 1), 15000));
      }
    }

    if (summary.stopped) return { status: 'stopped' };
    if (lastOutcome.retryable && !finalizeFailures) {
      return {
        status: 'deferred',
        error: lastOutcome.error,
      };
    }

    await finalizeCaptureFailure(
      record,
      lastOutcome.status,
      lastOutcome.error,
      lastOutcome.code
    );
    return {
      status: lastOutcome.status,
      code: lastOutcome.code,
      error: lastOutcome.error,
    };
  };

  const processCapturePhases = async ({
    phases,
    phaseName,
    maxAttempts,
    finalizeFailures,
    recoveryPass = 0,
  }) => {
    const deferred = [];
    const retrying = phases.reduce((count, phase) => count + (phase.records?.length || 0), 0);
    const concurrency = phaseName === 'recovering'
      ? IMAGE_CAPTURE_RECOVERY_CONCURRENCY
      : IMAGE_CAPTURE_PRIMARY_CONCURRENCY;
    summary.phase = phaseName;
    summary.recoveryPass = recoveryPass;
    summary.retrying = phaseName === 'recovering' ? retrying : 0;
    summary.batchIndex = 0;
    summary.batchTotal = 0;
    await publishProgress({ force: true });

    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      if (await waitIfPaused()) {
        summary.stopped = true;
        break;
      }
      const capturePhase = phases[phaseIndex];
      await publishProgress({ force: true });

      let nextRecordIndex = 0;
      const records = capturePhase.records || [];
      const workerCount = Math.min(concurrency, records.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (!summary.stopped && !storageCaptureCircuitOpen) {
          const recordIndex = nextRecordIndex;
          nextRecordIndex += 1;
          if (recordIndex >= records.length) return;

          if (await waitIfPaused()) {
            summary.stopped = true;
            return;
          }
          const record = records[recordIndex];
          summary.currentNodeId = record.nodeId;
          await publishProgress();

          const outcome = await runRecordAttempts(record, {
            phaseName,
            maxAttempts,
            finalizeFailures,
          });
          if (outcome.status === 'deferred') {
            deferred.push({
              ...record,
              lastError: outcome.error,
            });
          }
          await publishProgress();
        }
      });
      await Promise.all(workers);
      await flushAssetSaves();
      await publishProgress({ force: true });
      if (summary.stopped || storageCaptureCircuitOpen) break;
    }

    return deferred;
  };

  for (const stage of stages) {
    if (summary.stopped || storageCaptureCircuitOpen) break;
    summary.stageIndex = stage.stageIndex;
    summary.stageTotal = stage.stageTotal;
    summary.stageSize = stage.stageSize;
    summary.scaleTier = stage.scaleTier;
    let recoveryRecords = await processCapturePhases({
      phases: stage.phases,
      phaseName: 'capturing',
      maxAttempts: IMAGE_CAPTURE_PRIMARY_MAX_ATTEMPTS,
      finalizeFailures: IMAGE_CAPTURE_RECOVERY_MAX_PASSES <= 0,
    });

    for (
      let recoveryPass = 1;
      !summary.stopped
        && !storageCaptureCircuitOpen
        && recoveryRecords.length > 0
        && recoveryPass <= IMAGE_CAPTURE_RECOVERY_MAX_PASSES;
      recoveryPass += 1
    ) {
      recoveryRecords = await processCapturePhases({
        phases: buildImageCapturePhases(recoveryRecords),
        phaseName: 'recovering',
        maxAttempts: IMAGE_CAPTURE_RECOVERY_MAX_ATTEMPTS,
        finalizeFailures: recoveryPass >= IMAGE_CAPTURE_RECOVERY_MAX_PASSES,
        recoveryPass,
      });
    }
  }

  if (storageCaptureCircuitOpen) {
    const unresolvedCount = Math.max(0, summary.total - summary.completed);
    summary.storageUnavailable = unresolvedCount;
    summary.storageFailure = storageFailure;
    summary.unavailable += unresolvedCount;
    summary.completed += unresolvedCount;
  }
  summary.currentNodeId = null;
  const reviewCount = summary.failed + summary.blocked + summary.missingAsset + summary.skipped + summary.unavailable;
  summary.phase = summary.stopped ? summary.phase : (reviewCount > 0 ? 'needs_review' : 'complete');
  summary.recoveryPass = 0;
  summary.retrying = 0;
  summary.elapsedMs = Date.now() - startedAt;
  await flushAssetSaves();
  await publishProgress({ force: true });
  await recordImageCaptureCompletionActivity({ jobId, mapRow, summary });
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

const SCAN_AUTH_SESSION_TTL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.SCAN_AUTH_SESSION_TTL_MS || 30 * 60 * 1000)
);
const SCAN_AUTH_PRECHECK_MAX_PAGES = Math.max(
  1,
  Math.min(25, Number(process.env.SCAN_AUTH_PRECHECK_MAX_PAGES || 8))
);
const SCAN_AUTH_PRECHECK_MAX_DEPTH = Math.max(
  1,
  Math.min(4, Number(process.env.SCAN_AUTH_PRECHECK_MAX_DEPTH || 2))
);
// Temporarily paused while primary scan stability work continues. See docs/authenticated-scan-paused.md.
const SCAN_AUTH_FEATURE_ENABLED = parseEnvBool(process.env.SCAN_AUTH_FEATURE_ENABLED, false);
const SCAN_AUTH_INTERACTIVE_SUPPORTED = SCAN_AUTH_FEATURE_ENABLED;
const SCAN_AUTH_VIEWPORT = { width: 1365, height: 900 };
const scanAuthSessions = new Map();

function getScanAuthOwnerKey(req) {
  return req.user?.id
    ? `user:${req.user.id}`
    : `anon:${req.ip || req.headers?.['x-forwarded-for'] || 'unknown'}`;
}

function normalizePlaywrightStorageState(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    cookies: Array.isArray(value.cookies) ? value.cookies : [],
    origins: Array.isArray(value.origins) ? value.origins : [],
  };
}

function createScanAuthSession({ safeUrl, req, storageState = null }) {
  const scope = createScanScope(safeUrl, false);
  const now = Date.now();
  const id = crypto.randomBytes(18).toString('hex');
  const normalizedStorageState = normalizePlaywrightStorageState(storageState);
  const session = {
    id,
    ownerKey: getScanAuthOwnerKey(req),
    seedUrl: safeUrl,
    baseHost: scope.baseHost,
    origin: scope.origin,
    createdAt: now,
    expiresAt: now + SCAN_AUTH_SESSION_TTL_MS,
    storageState: normalizedStorageState,
    status: normalizedStorageState ? 'ready' : 'pending',
    pageUrl: safeUrl,
  };
  scanAuthSessions.set(id, session);
  return session;
}

function closeScanAuthSession(session) {
  if (!session) return;
  const context = session.browserContext;
  session.page = null;
  session.browserContext = null;
  if (context) {
    context.close().catch((error) => {
      console.warn('Scan auth browser cleanup failed:', error.message);
    });
  }
}

function cleanupExpiredScanAuthSessions() {
  const now = Date.now();
  scanAuthSessions.forEach((session, id) => {
    if (!session || session.expiresAt <= now) {
      closeScanAuthSession(session);
      scanAuthSessions.delete(id);
    }
  });
}

function isHostnameInAuthScope(hostname, session) {
  const normalizedHost = normalizeHost(hostname);
  const baseHost = normalizeHost(session?.baseHost || '');
  return Boolean(normalizedHost && baseHost && (
    normalizedHost === baseHost || normalizedHost.endsWith(`.${baseHost}`)
  ));
}

function getScanAuthSessionForRequest(req, sessionId, safeUrl = null) {
  cleanupExpiredScanAuthSessions();
  const id = String(sessionId || '').trim();
  if (!id) return null;
  const session = scanAuthSessions.get(id);
  if (!session) return null;
  if (session.ownerKey !== getScanAuthOwnerKey(req)) return null;
  if (safeUrl && !isHostnameInAuthScope(new URL(safeUrl).hostname, session)) return null;
  return session;
}

function getReadyScanAuthStorageState(req, sessionId, safeUrl) {
  const session = getScanAuthSessionForRequest(req, sessionId, safeUrl);
  if (!session || session.status !== 'ready' || !session.storageState) return null;
  return session.storageState;
}

function getReadyScanAuthStorageStateForJob({ sessionId, ownerKey, safeUrl }) {
  cleanupExpiredScanAuthSessions();
  const session = scanAuthSessions.get(String(sessionId || '').trim());
  if (!session || session.status !== 'ready' || !session.storageState) return null;
  if (ownerKey && session.ownerKey !== ownerKey) return null;
  if (safeUrl && !isHostnameInAuthScope(new URL(safeUrl).hostname, session)) return null;
  return session.storageState;
}

async function createAuthenticatedBrowserContext(storageState, viewport = { width: 1365, height: 900 }) {
  const browserInstance = await getBrowser();
  return browserInstance.newContext({
    ...(storageState ? { storageState } : {}),
    viewport,
    userAgent: SCREENSHOT_USER_AGENTS[0],
    extraHTTPHeaders: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });
}

async function startInteractiveScanAuthSession(session) {
  if (!session || session.status === 'ready') return session;
  const context = await createAuthenticatedBrowserContext(session.storageState, SCAN_AUTH_VIEWPORT);
  context.on('page', (newPage) => {
    session.page = newPage;
    newPage.bringToFront().catch(() => {});
    session.pageUrl = newPage.url() || session.pageUrl;
  });
  const page = await context.newPage();
  session.browserContext = context;
  session.page = page;
  session.status = 'interactive';
  try {
    await page.goto(session.seedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (error) {
    session.lastError = error.message || 'Target-site login page did not finish loading';
  }
  session.pageUrl = page.url();
  return session;
}

async function getInteractiveScanAuthPage(req, sessionId) {
  const session = getScanAuthSessionForRequest(req, sessionId);
  if (!session || session.status !== 'interactive') return null;
  if (!session.browserContext || !session.page || session.page.isClosed()) {
    try {
      if (!session.browserContext) {
        session.browserContext = await createAuthenticatedBrowserContext(session.storageState, SCAN_AUTH_VIEWPORT);
      }
      const page = await session.browserContext.newPage();
      session.page = page;
      await page.goto(session.pageUrl || session.seedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      session.pageUrl = page.url();
    } catch (error) {
      session.lastError = error.message || 'Target-site login browser closed';
      return null;
    }
  }
  return { session, page: session.page };
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

function isLocalOrIpHost(hostname) {
  const host = normalizeHost(String(hostname || '')).replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
    || host.includes(':');
}

function getRootDomain(hostname) {
  const host = normalizeHost(String(hostname || ''));
  if (!host || isLocalOrIpHost(host)) return host;
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const secondLevel = parts[parts.length - 2] || '';
  if (secondLevel.length <= 3 && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function createScanScope(startUrl, allowSubdomains = false) {
  const normalized = normalizeUrl(startUrl);
  if (!normalized) throw new Error('Invalid URL');
  const parsed = new URL(normalized);
  const baseHost = normalizeHost(parsed.hostname);
  const rootDomain = getRootDomain(baseHost);
  const focus = createFocusedScanDescriptor(normalized);
  return {
    seed: normalized,
    origin: parsed.origin,
    baseHost,
    rootDomain,
    allowSubdomains: focus.focused ? false : Boolean(allowSubdomains),
    exactOnly: isLocalOrIpHost(baseHost) || !rootDomain,
    focused: focus.focused,
    focusPath: focus.focusPath,
    focusDepth: focus.focusDepth,
    siteRootUrl: focus.siteRootUrl,
  };
}

function normalizeScanScope(scopeOrBaseHost) {
  if (scopeOrBaseHost && typeof scopeOrBaseHost === 'object') return scopeOrBaseHost;
  const baseHost = normalizeHost(String(scopeOrBaseHost || ''));
  return {
    baseHost,
    rootDomain: getRootDomain(baseHost),
    allowSubdomains: true,
    exactOnly: isLocalOrIpHost(baseHost),
  };
}

function getPlacementForUrl(urlStr, scopeOrBaseHost) {
  try {
    const host = normalizeHost(new URL(urlStr).hostname);
    const scope = normalizeScanScope(scopeOrBaseHost);
    if (host === scope.baseHost) return 'Primary';
    if (
      scope.allowSubdomains
      && !scope.exactOnly
      && getRootDomain(host) === scope.rootDomain
    ) {
      return 'Subdomain';
    }
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

const SCAN_FILE_EXTENSIONS = new Map([
  ['pdf', { fileType: 'PDF', contentType: 'application/pdf' }],
  ['doc', { fileType: 'Document', contentType: 'application/msword' }],
  ['docx', { fileType: 'Document', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
  ['xls', { fileType: 'Spreadsheet', contentType: 'application/vnd.ms-excel' }],
  ['xlsx', { fileType: 'Spreadsheet', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
  ['ppt', { fileType: 'Presentation', contentType: 'application/vnd.ms-powerpoint' }],
  ['pptx', { fileType: 'Presentation', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }],
  ['csv', { fileType: 'Data', contentType: 'text/csv' }],
  ['txt', { fileType: 'Text', contentType: 'text/plain' }],
  ['zip', { fileType: 'Archive', contentType: 'application/zip' }],
  ['rar', { fileType: 'Archive', contentType: 'application/vnd.rar' }],
  ['7z', { fileType: 'Archive', contentType: 'application/x-7z-compressed' }],
  ['mp4', { fileType: 'Video', contentType: 'video/mp4' }],
  ['mov', { fileType: 'Video', contentType: 'video/quicktime' }],
  ['webm', { fileType: 'Video', contentType: 'video/webm' }],
  ['mp3', { fileType: 'Audio', contentType: 'audio/mpeg' }],
  ['wav', { fileType: 'Audio', contentType: 'audio/wav' }],
  ['png', { fileType: 'Image', contentType: 'image/png' }],
  ['jpg', { fileType: 'Image', contentType: 'image/jpeg' }],
  ['jpeg', { fileType: 'Image', contentType: 'image/jpeg' }],
  ['gif', { fileType: 'Image', contentType: 'image/gif' }],
  ['svg', { fileType: 'Image', contentType: 'image/svg+xml' }],
  ['webp', { fileType: 'Image', contentType: 'image/webp' }],
]);

const SCAN_FILE_CONTENT_TYPES = new Map([
  ['application/pdf', 'PDF'],
  ['application/msword', 'Document'],
  ['application/vnd.ms-excel', 'Spreadsheet'],
  ['application/vnd.ms-powerpoint', 'Presentation'],
  ['application/zip', 'Archive'],
  ['application/x-zip-compressed', 'Archive'],
  ['text/csv', 'Data'],
]);

const SCAN_FILE_CONTENT_TYPE_PREFIXES = [
  ['application/vnd.openxmlformats-officedocument.', 'Office file'],
  ['video/', 'Video'],
  ['audio/', 'Audio'],
  ['image/', 'Image'],
];

function normalizeContentType(contentType) {
  return String(contentType || '').split(';')[0].trim().toLowerCase();
}

function getUrlExtension(urlStr) {
  try {
    const pathname = new URL(urlStr).pathname || '';
    const match = pathname.match(/\.([a-z0-9]{2,8})$/i);
    return match?.[1]?.toLowerCase() || '';
  } catch {
    return '';
  }
}

function getScanFileInfo(urlStr, contentType = '') {
  const normalizedContentType = normalizeContentType(contentType);
  const extension = getUrlExtension(urlStr);
  if (
    isRenderableTextFileExtension(extension)
    || isRenderableTextContentType(normalizedContentType)
  ) {
    return {
      isFile: false,
      extension,
      fileType: null,
      contentType: normalizedContentType || SCAN_FILE_EXTENSIONS.get(extension)?.contentType || null,
    };
  }

  const extensionInfo = SCAN_FILE_EXTENSIONS.get(extension);
  if (extensionInfo) {
    return {
      isFile: true,
      extension,
      fileType: extensionInfo.fileType,
      contentType: normalizedContentType || extensionInfo.contentType || null,
    };
  }

  const exactContentType = SCAN_FILE_CONTENT_TYPES.get(normalizedContentType);
  if (exactContentType) {
    return {
      isFile: true,
      extension,
      fileType: exactContentType,
      contentType: normalizedContentType,
    };
  }

  const prefixMatch = SCAN_FILE_CONTENT_TYPE_PREFIXES.find(([prefix]) => normalizedContentType.startsWith(prefix));
  if (prefixMatch) {
    return {
      isFile: true,
      extension,
      fileType: prefixMatch[1],
      contentType: normalizedContentType,
    };
  }

  return {
    isFile: false,
    extension,
    fileType: null,
    contentType: normalizedContentType || null,
  };
}

function isIgnoredCrawlUtilityUrl(urlStr) {
  try {
    const pathname = new URL(urlStr).pathname.replace(/\/+$/, '') || '/';
    return CLOUDFLARE_UTILITY_PATHS.has(pathname);
  } catch {
    return false;
  }
}

function sameDomain(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
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

const DISTINCT_COLLECTION_QUERY_KEYS = new Set([
  'after',
  'before',
  'cursor',
  'date',
  'month',
  'offset',
  'p',
  'page',
  'start',
  'year',
]);

const TRANSIENT_PAGINATION_QUERY_KEYS = new Set([
  'after',
  'before',
  'cursor',
  'offset',
  'p',
  'page',
  'start',
]);

const STABLE_COLLECTION_QUERY_KEYS = new Set(
  Array.from(DISTINCT_COLLECTION_QUERY_KEYS)
    .filter((key) => !TRANSIENT_PAGINATION_QUERY_KEYS.has(key))
);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function hasStableCollectionQuery(urlStr) {
  try {
    return Array.from(new URL(urlStr).searchParams.keys()).some((key) => (
      STABLE_COLLECTION_QUERY_KEYS.has(String(key).toLowerCase())
    ));
  } catch {
    return false;
  }
}

function getPageIdentityUrl(meta = {}) {
  const requestUrl = normalizeUrl(meta.url);
  if (meta.preserveRouteIdentity && requestUrl) return requestUrl;
  const sourceUrl = normalizeUrl(meta.finalUrl || meta.url);
  const canonicalUrl = normalizeUrl(meta.canonicalUrl);
  if (!sourceUrl) return canonicalUrl;
  if (!canonicalUrl) return sourceUrl;
  try {
    const source = new URL(sourceUrl);
    const canonical = new URL(canonicalUrl);
    const sourceCollectionKeys = Array.from(source.searchParams.keys())
      .map((key) => key.toLowerCase())
      .filter((key) => DISTINCT_COLLECTION_QUERY_KEYS.has(key));
    const canonicalKeys = new Set(
      Array.from(canonical.searchParams.keys()).map((key) => key.toLowerCase())
    );
    if (
      sourceCollectionKeys.length > 0
      && sourceCollectionKeys.some((key) => !canonicalKeys.has(key))
    ) {
      return sourceUrl;
    }
  } catch {
    return canonicalUrl || sourceUrl;
  }
  return canonicalUrl;
}

function getFocusedCollectionTitle(meta = {}) {
  const currentTitle = String(meta.title || meta.url || '').trim();
  if (!meta.preserveRouteIdentity || !meta.url) return currentTitle;
  try {
    const requestUrl = new URL(meta.url);
    const dateValue = requestUrl.searchParams.get('date');
    const monthValue = requestUrl.searchParams.get('month');
    const yearValue = requestUrl.searchParams.get('year');
    let label = '';
    if (dateValue) {
      const match = String(dateValue).match(/^(\d{1,2})[-/]\d{1,2}[-/](\d{4})$/);
      if (match) {
        const monthIndex = Number(match[1]) - 1;
        const year = Number(match[2]);
        if (monthIndex >= 0 && monthIndex < 12) {
          label = `${MONTH_NAMES[monthIndex]} ${year}`;
        }
      }
    }
    if (!label && monthValue && yearValue) {
      const numericMonth = Number(monthValue);
      const monthLabel = numericMonth >= 1 && numericMonth <= 12
        ? MONTH_NAMES[numericMonth - 1]
        : String(monthValue).trim();
      label = `${monthLabel} ${String(yearValue).trim()}`.trim();
    }
    if (!label && yearValue) label = String(yearValue).trim();
    if (!label && meta.canonicalUrl) {
      const canonicalUrl = new URL(meta.canonicalUrl, requestUrl);
      if (canonicalUrl.pathname !== requestUrl.pathname) {
        label = getTitleFromUrl(requestUrl.toString())
          .replace(/\b\w/g, (character) => character.toUpperCase());
      }
    }
    if (!label || currentTitle.toLowerCase().includes(label.toLowerCase())) return currentTitle;
    return `${currentTitle} — ${label}`;
  } catch {
    return currentTitle;
  }
}

function getPageIdentityKey(meta = {}) {
  return getCanonicalKey(getPageIdentityUrl(meta));
}

function getParentUrl(urlStr) {
  const u = new URL(urlStr);
  if (u.search) {
    u.search = '';
    return normalizeUrl(u.toString());
  }
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

const getHttpErrorType = (statusCode) => {
  const status = Number(statusCode);
  if (!Number.isFinite(status) || status < 400) return null;
  return status >= 500 ? '5xx' : '4xx';
};

const getHttpErrorLabel = (statusCode) => {
  const status = Number(statusCode);
  if (!Number.isFinite(status) || status < 400) return null;
  if (status === 404) return 'HTTP 404 / Not Found';
  return `HTTP ${status}`;
};

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
  scanScopeOrBaseHost,
  discoverySourceByUrl = new Map(),
  linksInCounts = new Map()
) {
  const scanScope = normalizeScanScope(scanScopeOrBaseHost);
  if (!nodes || nodes.size === 0) {
    return {
      totalSaved: 0,
      virtualInserted: 0,
      subdomainCount: 0,
      queryBehavior: 'preserved',
      domainParsing: 'root-domain-fallback',
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
      const basePlacement = getPlacementForUrl(parent, scanScope);
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

      const basePlacement = getPlacementForUrl(canonicalUrl, scanScope);
      if (!basePlacement) continue;
      if (node.isFile || getScanFileInfo(canonicalUrl, node.contentType).isFile) continue;
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
      const basePlacement = getPlacementForUrl(url, scanScope);
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
    domainParsing: 'root-domain-fallback',
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

async function fetchPage(url, extraHeaders = {}, timeoutMs = 20000) {
  const startedAt = Date.now();
  const res = await axios.get(url, {
    timeout: timeoutMs,
    maxRedirects: 5,
    maxContentLength: SCAN_HTML_RESPONSE_MAX_BYTES,
    maxBodyLength: SCAN_HTML_RESPONSE_MAX_BYTES,
    headers: {
      'User-Agent': SCAN_REQUEST_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...extraHeaders,
    },
    validateStatus: () => true,
  });
  const responseTime = Date.now() - startedAt;
  const responseUrl = res.request?.res?.responseUrl;
  const finalUrl = normalizeUrl(responseUrl || url);
  return {
    html: res.data,
    status: res.status,
    contentType: res.headers['content-type'],
    headers: res.headers || {},
    finalUrl,
    responseTime,
  };
}

async function fetchPageWithBrowserContext(context, url) {
  const startedAt = Date.now();
  let page = null;
  try {
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(20000);
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    const html = await page.content();
    if (Buffer.byteLength(String(html || ''), 'utf8') > SCAN_HTML_RESPONSE_MAX_BYTES) {
      throw new Error('Scan page response too large');
    }
    const finalUrl = normalizeUrl(response?.url?.() || page.url() || url);
    return {
      html,
      status: response?.status?.() || 0,
      contentType: response?.headers?.()?.['content-type'] || 'text/html',
      headers: response?.headers?.() || {},
      finalUrl,
      responseTime: Date.now() - startedAt,
    };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function fetchPageWithBrowserRequestContext(context, url) {
  const startedAt = Date.now();
  const response = await context.request.get(url, {
    timeout: 10000,
    maxRedirects: 5,
  });
  const html = await response.text();
  if (Buffer.byteLength(String(html || ''), 'utf8') > SCAN_HTML_RESPONSE_MAX_BYTES) {
    throw new Error('Scan page response too large');
  }
  const headers = response.headers();
  return {
    html,
    status: response.status(),
    contentType: headers['content-type'] || 'text/html',
    headers,
    finalUrl: normalizeUrl(response.url() || url),
    responseTime: Date.now() - startedAt,
  };
}

function isHtmlContentType(contentType) {
  const normalizedContentType = normalizeContentType(contentType);
  if (!normalizedContentType) return true;
  return normalizedContentType.includes('text/html')
    || normalizedContentType.includes('application/xhtml+xml')
    || isRenderableTextContentType(normalizedContentType);
}

async function checkLinkStatus(url, extraHeaders = {}) {
  try {
    const headRes = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': SCAN_REQUEST_USER_AGENT,
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
      maxContentLength: SCAN_HTML_RESPONSE_MAX_BYTES,
      maxBodyLength: SCAN_HTML_RESPONSE_MAX_BYTES,
      headers: {
        'User-Agent': SCAN_REQUEST_USER_AGENT,
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

async function checkLinkStatusWithBrowserContext(context, url) {
  try {
    const response = await context.request.get(url, {
      timeout: 10000,
      maxRedirects: 5,
    });
    return { status: response.status() };
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
        maxContentLength: SCAN_SITEMAP_RESPONSE_MAX_BYTES,
        maxBodyLength: SCAN_SITEMAP_RESPONSE_MAX_BYTES,
        headers: { 'User-Agent': SCAN_REQUEST_USER_AGENT },
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

  const scanScope = createScanScope(baseUrl, true);
  const baseHost = scanScope.baseHost;
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
    iaSummary = await persistPagesForIa(nodes, scanScope, discoverySourceByUrl, linksInCounts);
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

function extractFocusedContentLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  const containerSelector = [
    'article',
    'main li',
    'main [role="listitem"]',
    '[class*="card"]',
    '[class*="Card"]',
    '[class*="tile"]',
    '[class*="Tile"]',
    '[class*="teaser"]',
    '[class*="Teaser"]',
    '[class*="story"]',
    '[class*="Story"]',
    '[class*="content-grid"] [class*="list-item"]',
    '[class*="contentGrid"] [class*="listItem"]',
  ].join(', ');
  const normalizeLink = (el) => {
    const $link = $(el);
    if ($link.closest('header, nav, footer, aside, [role="navigation"]').length > 0) return null;
    const href = ($link.attr('href') || '').trim();
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) return null;
    try {
      return normalizeUrl(new URL(href, baseUrl).toString());
    } catch {
      return null;
    }
  };
  const getHeadingLinkScore = (link) => {
    const $link = $(link);
    const $heading = $link.closest('h1, h2, h3, h4');
    const tag = String($heading.get(0)?.tagName || '').toLowerCase();
    const className = [
      $heading.attr('class'),
      $link.attr('class'),
      $heading.parent().attr('class'),
    ].filter(Boolean).join(' ');
    let score = ({ h1: 40, h2: 30, h3: 20, h4: 10 })[tag] || 0;
    if (/(?:title|headline|heading)/i.test(className)) score += 100;
    if (/(?:slug|kicker|eyebrow|category|section|label)/i.test(className)) score -= 100;
    const normalized = normalizeLink(link);
    if (!normalized) return { normalized: null, score: Number.NEGATIVE_INFINITY };
    const pathname = new URL(normalized).pathname;
    if (/\/(?:19|20)\d{2}(?:\/|$)/.test(pathname)) score += 50;
    if (/^\/(?:sections?|topics?|tags?|categor(?:y|ies)|newsletters?|podcasts?)(?:\/[^/]+)?\/?$/i.test(pathname)) {
      score -= 80;
    }
    return { normalized, score };
  };

  $(containerSelector).each((_, container) => {
    const $container = $(container);
    const headingLinks = $container.find([
      'h1 a[href]',
      'h2 a[href]',
      'h3 a[href]',
      'h4 a[href]',
      'a[class*="title"][href]',
      'a[class*="Title"][href]',
    ].join(', '))
      .get()
      .map((link, index) => ({ link, index, ...getHeadingLinkScore(link) }))
      .filter((candidate) => candidate.normalized)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    if (headingLinks.length > 0) {
      links.add(headingLinks[0].normalized);
      return;
    }
    const className = String($container.attr('class') || '');
    const isGenericListItem = (
      $container.is('main li, main [role="listitem"]')
      && !/(?:card|tile|teaser|story)/i.test(className)
    );
    if (isGenericListItem) {
      const paragraphLink = $container.find('p a[href]').first();
      const normalized = paragraphLink.length > 0 ? normalizeLink(paragraphLink.get(0)) : null;
      if (normalized) links.add(normalized);
      return;
    }
    const directLink = $container.children('a[href]').first();
    if (directLink.length > 0) {
      const normalized = normalizeLink(directLink.get(0));
      if (normalized) links.add(normalized);
      return;
    }
    const fallbackLink = $container.find('a[href]').first();
    const normalized = fallbackLink.length > 0 ? normalizeLink(fallbackLink.get(0)) : null;
    if (normalized) links.add(normalized);
  });

  return Array.from(links);
}

async function extractRenderedLinks(url, context = null, options = {}) {
  let page = null;
  let ownedContext = null;
  try {
    if (!context) {
      ownedContext = await createAuthenticatedBrowserContext(null);
    }
    const activeContext = context || ownedContext;
    page = await activeContext.newPage();
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(12000);
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 12000,
    });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await page.evaluate(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      let unchangedAtBottom = 0;
      let previousHeight = 0;
      for (let step = 0; step < 24; step += 1) {
        const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
        const nextTop = Math.min(height, (step + 1) * Math.max(window.innerHeight * 0.8, 500));
        window.scrollTo(0, nextTop);
        await wait(100);
        const nextHeight = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
        const atBottom = window.scrollY + window.innerHeight >= nextHeight - 8;
        unchangedAtBottom = atBottom && nextHeight === previousHeight ? unchangedAtBottom + 1 : 0;
        previousHeight = nextHeight;
        if (unchangedAtBottom >= 2) break;
      }
      window.scrollTo(0, 0);
    }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    const renderedLinks = new Set();
    const contentLinks = new Set();
    const maxContentLinks = Math.max(
      1,
      Math.min(5000, Number(options.maxContentLinks || 5000) || 5000)
    );
    const maxPaginationPages = Math.max(
      1,
      Math.min(300, Number(options.maxPaginationPages || 300) || 300)
    );
    let paginationPagesVisited = 0;
    const getContentSignature = () => page.evaluate(() => {
      const scope = document.querySelector('main') || document.body;
      return Array.from(scope?.querySelectorAll('a[href]') || [])
        .filter((anchor) => !anchor.closest('header, nav, footer, aside, [role="navigation"]'))
        .map((anchor) => `${anchor.href}|${String(anchor.textContent || '').trim()}`)
        .join('\n');
    });
    const collectRenderedPage = async () => {
      const pageLinks = await page.evaluate(() => (
        Array.from(document.querySelectorAll('a[href]'))
          .map((anchor) => anchor.href)
          .filter(Boolean)
      ));
      pageLinks.forEach((link) => renderedLinks.add(link));
      const renderedHtml = await page.content();
      extractFocusedContentLinks(
        renderedHtml,
        page.url() || response?.url?.() || url
      ).forEach((link) => contentLinks.add(link));
      paginationPagesVisited += 1;
      return getContentSignature();
    };
    let contentSignature = await collectRenderedPage();
    while (
      paginationPagesVisited < maxPaginationPages
      && contentLinks.size < maxContentLinks
    ) {
      if (typeof options.shouldStop === 'function' && await options.shouldStop()) break;
      const clickedNext = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('a[href], button'));
        const nextControl = candidates.find((candidate) => {
          if (
            candidate.disabled
            || candidate.getAttribute('aria-disabled') === 'true'
            || candidate.hasAttribute('disabled')
          ) {
            return false;
          }
          const rel = String(candidate.getAttribute('rel') || '').toLowerCase();
          if (rel.split(/\s+/).includes('next')) return true;
          const label = String(
            candidate.getAttribute('aria-label')
            || candidate.getAttribute('title')
            || candidate.textContent
            || ''
          ).trim();
          if (!/^next(?:\s+(?:page|results?))?$/i.test(label)) return false;
          const navigation = candidate.closest('nav, [role="navigation"]');
          if (!navigation) return false;
          const numberedControls = Array.from(navigation.querySelectorAll('a, button')).filter((control) => {
            const controlLabel = String(
              control.getAttribute('aria-label') || control.textContent || ''
            ).trim();
            return /^page\s+\d+/i.test(controlLabel) || /^\d+$/.test(controlLabel);
          });
          return numberedControls.length >= 2;
        });
        if (!nextControl) return false;
        nextControl.click();
        return true;
      });
      if (!clickedNext) break;
      await page.waitForFunction((previousSignature) => {
        const scope = document.querySelector('main') || document.body;
        const nextSignature = Array.from(scope?.querySelectorAll('a[href]') || [])
          .filter((anchor) => !anchor.closest('header, nav, footer, aside, [role="navigation"]'))
          .map((anchor) => `${anchor.href}|${String(anchor.textContent || '').trim()}`)
          .join('\n');
        return nextSignature !== previousSignature;
      }, contentSignature, { timeout: 3000 }).catch(() => {});
      const nextSignature = await getContentSignature();
      if (!nextSignature || nextSignature === contentSignature) break;
      contentSignature = await collectRenderedPage();
    }
    return {
      links: Array.from(renderedLinks),
      contentLinks: Array.from(contentLinks).slice(0, maxContentLinks),
      paginationPagesVisited,
      status: response?.status?.() || null,
      finalUrl: response?.url?.() || url,
      error: null,
    };
  } catch (error) {
    return {
      links: [],
      contentLinks: [],
      paginationPagesVisited: 0,
      status: null,
      finalUrl: url,
      error: error?.message || 'rendered discovery failed',
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    if (ownedContext) {
      await ownedContext.close().catch(() => {});
    }
  }
}

function countScanTreeNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countScanTreeNodes(child), 0);
}

function extractRepetitivePageSignal(html, seoMetadata = {}) {
  const openGraphType = String(seoMetadata?.openGraph?.type || '').trim().toLowerCase();
  if (openGraphType) return `og:${openGraphType}`;
  const source = String(html || '');
  const schemaTypes = ['JobPosting', 'NewsArticle', 'BlogPosting', 'Article', 'Product', 'Event'];
  const schemaType = schemaTypes.find((type) => new RegExp(`"@type"\\s*:\\s*"${type}"`, 'i').test(source));
  if (schemaType) return `schema:${schemaType.toLowerCase()}`;
  try {
    const $ = cheerio.load(source);
    if ($('article').length > 0) return 'element:article';
    if ($('[data-job-id], [class*="job-detail"], [class*="job-posting"]').length > 0) return 'element:job';
    if ($('[itemtype*="Product"], [class*="product-detail"]').length > 0) return 'element:product';
  } catch {
    return 'page';
  }
  return 'page';
}

function normalizeRepetitiveCaptureRequest(options = {}, scanScope = null, pageAllowance = null) {
  const request = options?.repetitiveCapture;
  if (!request || typeof request !== 'object') return null;
  const groupId = String(request.groupId || '').trim().slice(0, 120);
  const captureLimit = pageAllowance === null
    ? REPETITIVE_GROUP_CAPTURE_LIMIT
    : Math.min(REPETITIVE_GROUP_CAPTURE_LIMIT, pageAllowance);
  const seen = new Set();
  const entries = [];
  (Array.isArray(request.entries) ? request.entries : []).forEach((entry, index) => {
    if (entries.length >= captureLimit) return;
    const url = normalizeUrl(typeof entry === 'string' ? entry : entry?.url);
    if (!url || seen.has(url)) return;
    if (scanScope?.focused && !sameOrigin(url, scanScope.origin)) return;
    if (scanScope && !scanScope.focused && !getPlacementForUrl(url, scanScope)) return;
    seen.add(url);
    entries.push({
      url,
      scanNumber: typeof entry === 'object' ? String(entry?.scanNumber || '').slice(0, 80) : '',
      order: Math.max(0, Math.floor(Number(typeof entry === 'object' ? entry?.order : index) || index)),
    });
  });
  if (!groupId || entries.length === 0) return null;
  return { groupId, entries };
}

function isSuccessfulCapturedPageMeta(meta) {
  const status = Number(meta?.httpStatus || 0);
  return Boolean(meta && status >= 200 && status < 400 && meta.metadataAvailable !== false);
}

function normalizeScanOptions(options = {}) {
  return {
    thumbnails: Boolean(options.thumbnails),
    inactivePages: options.inactivePages !== false,
    subdomains: Boolean(options.subdomains),
    authenticatedPages: Boolean(options.authenticatedPages),
    orphanPages: Boolean(options.orphanPages),
    errorPages: options.errorPages !== false,
    brokenLinks: Boolean(options.brokenLinks),
    duplicates: options.duplicates !== false,
    files: Boolean(options.files),
    crosslinks: Boolean(options.crosslinks),
  };
}

async function crawlSite(startUrl, maxPages, maxDepth, options = {}, onProgress = null, readJobStatus = null) {
  const scanOptions = normalizeScanOptions(options);
  const entitlementCappedScan = Boolean(options.entitlementCappedScan || options._entitlementCappedScan);
  const scanScope = createScanScope(startUrl, scanOptions.subdomains);
  const seed = scanScope.seed;
  const requestedPageLimit = normalizeMaxPagesLimit(maxPages);
  const repetitiveCapture = normalizeRepetitiveCaptureRequest(options, scanScope, requestedPageLimit);
  const captureUrlSet = new Set((repetitiveCapture?.entries || []).map((entry) => entry.url));
  const captureEntryByUrl = new Map((repetitiveCapture?.entries || []).map((entry) => [entry.url, entry]));
  const targetedGroupCapture = captureUrlSet.size > 0;
  const pageLimit = requestedPageLimit === null
    ? null
    : requestedPageLimit + (targetedGroupCapture ? 1 : 0);
  const depthLimit = normalizeScanDepthLimit(maxDepth);
  const authStorageState = normalizePlaywrightStorageState(options.authSessionStorageState);
  const authContext = authStorageState
    ? await createAuthenticatedBrowserContext(authStorageState)
    : null;

  const origin = scanScope.origin;
  const baseHost = scanScope.baseHost;
  const allowSubdomains = scanScope.allowSubdomains;
  const focusedContentUrls = new Set();
  const focusedListingUrls = new Set();
  const focusedCollectionUrls = new Set();
  const focusedDiscoveryHelperUrls = new Set();
  const focusedDiscoveryOwnerByUrl = new Map();
  const focusedPathAliases = new Set();
  if (targetedGroupCapture && scanScope.focused) {
    captureUrlSet.forEach((url) => {
      if (!sameOrigin(url, origin)) return;
      focusedContentUrls.add(url);
      if (hasStableCollectionQuery(url)) focusedCollectionUrls.add(url);
    });
  }
  const focusedAncestorUrlSet = new Set(
    scanScope.focused ? getFocusedAncestorUrls(seed).map((url) => normalizeUrl(url)).filter(Boolean) : []
  );
  const isWithinFocusedPathAlias = (candidate) => {
    if (!scanScope.focused) return true;
    const normalized = normalizeUrl(candidate);
    if (!normalized || !sameOrigin(normalized, origin)) return false;
    if (isUrlWithinFocusedPath(normalized, scanScope)) return true;
    const parsed = new URL(normalized);
    return Array.from(focusedPathAliases).some((path) => (
      parsed.pathname === path || parsed.pathname.startsWith(`${path}/`)
    ));
  };
  const getFocusedDiscoveryOwner = (sourceUrl) => {
    const normalizedSource = normalizeUrl(sourceUrl);
    return focusedDiscoveryOwnerByUrl.get(normalizedSource) || normalizedSource || seed;
  };
  const isFocusedDiscoveryHelperUrl = (candidate, sourceUrl) => {
    if (!scanScope.focused) return false;
    const normalized = normalizeUrl(candidate);
    const normalizedSource = normalizeUrl(sourceUrl);
    if (!normalized || !normalizedSource) return false;
    const parsed = new URL(normalized);
    const source = new URL(normalizedSource);
    if (!parsed.search || parsed.origin !== source.origin) return false;
    const hasTransientPagination = Array.from(parsed.searchParams.keys()).some((key) => (
      TRANSIENT_PAGINATION_QUERY_KEYS.has(String(key).toLowerCase())
    ));
    if (!hasTransientPagination) return false;
    return parsed.pathname === source.pathname || isWithinFocusedPathAlias(normalized);
  };
  const getFocusedDiscoveryCollectionUrl = (candidate) => {
    const normalized = normalizeUrl(candidate);
    if (!normalized) return null;
    const parsed = new URL(normalized);
    let removed = false;
    Array.from(parsed.searchParams.keys()).forEach((key) => {
      if (!TRANSIENT_PAGINATION_QUERY_KEYS.has(String(key).toLowerCase())) return;
      parsed.searchParams.delete(key);
      removed = true;
    });
    return removed ? normalizeUrl(parsed.toString()) : null;
  };
  const isFocusedCollectionVariantUrl = (candidate, sourceUrl) => {
    const normalized = normalizeUrl(candidate);
    const normalizedSource = normalizeUrl(sourceUrl);
    if (!normalized || !normalizedSource || !hasStableCollectionQuery(normalized)) return false;
    try {
      const parsed = new URL(normalized);
      const source = new URL(normalizedSource);
      return parsed.origin === source.origin && parsed.pathname === source.pathname;
    } catch {
      return false;
    }
  };
  const scanDiagnostics = {
    seedUrl: seed,
    focused: scanScope.focused,
    focusPath: scanScope.focusPath,
    finalUrl: null,
    rootStatus: null,
    rootContentType: null,
    rootTitleSource: null,
    rootClassification: null,
    rootBlockedReason: null,
    rootExtractedLinks: 0,
    rootAllowedLinks: 0,
    queuedCount: 0,
    visitedCount: 0,
    pageMapCount: 0,
    fetchedPageCount: 0,
    queueRemaining: 0,
    rootChildCount: 0,
    treeNodeCount: 0,
    sitemapUrlsFound: 0,
    sitemapUrlsQueued: 0,
    robotsSitemapUrlsFound: 0,
    robotsSitemapUrlsQueued: 0,
    sitemapSkippedForBlockedFocusedRoot: false,
    sitemapFetchFailures: 0,
    robotsFetchFailed: false,
    discoveryErrors: [],
    commonPathQueued: 0,
    commonPathActive: 0,
    commonPathSkippedForEntitlementCap: false,
    commonPathSkippedForFocusedScope: false,
    commonPathSkippedForTargetedCapture: false,
    renderedDiscoveryTried: false,
    renderedLinksFound: 0,
    renderedLinksQueued: 0,
    renderedPaginationPagesVisited: 0,
    renderedDiscoveryError: null,
    treeRepairApplied: false,
    treeRepairAdded: 0,
    rejectedByScope: 0,
    rejectedAsFile: 0,
    ignoredUtilityUrls: 0,
    cloudflareChallengeCount: 0,
    cloudflareBrowserRetryCount: 0,
    cloudflareBrowserRetrySuccessCount: 0,
    cloudflareBrowserRetryFailedCount: 0,
    browserFetchPreferredCount: 0,
    browserFetchFallbackCount: 0,
    browserFetchFallbackSuccessCount: 0,
    browserFetchFallbackFailedCount: 0,
    failedFetches: 0,
    errorCount: 0,
    authCount: 0,
    inactiveCount: 0,
    collapseReason: null,
    repetitiveGroups: 0,
    repetitiveDeferredPages: 0,
    focusedAncestorInspectedCount: 0,
    focusedContentDiscoveredCount: 0,
    focusedRedirectAliasCount: 0,
    rootRedirectAliasCollapsedCount: 0,
    promotedDeferredAncestorCount: 0,
    focusedParentProbeCount: 0,
    focusedParentProbeSuccessCount: 0,
    focusedNumberingEntryCount: 0,
  };
  const allowUrl = (candidate) => {
    const normalized = normalizeUrl(candidate);
    if (!normalized) return false;
    const placement = getPlacementForUrl(normalized, scanScope);
    if (!placement) return false;
    if (!allowSubdomains) {
      if (!(placement === 'Primary' && sameOrigin(normalized, origin))) return false;
      return isWithinFocusedPathAlias(normalized) || focusedContentUrls.has(normalized);
    }
    return true;
  };
  const isWithinScanDepth = (candidate) => {
    const normalized = normalizeUrl(candidate);
    if (!normalized) return false;
    if (normalized === seed) return true;
    if (depthLimit === null) return true;
    if (scanScope.focused) {
      if (focusedContentUrls.has(normalized)) return true;
      const matchingDepths = [scanScope.focusPath, ...Array.from(focusedPathAliases)]
        .filter((path) => {
          const pathname = new URL(normalized).pathname;
          return pathname === path || pathname.startsWith(`${path}/`);
        })
        .map((path) => path.split('/').filter(Boolean).length);
      const baseDepth = matchingDepths.length ? Math.max(...matchingDepths) : scanScope.focusDepth;
      return getUrlDepth(normalized) - baseDepth <= depthLimit;
    }
    return getUrlDepth(normalized) <= depthLimit;
  };

  const discoverySourceByUrl = new Map();
  const numberingDiscoveryOrder = new Map();
  const focusedListingOrder = new Map();
  const focusedListingParentByUrl = new Map();
  const sitemapOrder = new Map();
  const sitemapNumberingOrder = new Map();
  const sitemapCompleteParentUrls = new Set();
  let sitemapDocumentCounter = 0;
  const scopedDiscoveredUrls = new Set([seed]);
  const deferredOutcomeUrls = new Set();
  const blockedOutcomeUrls = new Set();
  const failedOutcomeUrls = new Set();
  const scanSessionStartedAt = new Date().toISOString();
  const repetitiveGroupsByKey = new Map();
  const repetitiveGroupsById = new Map();
  const deferredUrlToGroup = new Map();
  let numberingCounter = 0;
  const linksInCounts = new Map();
  const linkEdgeSet = new Set();

  const recordNumberingDiscovery = (url, order = null) => {
    if (!scanScope.focused) return;
    const normalized = normalizeUrl(url);
    if (!normalized || !sameOrigin(normalized, origin) || isScanFileUrl(normalized)) return;
    if (numberingDiscoveryOrder.has(normalized)) return;
    numberingDiscoveryOrder.set(
      normalized,
      Number.isFinite(order) ? order : numberingCounter++
    );
  };

  const recordFocusedSitemapNumbering = (url, orderKey) => {
    const normalized = normalizeUrl(url);
    if (!scanScope.focused || !normalized || !sameOrigin(normalized, origin) || isScanFileUrl(normalized)) return;
    if (isFocusedDiscoveryHelperUrl(normalized, seed)) {
      const collectionUrl = getFocusedDiscoveryCollectionUrl(normalized);
      focusedDiscoveryHelperUrls.add(normalized);
      focusedDiscoveryOwnerByUrl.set(normalized, collectionUrl || seed);
      focusedContentUrls.add(normalized);
      if (collectionUrl) {
        focusedCollectionUrls.add(collectionUrl);
        focusedContentUrls.add(collectionUrl);
      }
    }
    const candidateSegments = new URL(normalized).pathname.split('/').filter(Boolean);
    const focusSegments = scanScope.focusPath.split('/').filter(Boolean);
    const prefixes = new Set();
    if (candidateSegments.length > 0) {
      prefixes.add(normalizeUrl(`${origin}/${candidateSegments[0]}`));
    }
    for (let level = 1; level <= focusSegments.length; level += 1) {
      const sharesAncestor = candidateSegments
        .slice(0, level)
        .every((segment, index) => segment === focusSegments[index]);
      if (!sharesAncestor || candidateSegments.length <= level) break;
      prefixes.add(normalizeUrl(`${origin}/${candidateSegments.slice(0, level + 1).join('/')}`));
    }
    if (isWithinFocusedPathAlias(normalized)) prefixes.add(normalized);
    prefixes.forEach((prefix) => {
      if (!prefix) return;
      const existingOrderKey = sitemapNumberingOrder.get(prefix);
      if (!existingOrderKey || orderKey.localeCompare(existingOrderKey) < 0) {
        sitemapNumberingOrder.set(prefix, orderKey);
      }
      recordNumberingDiscovery(prefix);
    });
  };

  const compareFocusedRepetitiveEntries = (left, right) => {
    const getDeclaredOrderKey = (url) => sitemapNumberingOrder.get(url) || '';
    const leftKey = getDeclaredOrderKey(left.url);
    const rightKey = getDeclaredOrderKey(right.url);
    if (leftKey && rightKey && leftKey !== rightKey) return leftKey.localeCompare(rightKey);
    if (leftKey && !rightKey) return -1;
    if (!leftKey && rightKey) return 1;
    return compareNaturalScanUrls(left.url, right.url);
  };

  const rebalanceFocusedRepetitiveGroup = (group) => {
    group.members.sort(compareFocusedRepetitiveEntries);
    group.captureUrls.clear();
    group.deferredEntries = [];
    group.members.forEach((entry, index) => {
      deferredUrlToGroup.delete(entry.url);
      deferredOutcomeUrls.delete(entry.url);
      entry.order = index;
      if (index < REPETITIVE_GROUP_CAPTURE_LIMIT) {
        group.captureUrls.add(entry.url);
      } else {
        group.deferredEntries.push(entry);
        deferredUrlToGroup.set(entry.url, group.groupId);
        deferredOutcomeUrls.add(entry.url);
      }
    });
  };

  const activateRepetitiveGroup = (group) => {
    if (!group || group.active || group.disabled || targetedGroupCapture) return;
    if (group.members.length <= REPETITIVE_GROUP_THRESHOLD) return;
    group.active = true;
    repetitiveGroupsById.set(group.groupId, group);
    if (scanScope.focused) {
      rebalanceFocusedRepetitiveGroup(group);
      return;
    }
    group.members.forEach((entry) => {
      if (group.captureUrls.size < REPETITIVE_GROUP_CAPTURE_LIMIT) {
        group.captureUrls.add(entry.url);
      } else {
        group.deferredEntries.push(entry);
        deferredUrlToGroup.set(entry.url, group.groupId);
        deferredOutcomeUrls.add(entry.url);
      }
    });
  };

  const trackRepetitiveDiscovery = (url, source) => {
    if (targetedGroupCapture || source === 'common_path') return;
    const normalized = normalizeUrl(url);
    if (!normalized || !allowUrl(normalized) || isScanFileUrl(normalized)) return;
    const descriptor = getRepetitiveGroupDescriptor(normalized);
    if (!descriptor) return;
    let group = repetitiveGroupsByKey.get(descriptor.key);
    if (!group) {
      group = {
        ...descriptor,
        active: false,
        disabled: false,
        validated: false,
        members: [],
        memberUrls: new Set(),
        captureUrls: new Set(),
        deferredEntries: [],
      };
      repetitiveGroupsByKey.set(descriptor.key, group);
    }
    if (group.memberUrls.has(normalized)) return;
    const entry = {
      url: normalized,
      source: String(source || 'crawl').slice(0, 80),
      order: numberingDiscoveryOrder.get(normalized) ?? numberingCounter,
    };
    group.memberUrls.add(normalized);
    group.members.push(entry);
    if (group.active) {
      if (scanScope.focused) {
        rebalanceFocusedRepetitiveGroup(group);
        return;
      }
      if (group.captureUrls.size < REPETITIVE_GROUP_CAPTURE_LIMIT) {
        group.captureUrls.add(normalized);
      } else {
        group.deferredEntries.push(entry);
        deferredUrlToGroup.set(normalized, group.groupId);
        deferredOutcomeUrls.add(normalized);
      }
      return;
    }
    activateRepetitiveGroup(group);
  };

  const recordDiscovery = (url, source) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    if (
      allowUrl(normalized)
      && isWithinScanDepth(normalized)
      && !isIgnoredCrawlUtilityUrl(normalized)
      && !isScanFileUrl(normalized)
      && source !== 'common_path'
      && (!targetedGroupCapture || normalized === seed || captureUrlSet.has(normalized))
    ) {
      scopedDiscoveredUrls.add(normalized);
    }
    if (!(scanScope.focused && normalized === seed && numberingDiscoveryOrder.size === 0)) {
      recordNumberingDiscovery(normalized);
    }
    if (!focusedDiscoveryHelperUrls.has(normalized)) {
      trackRepetitiveDiscovery(normalized, source);
    }
    const existing = discoverySourceByUrl.get(normalized);
    if (existing === 'crawl') return;
    if (source === 'crawl' || !existing) {
      discoverySourceByUrl.set(normalized, source);
    }
  };

  const registerFocusedContentLink = (candidate, sourceUrl, sourceOrder = 0) => {
    if (!scanScope.focused) return false;
    const normalized = normalizeUrl(candidate);
    if (!normalized || !sameOrigin(normalized, origin)) return false;
    const normalizedSource = normalizeUrl(sourceUrl);
    if (
      !normalizedSource
      || normalized === normalizedSource
      || focusedAncestorUrlSet.has(normalized)
      || new URL(normalized).pathname === scanScope.focusPath
    ) {
      return false;
    }
    const listingOwner = getFocusedDiscoveryOwner(normalizedSource);
    if (isFocusedCollectionVariantUrl(normalized, normalizedSource)) {
      focusedCollectionUrls.add(normalizedSource);
      focusedCollectionUrls.add(normalized);
      focusedContentUrls.add(normalizedSource);
      focusedContentUrls.add(normalized);
      return false;
    }
    if (isFocusedDiscoveryHelperUrl(normalized, normalizedSource)) {
      focusedDiscoveryHelperUrls.add(normalized);
      focusedDiscoveryOwnerByUrl.set(normalized, listingOwner);
      focusedContentUrls.add(normalized);
      const collectionUrl = getFocusedDiscoveryCollectionUrl(normalized);
      if (collectionUrl) {
        focusedCollectionUrls.add(collectionUrl);
        focusedContentUrls.add(collectionUrl);
      }
      return false;
    }
    const sourceListingKey = focusedListingOrder.get(normalizedSource);
    const sourceSitemapOrderKey = sitemapNumberingOrder.get(normalizedSource);
    const sourceKey = normalizedSource === seed
      ? 'listing:0'
      : sourceListingKey
        ? `listing:1:${sourceListingKey}`
        : sourceSitemapOrderKey
          ? `listing:2:${sourceSitemapOrderKey}`
          : `listing:3:url:${normalizedSource}`;
    const listingKey = `${sourceKey}:${String(Math.max(0, sourceOrder)).padStart(8, '0')}`;
    const existingListingKey = focusedListingOrder.get(normalized);
    if (!existingListingKey || listingKey.localeCompare(existingListingKey) < 0) {
      focusedListingOrder.set(normalized, listingKey);
      focusedListingParentByUrl.set(normalized, listingOwner);
    }
    focusedListingUrls.add(normalized);
    if (!isWithinFocusedPathAlias(normalized) && !focusedContentUrls.has(normalized)) {
      focusedContentUrls.add(normalized);
      scanDiagnostics.focusedContentDiscoveredCount += 1;
    }
    if (listingOwner && listingOwner !== normalized && !referrerMap.has(normalized)) {
      referrerMap.set(normalized, listingOwner);
    }
    return true;
  };

  const recordDiscoveryError = ({ source, url, status = null, message = '' }) => {
    scanDiagnostics.discoveryErrors.push({
      source,
      url: normalizeUrl(url) || url || null,
      status,
      message: String(message || 'discovery failed').slice(0, 300),
    });
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
  const focusedParentReserve = (
    scanScope.focused
    && !targetedGroupCapture
    && Number.isFinite(pageLimit)
    && pageLimit >= REPETITIVE_GROUP_THRESHOLD
  )
    ? Math.min(20, Math.max(4, Math.floor(pageLimit * 0.2)))
    : 0;
  let activePageLimit = pageLimit === null
    ? null
    : Math.max(1, pageLimit - focusedParentReserve);
  const getPendingQueueCount = () => queue.slice(queueIndex).filter((item) => (
    item?.url
    && !visited.has(item.url)
    && !deferredOutcomeUrls.has(item.url)
  )).length;
  let lastDiscoveryProgressAt = 0;
  const reportDiscoveryProgress = (force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastDiscoveryProgressAt < 250) return;
    lastDiscoveryProgressAt = now;
    const queuedCount = getPendingQueueCount();
    const processedCount = new Set([...visited, ...deferredOutcomeUrls]).size;
    onProgress({
      scanned: processedCount,
      processed: processedCount,
      mapped: 0,
      captured: 0,
      deferred: deferredOutcomeUrls.size,
      blocked: blockedOutcomeUrls.size,
      failed: failedOutcomeUrls.size,
      queued: queuedCount,
      discovered: Math.max(scopedDiscoveredUrls.size, processedCount + queuedCount),
      sessionStartedAt: scanSessionStartedAt,
      phase: 'discovering',
    });
  };
  const filesByUrl = new Map();
  const crawlBrowserContextsByHost = new Map();
  const addFileArtifact = (url, sourceUrl = null, contentType = null, detectedInfo = null) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    const fileInfo = detectedInfo || getScanFileInfo(normalized, contentType);
    const existing = filesByUrl.get(normalized);
    filesByUrl.set(normalized, {
      url: normalized,
      sourceUrl: existing?.sourceUrl || sourceUrl || null,
      contentType: existing?.contentType || fileInfo.contentType || normalizeContentType(contentType) || null,
      fileType: existing?.fileType || fileInfo.fileType || 'File',
      extension: existing?.extension || fileInfo.extension || getUrlExtension(normalized) || null,
    });
  };
  const isScanFileUrl = (url) => getScanFileInfo(url).isFile;
  const allowPageUrl = (candidate) => allowUrl(candidate) && !isIgnoredCrawlUtilityUrl(candidate) && !isScanFileUrl(candidate);
  const enqueue = (url, depth, source = 'crawl') => {
    if (!url) return;
    if (targetedGroupCapture && url !== seed && !captureUrlSet.has(url)) return;
    if (deferredUrlToGroup.has(url)) return;
    if (isIgnoredCrawlUtilityUrl(url)) {
      scanDiagnostics.ignoredUtilityUrls += 1;
      return;
    }
    if (isScanFileUrl(url)) {
      scanDiagnostics.rejectedAsFile += 1;
      addFileArtifact(url);
      return;
    }
    if (!isWithinScanDepth(url)) return;
    if (queued.has(url)) return;
    queued.add(url);
    queue.push({ url, depth, source });
    scanDiagnostics.queuedCount += 1;
    if (source === 'common_path') scanDiagnostics.commonPathQueued += 1;
    if (source === 'sitemap' || source === 'robots_sitemap') scanDiagnostics.sitemapUrlsQueued += 1;
    if (source === 'robots_sitemap') scanDiagnostics.robotsSitemapUrlsQueued += 1;
    if (source === 'rendered') scanDiagnostics.renderedLinksQueued += 1;
    reportDiscoveryProgress();
  };
  enqueue(seed, 0);
  recordDiscovery(seed, 'crawl');
  if (targetedGroupCapture) {
    repetitiveCapture.entries.forEach((entry) => {
      recordDiscovery(entry.url, 'deferred_group');
      enqueue(entry.url, Math.max(1, getUrlDepth(entry.url) - scanScope.focusDepth), 'deferred_group');
    });
  }
  let discoveryCounter = 0;
  const markCompleteSitemapParents = (urls = []) => {
    if (!scanScope.focused) return;
    const normalizedUrls = urls
      .map((url) => normalizeUrl(url))
      .filter((url) => url && sameOrigin(url, origin));
    const focusedRootChildUrl = normalizeUrl(
      `${origin}/${scanScope.focusPath.split('/').filter(Boolean)[0] || ''}`
    );
    const hasDeclaredFocusedRootChild = normalizedUrls.includes(focusedRootChildUrl);
    normalizedUrls.forEach((normalized) => {
      const parentUrl = getParentUrl(normalized);
      if (
        parentUrl
        && (
          parentUrl !== scanScope.siteRootUrl
          || hasDeclaredFocusedRootChild
        )
      ) {
        sitemapCompleteParentUrls.add(parentUrl);
      }
    });
  };

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

  // Capped scans should spend their limited crawl budget on links discovered from the site first.
  if (entitlementCappedScan || scanScope.focused || targetedGroupCapture) {
    scanDiagnostics.commonPathSkippedForEntitlementCap = entitlementCappedScan;
    scanDiagnostics.commonPathSkippedForFocusedScope = scanScope.focused;
    scanDiagnostics.commonPathSkippedForTargetedCapture = targetedGroupCapture;
  } else {
    for (const path of commonPaths) {
      const commonUrl = normalizeUrl(`${origin}${path}`);
      if (commonUrl && isWithinScanDepth(commonUrl)) {
        recordDiscovery(commonUrl, 'common_path');
        enqueue(commonUrl, 1, 'common_path');
      }
    }
  }

  const extraHeaders = {};
  let partialReason = null;
  let stopRequested = false;
  let rootMayNeedRenderedDiscovery = false;

  const getCrawlBrowserContext = async (url) => {
    const host = normalizeHost(new URL(url).hostname);
    if (crawlBrowserContextsByHost.has(host)) return crawlBrowserContextsByHost.get(host);
    const context = await createAuthenticatedBrowserContext(null);
    crawlBrowserContextsByHost.set(host, context);
    return context;
  };

  const fetchWithBrowserFallbackContext = async (url) => {
    const context = await getCrawlBrowserContext(url);
    try {
      const requestResponse = await fetchPageWithBrowserRequestContext(context, url);
      const requestClassification = classifyScanResponse({
        html: requestResponse.html,
        status: requestResponse.status,
        url,
        finalUrl: requestResponse.finalUrl || url,
        headers: requestResponse.headers || {},
      });
      if (
        !requestClassification.isBlockedStatus
        && !requestClassification.isChallengePage
        && !isCloudflareChallengeResponse(requestResponse.headers)
      ) {
        return requestResponse;
      }
    } catch {
      // Fall through to a rendered browser page.
    }
    return fetchPageWithBrowserContext(context, url);
  };

  const shouldRetryWithBrowser = ({ classification, status, headers, source }) => (
    !authContext
    && source !== 'common_path'
    && !classification?.isAuthStatus
    && (
      classification?.isBlockedStatus
      || classification?.isChallengePage
      || isCloudflareChallengeResponse(headers)
      || status === 403
      || status === 429
      || (scanScope.focused && status >= 500)
    )
  );

  const fetchCrawlPage = async (url, source = 'crawl') => {
    if (authContext) {
      return {
        ...(await fetchPageWithBrowserContext(authContext, url)),
        usedBrowser: true,
      };
    }

    try {
      return {
        ...(await fetchPage(url, extraHeaders, scanScope.focused ? 6000 : 20000)),
        usedBrowser: false,
      };
    } catch (error) {
      if (source === 'common_path') throw error;
      if (scanScope.focused && url === seed) {
        try {
          return {
            ...(await fetchPage(url, extraHeaders, 8000)),
            usedBrowser: false,
          };
        } catch {
          // Continue to the browser fallback for a transient focused-root failure.
        }
      }
      scanDiagnostics.browserFetchFallbackCount += 1;
      try {
        const response = await fetchWithBrowserFallbackContext(url);
        scanDiagnostics.browserFetchFallbackSuccessCount += 1;
        return { ...response, usedBrowser: true };
      } catch (browserError) {
        scanDiagnostics.browserFetchFallbackFailedCount += 1;
        recordDiscoveryError({
          source: 'browser_fetch_fallback',
          url,
          message: browserError?.message || 'browser fetch fallback failed',
        });
        throw error;
      }
    }
  };

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
  let focusedRobotsSitemapSucceeded = false;

  const fetchSitemapDocument = async ({
    normalizedSitemap,
    source,
    documentPath,
  }) => {
    const getSitemapEntryOrderKey = (index) => (
      `sitemap:${[...documentPath, index]
        .map((part) => String(Math.max(0, Number(part) || 0)).padStart(8, '0'))
        .join('.')}`
    );
    if (await pollJobStatus()) return { succeeded: false, subSitemaps: [] };

    try {
      const sitemapRes = await axios.get(normalizedSitemap, {
        timeout: 10000,
        headers: { 'User-Agent': SCAN_REQUEST_USER_AGENT },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (normalizedSitemap.endsWith('.txt')) {
        const urls = sitemapRes.data.split('\n').map((u) => u.trim()).filter(Boolean);
        for (let index = 0; index < urls.length; index += 1) {
          const u = urls[index];
          const norm = normalizeUrl(u);
          if (!norm) continue;
          scanDiagnostics.sitemapUrlsFound += 1;
          recordFocusedSitemapNumbering(norm, getSitemapEntryOrderKey(index));
          if (isIgnoredCrawlUtilityUrl(norm)) {
            scanDiagnostics.ignoredUtilityUrls += 1;
            continue;
          }
          if (norm && allowUrl(norm) && isWithinScanDepth(norm)) {
            if (isScanFileUrl(norm)) {
              scanDiagnostics.rejectedAsFile += 1;
              addFileArtifact(norm);
              continue;
            }
            recordDiscovery(norm, source);
            if (!sitemapOrder.has(norm)) sitemapOrder.set(norm, sitemapOrder.size);
            enqueue(
              norm,
              scanScope.focused
                ? Math.max(1, getUrlDepth(norm) - scanScope.focusDepth)
                : 1,
              source
            );
          } else if (norm && !allowUrl(norm)) {
            scanDiagnostics.rejectedByScope += 1;
          }
        }
        markCompleteSitemapParents(urls);
        return { succeeded: true, subSitemaps: [] };
      }

      const $ = cheerio.load(sitemapRes.data, { xmlMode: true });
      const subSitemaps = [];
      const sitemapPageUrls = [];

      $('url > loc').each((index, el) => {
        const loc = $(el).text().trim();
        const norm = normalizeUrl(loc);
        if (norm) sitemapPageUrls.push(norm);
        if (norm) scanDiagnostics.sitemapUrlsFound += 1;
        if (norm) recordFocusedSitemapNumbering(norm, getSitemapEntryOrderKey(index));
        if (norm && isIgnoredCrawlUtilityUrl(norm)) {
          scanDiagnostics.ignoredUtilityUrls += 1;
          return;
        }
        if (norm && allowUrl(norm) && isWithinScanDepth(norm)) {
          if (isScanFileUrl(norm)) {
            scanDiagnostics.rejectedAsFile += 1;
            addFileArtifact(norm);
            return;
          }
          recordDiscovery(norm, source);
          if (!sitemapOrder.has(norm)) sitemapOrder.set(norm, sitemapOrder.size);
          enqueue(
            norm,
            scanScope.focused
              ? Math.max(1, getUrlDepth(norm) - scanScope.focusDepth)
              : 1,
            source
          );
        } else if (norm && !allowUrl(norm)) {
          scanDiagnostics.rejectedByScope += 1;
        }
      });
      markCompleteSitemapParents(sitemapPageUrls);

      $('sitemap > loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) subSitemaps.push(loc);
      });
      return { succeeded: true, subSitemaps };
    } catch (error) {
      const status = error?.response?.status || null;
      if (status === 404 && source !== 'robots_sitemap') {
        return { succeeded: false, subSitemaps: [] };
      }
      scanDiagnostics.sitemapFetchFailures += 1;
      recordDiscoveryError({
        source,
        url: normalizedSitemap,
        status,
        message: error?.message || 'sitemap fetch failed',
      });
      return { succeeded: false, subSitemaps: [] };
    }
  };

  const compareSitemapDocumentPaths = (left, right) => {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (index >= left.length) return -1;
      if (index >= right.length) return 1;
      const difference = Number(left[index]) - Number(right[index]);
      if (difference !== 0) return difference;
    }
    return 0;
  };

  const processSitemap = async (
    sitemapUrl,
    source = 'sitemap',
    sitemapDocumentPath = null
  ) => {
    const rootDocumentPath = Array.isArray(sitemapDocumentPath)
      ? sitemapDocumentPath
      : [sitemapDocumentCounter++];
    let pendingTasks = [{
      sitemapUrl,
      source,
      documentPath: rootDocumentPath,
      root: true,
    }];
    let rootSucceeded = false;

    while (pendingTasks.length > 0 && processedSitemaps.size < MAX_SITEMAPS) {
      if (await pollJobStatus() || stopRequested) break;
      pendingTasks.sort((left, right) => (
        compareSitemapDocumentPaths(left.documentPath, right.documentPath)
      ));

      const admittedTasks = [];
      for (const task of pendingTasks) {
        if (processedSitemaps.size >= MAX_SITEMAPS) break;
        const normalizedSitemap = normalizeUrl(task.sitemapUrl);
        if (!normalizedSitemap || processedSitemaps.has(normalizedSitemap)) continue;
        if (!getPlacementForUrl(normalizedSitemap, scanScope)) continue;
        processedSitemaps.add(normalizedSitemap);
        admittedTasks.push({ ...task, normalizedSitemap });
      }
      if (admittedTasks.length === 0) break;

      const results = new Array(admittedTasks.length);
      await runWithConcurrency(
        admittedTasks.map((task, index) => ({ task, index })),
        4,
        async ({ task, index }) => {
          results[index] = await fetchSitemapDocument(task);
        }
      );

      const nextTasks = [];
      admittedTasks.forEach((task, taskIndex) => {
        const result = results[taskIndex] || { succeeded: false, subSitemaps: [] };
        if (task.root && result.succeeded) rootSucceeded = true;
        result.subSitemaps.forEach((loc, index) => {
          nextTasks.push({
            sitemapUrl: loc,
            source: task.source,
            documentPath: [...task.documentPath, index],
            root: false,
          });
        });
      });
      pendingTasks = nextTasks;
    }

    return rootSucceeded;
  };

  const processRobotsSitemaps = async () => {
    if (await pollJobStatus()) return;
    try {
      const robotsRes = await axios.get(`${origin}/robots.txt`, {
        timeout: 8000,
        maxContentLength: SCAN_HTML_RESPONSE_MAX_BYTES,
        maxBodyLength: SCAN_HTML_RESPONSE_MAX_BYTES,
        headers: { 'User-Agent': SCAN_REQUEST_USER_AGENT },
        validateStatus: (s) => s >= 200 && s < 400,
      });
      const sitemapUrls = String(robotsRes.data || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .map((line) => line.match(/^sitemap:\s*(.+)$/i)?.[1]?.trim())
        .filter(Boolean);
      const focusedSitemapUrls = scanScope.focused
        ? sitemapUrls.filter((sitemapUrl) => {
          const normalized = normalizeUrl(sitemapUrl);
          if (!normalized || !sameOrigin(normalized, origin)) return false;
          const pathname = new URL(normalized).pathname;
          return pathname === scanScope.focusPath || pathname.startsWith(`${scanScope.focusPath}/`);
        })
        : [];
      const selectedSitemapUrls = focusedSitemapUrls.length > 0
        ? focusedSitemapUrls
        : sitemapUrls;
      for (const sitemapUrl of selectedSitemapUrls) {
        if (await pollJobStatus()) return;
        const normalizedSitemap = normalizeUrl(sitemapUrl);
        if (!normalizedSitemap) continue;
        if (!getPlacementForUrl(normalizedSitemap, scanScope)) {
          scanDiagnostics.rejectedByScope += 1;
          continue;
        }
        scanDiagnostics.robotsSitemapUrlsFound += 1;
        const succeeded = await processSitemap(normalizedSitemap, 'robots_sitemap');
        if (succeeded && focusedSitemapUrls.includes(sitemapUrl)) {
          focusedRobotsSitemapSucceeded = true;
        }
      }
    } catch (error) {
      const status = error?.response?.status || null;
      if (status === 404) return;
      scanDiagnostics.robotsFetchFailed = true;
      recordDiscoveryError({
        source: 'robots',
        url: `${origin}/robots.txt`,
        status,
        message: error?.message || 'robots fetch failed',
      });
    }
  };

  reportDiscoveryProgress(true);

  // url -> { url, title, parentUrl }
  const pageMap = new Map();
  const focusedAncestorMetaByUrl = new Map();
  const errors = [];
  const inactivePages = [];
  const brokenLinks = [];
  const linksByUrl = new Map();
  const linkStatusCache = new Map();
  const scheduledBrokenLinkChecks = new Set();
  const brokenLinkCandidates = [];
  const MAX_BROKEN_LINK_CHECKS = 500;
  let brokenChecks = 0;
  let finalProgressSummary = null;
  const countPageMapValues = (predicate) => {
    let count = 0;
    pageMap.forEach((meta) => {
      if (predicate(meta)) count += 1;
    });
    return count;
  };
  const countCanonicalDuplicatesFromPageMap = () => {
    const seen = new Set();
    let duplicateCount = 0;
    pageMap.forEach((meta) => {
      const key = getPageIdentityKey(meta);
      if (!key) return;
      if (seen.has(key)) {
        duplicateCount += 1;
        return;
      }
      seen.add(key);
    });
    return duplicateCount;
  };
  const collectProgressNodes = (roots = []) => {
    const nodesForProgress = [];
    const seen = new Set();
    const visit = (node) => {
      if (!node) return;
      const key = node.id || node.url;
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      nodesForProgress.push(node);
      (node.children || []).forEach(visit);
    };
    roots.filter(Boolean).forEach(visit);
    return nodesForProgress;
  };
  const getProgressSummary = (roots = null) => {
    const nodesForProgress = Array.isArray(roots) ? collectProgressNodes(roots) : null;
    const findings = {
      brokenLinks: scanOptions.brokenLinks ? brokenLinks.length : 0,
      duplicates: scanOptions.duplicates
        ? (nodesForProgress
          ? nodesForProgress.filter((node) => node.isDuplicate).length
          : countCanonicalDuplicatesFromPageMap())
        : 0,
      missing: nodesForProgress
        ? nodesForProgress.filter((node) => node.isVirtualMissing || node.isMissing || node.scanStatus === 'missing').length
        : 0,
      errorPages: scanOptions.errorPages ? errors.length : 0,
      inactivePages: scanOptions.inactivePages ? inactivePages.length : 0,
      redirects: nodesForProgress
        ? nodesForProgress.filter((node) => node.wasRedirect).length
        : countPageMapValues((meta) => meta.wasRedirect),
      authenticatedPages: scanOptions.authenticatedPages
        ? (nodesForProgress
          ? nodesForProgress.filter((node) => node.authRequired).length
          : countPageMapValues((meta) => meta.authRequired))
        : 0,
      scanLimited: nodesForProgress
        ? nodesForProgress.filter((node) => node.scanStatus === 'scan_limited' || node.isBlocked || node.isChallengePage).length
        : countPageMapValues((meta) => meta.scanStatus === 'scan_limited' || meta.isBlocked || meta.isChallengePage),
    };
    return {
      findings,
      totalFindings: Object.values(findings).reduce((sum, value) => sum + (Number(value) || 0), 0),
    };
  };
  const getScanProgressSnapshot = ({ final = false, phase = null } = {}) => ({
    scanned: new Set([...visited, ...deferredOutcomeUrls]).size,
    processed: new Set([...visited, ...deferredOutcomeUrls]).size,
    mapped: countPageMapValues(isSuccessfulCapturedPageMeta),
    captured: countPageMapValues(isSuccessfulCapturedPageMeta),
    deferred: deferredOutcomeUrls.size,
    blocked: blockedOutcomeUrls.size,
    failed: failedOutcomeUrls.size,
    queued: getPendingQueueCount(),
    discovered: Math.max(
      scopedDiscoveredUrls.size,
      new Set([...visited, ...deferredOutcomeUrls]).size + getPendingQueueCount(),
      pageMap.size
    ),
    sessionStartedAt: scanSessionStartedAt,
    phase: phase || (final ? 'finalizing' : 'scanning'),
    ...(final && finalProgressSummary ? finalProgressSummary : getProgressSummary()),
    ...(final ? { final: true } : {}),
  });
  const reportScanProgress = (options = {}) => {
    if (onProgress) onProgress(getScanProgressSnapshot(options));
  };

  const scheduleBrokenLinkCheck = (link, sourceUrl) => {
    if (!scanOptions.brokenLinks) return;
    if (brokenChecks >= MAX_BROKEN_LINK_CHECKS) return;
    if (linkStatusCache.has(link) || scheduledBrokenLinkChecks.has(link)) return;
    scheduledBrokenLinkChecks.add(link);
    brokenChecks += 1;
    brokenLinkCandidates.push({ link, sourceUrl });
  };

  const activeFocusedDepthCounts = new Map();
  let focusedSitemapDiscoveryPending = false;
  const getMinimumActiveFocusedDepth = () => {
    let minimum = Number.POSITIVE_INFINITY;
    activeFocusedDepthCounts.forEach((count, depth) => {
      if (count > 0) minimum = Math.min(minimum, depth);
    });
    return minimum;
  };

  const compareFocusedQueueItems = (left, right) => {
    const depthDifference = Number(left?.depth ?? Number.MAX_SAFE_INTEGER)
      - Number(right?.depth ?? Number.MAX_SAFE_INTEGER);
    if (depthDifference !== 0) return depthDifference;
    const leftSitemapOrderKey = sitemapNumberingOrder.get(left.url) || '';
    const rightSitemapOrderKey = sitemapNumberingOrder.get(right.url) || '';
    if (
      leftSitemapOrderKey
      && rightSitemapOrderKey
      && leftSitemapOrderKey !== rightSitemapOrderKey
    ) {
      return leftSitemapOrderKey.localeCompare(rightSitemapOrderKey);
    }
    if (leftSitemapOrderKey && !rightSitemapOrderKey) {
      return -1;
    }
    if (!leftSitemapOrderKey && rightSitemapOrderKey) {
      return 1;
    }
    return compareNaturalScanUrls(left.url, right.url);
  };

  const takeNextQueueItem = () => {
    while (queueIndex < queue.length && (activePageLimit === null || visited.size < activePageLimit)) {
      if (scanScope.focused) {
        // Finish the site-declared ordering source before a capped focused crawl
        // spends its page allowance. Otherwise sitemap-vs-crawl response timing
        // can change both the selected URLs and their final sibling order.
        if (focusedSitemapDiscoveryPending) return null;
        let preferredIndex = -1;
        for (let index = queueIndex; index < queue.length; index += 1) {
          const candidate = queue[index];
          if (!candidate?.url || visited.has(candidate.url)) continue;
          if (deferredUrlToGroup.has(candidate.url)) continue;
          if (
            preferredIndex < 0
            || compareFocusedQueueItems(candidate, queue[preferredIndex]) < 0
          ) {
            preferredIndex = index;
          }
        }
        if (preferredIndex < 0) return null;
        if (preferredIndex !== queueIndex) {
          [queue[queueIndex], queue[preferredIndex]] = [queue[preferredIndex], queue[queueIndex]];
        }
        const nextDepth = Number(queue[queueIndex]?.depth ?? Number.MAX_SAFE_INTEGER);
        if (getMinimumActiveFocusedDepth() < nextDepth) return null;
      }
      const item = queue[queueIndex++];
      if (!item?.url || visited.has(item.url)) continue;
      if (deferredUrlToGroup.has(item.url)) continue;
      visited.add(item.url);
      return item;
    }
    return null;
  };

  const processCrawlItem = async ({ url, depth, source = 'crawl' }) => {
    visited.add(url);
    const deferredGroupId = deferredUrlToGroup.get(url);
    if (deferredGroupId) {
      const group = repetitiveGroupsById.get(deferredGroupId);
      if (group) {
        group.deferredEntries = group.deferredEntries.filter((entry) => entry.url !== url);
        group.captureUrls.add(url);
      }
      deferredUrlToGroup.delete(url);
    }
    deferredOutcomeUrls.delete(url);
    const discoveryIndex = discoveryCounter++;

    // Send progress update
    reportScanProgress();

    if ((depthLimit !== null && depth > depthLimit) || !isWithinScanDepth(url)) return;
    if (!allowUrl(url)) return;
    if (isIgnoredCrawlUtilityUrl(url)) {
      scanDiagnostics.ignoredUtilityUrls += 1;
      return;
    }
    if (isScanFileUrl(url)) {
      addFileArtifact(url, getParentUrl(url) || null);
      return;
    }

    let html;
    let status = 0;
    let contentType = '';
    let finalUrl = url;
    let responseTime = null;
    let headers = {};
    let usedBrowserFetch = false;
    try {
      const res = await fetchCrawlPage(url, source);
      html = res.html;
      status = res.status;
      contentType = res.contentType;
      headers = res.headers || {};
      finalUrl = res.finalUrl || url;
      responseTime = res.responseTime;
      usedBrowserFetch = Boolean(res.usedBrowser);
      scanDiagnostics.fetchedPageCount += 1;
    } catch (e) {
      scanDiagnostics.failedFetches += 1;
      failedOutcomeUrls.add(url);
      if (url === seed) {
        scanDiagnostics.rootStatus = status;
        scanDiagnostics.rootClassification = 'inactive';
        scanDiagnostics.rootBlockedReason = 'fetch_failed';
      }
      if (source === 'common_path' || source === 'parent_probe') return;
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
        reportScanProgress();
      }
      return;
    }

    let classification = classifyScanResponse({ html, status, url, finalUrl, headers });
    if (classification.isChallengePage || isCloudflareChallengeResponse(headers)) {
      scanDiagnostics.cloudflareChallengeCount += 1;
    }

    if (!usedBrowserFetch && shouldRetryWithBrowser({ classification, status, headers, source })) {
      scanDiagnostics.cloudflareBrowserRetryCount += 1;
      try {
        const retry = await fetchWithBrowserFallbackContext(url);
        const retryClassification = classifyScanResponse({
          html: retry.html,
          status: retry.status,
          url,
          finalUrl: retry.finalUrl || url,
          headers: retry.headers || {},
        });
        html = retry.html;
        status = retry.status;
        contentType = retry.contentType;
        headers = retry.headers || {};
        finalUrl = retry.finalUrl || url;
        responseTime = retry.responseTime;
        usedBrowserFetch = true;
        classification = retryClassification;
        if (retryClassification.isChallengePage || isCloudflareChallengeResponse(headers)) {
          scanDiagnostics.cloudflareChallengeCount += 1;
        }
        if (!retryClassification.isBlockedStatus && !retryClassification.isChallengePage) {
          scanDiagnostics.cloudflareBrowserRetrySuccessCount += 1;
        } else {
          scanDiagnostics.cloudflareBrowserRetryFailedCount += 1;
        }
      } catch (retryError) {
        scanDiagnostics.cloudflareBrowserRetryFailedCount += 1;
        recordDiscoveryError({
          source: 'cloudflare_browser_retry',
          url,
          status,
          message: retryError?.message || 'browser retry failed',
        });
      }
    }

    const fetchedFileInfo = getScanFileInfo(finalUrl || url, contentType);
    const responseIsFile = fetchedFileInfo.isFile || !isHtmlContentType(contentType);
    if (responseIsFile) {
      addFileArtifact(finalUrl || url, getParentUrl(url) || null, contentType, fetchedFileInfo);
      return;
    }

    if (url === seed) {
      rootMayNeedRenderedDiscovery = /(?:q:container|__NEXT_DATA__|__NUXT__|data-reactroot|id=["'](?:app|root)["'])/i.test(html);
      const normalizedFinalUrl = normalizeUrl(finalUrl || url);
      if (
        scanScope.focused
        && normalizedFinalUrl
        && normalizedFinalUrl !== seed
        && sameOrigin(normalizedFinalUrl, origin)
        && !isUrlWithinFocusedPath(normalizedFinalUrl, scanScope)
      ) {
        const redirectPath = new URL(normalizedFinalUrl).pathname.replace(/\/+$/, '') || '/';
        if (!focusedPathAliases.has(redirectPath)) {
          focusedPathAliases.add(redirectPath);
          scanDiagnostics.focusedRedirectAliasCount += 1;
        }
      }
      scanDiagnostics.finalUrl = finalUrl || url;
      scanDiagnostics.rootStatus = status;
      scanDiagnostics.rootContentType = normalizeContentType(contentType);
      scanDiagnostics.rootTitleSource = classification.titleSource;
      scanDiagnostics.rootClassification = classification.scanStatus;
      scanDiagnostics.rootBlockedReason = classification.blockedReason || null;
    }
    if (status >= 400) {
      if (source === 'common_path') return;
      const shouldKeep = (scanOptions.errorPages && (classification.isErrorStatus || classification.isBlockedStatus))
        || (scanOptions.authenticatedPages && classification.isAuthStatus)
        || (scanOptions.inactivePages && classification.isInactiveStatus);
      if (classification.isErrorStatus && scanOptions.errorPages) {
        scanDiagnostics.errorCount += 1;
        errors.push({
          url,
          status,
          authRequired: false,
          blockedReason: classification.blockedReason,
          httpErrorType: getHttpErrorType(status),
          httpErrorLabel: getHttpErrorLabel(status),
          isViewableError: classification.isViewableError,
        });
      }
      if (scanOptions.inactivePages && classification.isInactiveStatus) {
        scanDiagnostics.inactiveCount += 1;
        inactivePages.push({ url, status, blockedReason: classification.blockedReason });
      }
      if (scanOptions.brokenLinks && classification.isErrorStatus) {
        brokenLinks.push({ url, status });
      }
      if (!shouldKeep) {
        return;
      }
    }

    const seoMetadata = classification.shouldExtractMetadata
      ? extractSeoMetadata(html, finalUrl || url)
      : {};
    const title = classification.shouldExtractMetadata
      ? extractTitle(html, finalUrl || url)
      : (classification.isErrorStatus ? (classification.title || classification.fallbackTitle) : classification.fallbackTitle);
    const parentUrl = getParentUrl(finalUrl || url);
    const canonicalUrl = classification.shouldExtractMetadata
      ? (normalizeUrl(seoMetadata.canonicalUrl) || extractCanonicalUrl(html, finalUrl || url))
      : null;
    const wasRedirect = normalizeUrl(finalUrl || url) !== normalizeUrl(url);
    const description = getPrimaryDescription(seoMetadata);
    const metaTags = getPrimaryMetaTags(seoMetadata);
    const repetitivePageSignal = extractRepetitivePageSignal(html, seoMetadata);

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
      errorStatus: classification.isErrorStatus ? status : null,
      isError: classification.isErrorStatus,
      httpErrorType: classification.isErrorStatus ? getHttpErrorType(status) : null,
      httpErrorLabel: classification.isErrorStatus ? getHttpErrorLabel(status) : null,
      isViewableError: classification.isViewableError,
      wasRedirect,
      responseTime,
      titleSource: classification.titleSource,
      blockedReason: classification.blockedReason,
      isChallengePage: classification.isChallengePage,
      isBlocked: classification.isBlockedStatus,
      scanStatus: classification.scanStatus,
      metadataAvailable: classification.metadataAvailable,
      repetitivePageSignal,
    });
    if (classification.isBlockedStatus || classification.isChallengePage) {
      blockedOutcomeUrls.add(url);
      failedOutcomeUrls.delete(url);
    } else if (classification.isErrorStatus || classification.isInactiveStatus || status >= 400) {
      failedOutcomeUrls.add(url);
      blockedOutcomeUrls.delete(url);
    } else {
      failedOutcomeUrls.delete(url);
      blockedOutcomeUrls.delete(url);
    }
    reportScanProgress();
    if (source === 'common_path' && status >= 200 && status < 400) {
      scanDiagnostics.commonPathActive += 1;
    }
    if (classification.isAuthStatus) scanDiagnostics.authCount += 1;
    if (classification.isInactiveStatus) scanDiagnostics.inactiveCount += 1;

    const isFocusedContentLeaf = url !== seed && focusedListingUrls.has(url);
    const suppressLinkDiscovery = isFocusedContentLeaf || source === 'parent_probe';
    const links = classification.shouldExtractLinks && !suppressLinkDiscovery
      ? extractLinks(html, finalUrl || url)
      : [];
    if (
      scanScope.focused
      && !suppressLinkDiscovery
      && classification.shouldExtractLinks
    ) {
      extractFocusedContentLinks(html, finalUrl || url).forEach((link, index) => {
        registerFocusedContentLink(link, url, index);
        if (!links.includes(link)) links.push(link);
      });
    }
    if (scanScope.focused) {
      const helperCollectionLinks = [];
      links.forEach((link) => {
        if (isFocusedCollectionVariantUrl(link, url)) {
          focusedCollectionUrls.add(normalizeUrl(url));
          focusedCollectionUrls.add(normalizeUrl(link));
          focusedContentUrls.add(normalizeUrl(url));
          focusedContentUrls.add(normalizeUrl(link));
        }
        if (!isFocusedDiscoveryHelperUrl(link, url)) return;
        const collectionUrl = getFocusedDiscoveryCollectionUrl(link);
        focusedDiscoveryHelperUrls.add(link);
        focusedDiscoveryOwnerByUrl.set(link, collectionUrl || getFocusedDiscoveryOwner(url));
        focusedContentUrls.add(link);
        if (collectionUrl) {
          focusedCollectionUrls.add(collectionUrl);
          focusedContentUrls.add(collectionUrl);
        }
        if (
          collectionUrl
          && collectionUrl !== normalizeUrl(url)
          && isWithinFocusedPathAlias(collectionUrl)
        ) {
          helperCollectionLinks.push(collectionUrl);
        }
      });
      helperCollectionLinks.forEach((link) => {
        if (!links.includes(link)) links.push(link);
      });
    }
    const allowedLinks = links.filter((link) => (
      allowPageUrl(link) && !focusedDiscoveryHelperUrls.has(normalizeUrl(link))
    ));
    linksByUrl.set(url, allowedLinks);
    if (url === seed) {
      scanDiagnostics.rootExtractedLinks = links.length;
      scanDiagnostics.rootAllowedLinks = allowedLinks.length;
    }

    for (const link of links) {
      if (await pollJobStatus()) break;
      recordNumberingDiscovery(link);
      if (isIgnoredCrawlUtilityUrl(link)) {
        scanDiagnostics.ignoredUtilityUrls += 1;
        continue;
      }
      if (!allowUrl(link)) {
        scanDiagnostics.rejectedByScope += 1;
        continue;
      }

      if (isScanFileUrl(link)) {
        scanDiagnostics.rejectedAsFile += 1;
        scheduleBrokenLinkCheck(link, url);
        addFileArtifact(link, url);
        continue;
      }

      const linkSource = focusedListingUrls.has(link)
        ? 'focused_content'
        : 'crawl';
      recordLinkEdge(url, link);
      recordDiscovery(link, linkSource);

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
      enqueue(link, d, linkSource);
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
      const itemDepth = Number(item.depth || 0);
      if (scanScope.focused) {
        activeFocusedDepthCounts.set(
          itemDepth,
          (activeFocusedDepthCounts.get(itemDepth) || 0) + 1
        );
      }
      try {
        await processCrawlItem(item);
      } finally {
        activeCrawlItems -= 1;
        if (scanScope.focused) {
          const remainingAtDepth = (activeFocusedDepthCounts.get(itemDepth) || 1) - 1;
          if (remainingAtDepth > 0) activeFocusedDepthCounts.set(itemDepth, remainingAtDepth);
          else activeFocusedDepthCounts.delete(itemDepth);
        }
      }
    }
  };

  let activeCrawlItems = 0;
  const workerCount = Math.min(
    SCAN_PAGE_CONCURRENCY,
    Math.max(1, pageLimit === null ? SCAN_PAGE_CONCURRENCY : pageLimit)
  );
  const runCrawlWorkers = async () => {
    await Promise.all(Array.from({ length: workerCount }, crawlWorker));
  };

  const isSegmentDescendantUrl = (candidate, ancestor) => {
    const normalizedCandidate = normalizeUrl(candidate);
    const normalizedAncestor = normalizeUrl(ancestor);
    if (
      !normalizedCandidate
      || !normalizedAncestor
      || normalizedCandidate === normalizedAncestor
      || !sameOrigin(normalizedCandidate, normalizedAncestor)
    ) {
      return false;
    }
    if (new URL(normalizedAncestor).search) return false;
    const candidatePath = new URL(normalizedCandidate).pathname;
    const ancestorPath = new URL(normalizedAncestor).pathname.replace(/\/+$/, '') || '/';
    return ancestorPath === '/'
      ? candidatePath !== '/'
      : candidatePath.startsWith(`${ancestorPath}/`);
  };

  const promoteRequiredDeferredAncestors = async () => {
    for (let pass = 0; pass < 3 && !stopRequested; pass += 1) {
      const capturedUrls = Array.from(pageMap.keys());
      const promotedEntries = [];
      let remainingAllowance = pageLimit === null
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, pageLimit - visited.size);
      repetitiveGroupsById.forEach((group) => {
        if (!group.active || group.disabled || group.deferredEntries.length === 0) return;
        const retainedEntries = [];
        group.deferredEntries.forEach((entry) => {
          const requiredAsParent = capturedUrls.some((url) => isSegmentDescendantUrl(url, entry.url));
          if (!requiredAsParent || remainingAllowance <= 0) {
            retainedEntries.push(entry);
            return;
          }
          remainingAllowance -= 1;
          deferredUrlToGroup.delete(entry.url);
          deferredOutcomeUrls.delete(entry.url);
          group.captureUrls.add(entry.url);
          promotedEntries.push(entry);
        });
        group.deferredEntries = retainedEntries;
      });
      if (promotedEntries.length === 0) return;
      scanDiagnostics.promotedDeferredAncestorCount += promotedEntries.length;
      promotedEntries.forEach((entry) => {
        queued.delete(entry.url);
      });
      await runWithConcurrency(promotedEntries, 4, async (entry) => {
        if (await pollJobStatus() || pageMap.has(entry.url)) return;
        await processCrawlItem({
          url: entry.url,
          depth: Math.max(1, getUrlDepth(entry.url) - (scanScope.focused ? scanScope.focusDepth : 0)),
          source: 'required_parent',
        });
      });
    }
  };

  if (!targetedGroupCapture) {
    const seedItem = takeNextQueueItem();
    if (seedItem) await processCrawlItem(seedItem);

    const discoverSitemapPages = async () => {
      if (stopRequested) return;
      if (
        scanScope.focused
        && ['auth', 'inactive', 'scan_limited'].includes(scanDiagnostics.rootClassification)
      ) {
        scanDiagnostics.sitemapSkippedForBlockedFocusedRoot = true;
        return;
      }
      await processRobotsSitemaps();
      if (!focusedRobotsSitemapSucceeded) {
        await processSitemap(`${origin}/sitemap.xml`);
        for (const altSitemap of ['/sitemap_index.xml', '/sitemap-index.xml', '/sitemap.txt']) {
          if (stopRequested) break;
          await processSitemap(`${origin}${altSitemap}`);
        }
      }
    };
    focusedSitemapDiscoveryPending = scanScope.focused;
    try {
      await Promise.all([
        runCrawlWorkers(),
        discoverSitemapPages(),
      ]);
    } finally {
      focusedSitemapDiscoveryPending = false;
    }
    reportDiscoveryProgress(true);
  }
  await runCrawlWorkers();
  await promoteRequiredDeferredAncestors();

  const validateRepetitiveGroups = async () => {
    let releasedDeferredGroupUrls = false;
    repetitiveGroupsById.forEach((group) => {
      if (!group.active || group.disabled || group.validated) return;
      if (group.shape !== 'slug') {
        group.validated = true;
        return;
      }
      const signals = Array.from(group.captureUrls)
        .map((url) => pageMap.get(url)?.repetitivePageSignal)
        .filter(Boolean);
      if (sampleSignalsAreCompatible(signals)) {
        group.validated = true;
        return;
      }
      group.active = false;
      group.disabled = true;
      group.deferredEntries.forEach((entry) => {
        deferredUrlToGroup.delete(entry.url);
        deferredOutcomeUrls.delete(entry.url);
        queued.delete(entry.url);
        enqueue(
          entry.url,
          Math.max(1, getUrlDepth(entry.url) - (scanScope.focused ? scanScope.focusDepth : 0)),
          entry.source || 'crawl'
        );
        releasedDeferredGroupUrls = true;
      });
      group.deferredEntries = [];
    });
    if (releasedDeferredGroupUrls && !stopRequested && (pageLimit === null || visited.size < pageLimit)) {
      await runCrawlWorkers();
    }
  };
  await validateRepetitiveGroups();

  const shouldTryRenderedDiscovery = () => {
    if (stopRequested) return false;
    if (scanDiagnostics.renderedDiscoveryTried) return false;
    if (pageLimit !== null && visited.size >= pageLimit) return false;
    if (
      pageMap.size > 1
      && !(scanScope.focused && rootMayNeedRenderedDiscovery && pageMap.size <= 20)
    ) return false;
    return true;
  };

  const runRenderedDiscoveryFallback = async () => {
    scanDiagnostics.renderedDiscoveryTried = true;
    const rendered = await extractRenderedLinks(seed, authContext, {
      maxContentLinks: pageLimit === null ? 5000 : Math.max(1, pageLimit - 1),
      shouldStop: pollJobStatus,
    });
    scanDiagnostics.renderedLinksFound = rendered.links.length;
    scanDiagnostics.renderedPaginationPagesVisited = rendered.paginationPagesVisited || 0;
    if (rendered.error) {
      scanDiagnostics.renderedDiscoveryError = rendered.error;
      recordDiscoveryError({
        source: 'rendered',
        url: seed,
        message: rendered.error,
      });
    }
    const normalizedRenderedLinks = rendered.links
      .map((link) => normalizeUrl(link))
      .filter(Boolean);
    rendered.contentLinks
      .map((link) => normalizeUrl(link))
      .filter(Boolean)
      .forEach((link, index) => {
        registerFocusedContentLink(link, seed, index);
        if (!normalizedRenderedLinks.includes(link)) normalizedRenderedLinks.push(link);
      });
    const renderedCollectionLinks = [];
    normalizedRenderedLinks.forEach((link) => {
      if (isFocusedCollectionVariantUrl(link, seed)) {
        focusedCollectionUrls.add(seed);
        focusedCollectionUrls.add(link);
        focusedContentUrls.add(link);
      }
      if (!isFocusedDiscoveryHelperUrl(link, seed)) return;
      const collectionUrl = getFocusedDiscoveryCollectionUrl(link);
      focusedDiscoveryHelperUrls.add(link);
      focusedDiscoveryOwnerByUrl.set(link, collectionUrl || seed);
      focusedContentUrls.add(link);
      if (collectionUrl) {
        focusedCollectionUrls.add(collectionUrl);
        focusedContentUrls.add(collectionUrl);
      }
      if (collectionUrl && collectionUrl !== seed && isWithinFocusedPathAlias(collectionUrl)) {
        renderedCollectionLinks.push(collectionUrl);
      }
    });
    renderedCollectionLinks.forEach((link) => {
      if (!normalizedRenderedLinks.includes(link)) normalizedRenderedLinks.push(link);
    });
    const allowedRenderedLinks = normalizedRenderedLinks.filter((link) => (
      allowPageUrl(link) && !focusedDiscoveryHelperUrls.has(normalizeUrl(link))
    ));
    linksByUrl.set(seed, allowedRenderedLinks);
    scanDiagnostics.rootExtractedLinks = Math.max(scanDiagnostics.rootExtractedLinks, normalizedRenderedLinks.length);
    scanDiagnostics.rootAllowedLinks = Math.max(scanDiagnostics.rootAllowedLinks, allowedRenderedLinks.length);
    for (const link of normalizedRenderedLinks) {
      if (await pollJobStatus()) break;
      recordNumberingDiscovery(link);
      if (isIgnoredCrawlUtilityUrl(link)) {
        scanDiagnostics.ignoredUtilityUrls += 1;
        continue;
      }
      if (!allowUrl(link)) {
        scanDiagnostics.rejectedByScope += 1;
        continue;
      }
      if (isScanFileUrl(link)) {
        scanDiagnostics.rejectedAsFile += 1;
        addFileArtifact(link, seed);
        continue;
      }
      const linkSource = focusedListingUrls.has(link)
        ? 'focused_content'
        : 'rendered';
      recordLinkEdge(seed, link);
      recordDiscovery(link, linkSource);
      if (!referrerMap.has(link) && link !== seed) {
        referrerMap.set(link, seed);
      }
      enqueue(link, 1, linkSource);
    }
    if (!stopRequested && queueIndex < queue.length) {
      await runCrawlWorkers();
    }
  };

  if (shouldTryRenderedDiscovery()) {
    await runRenderedDiscoveryFallback();
  }
  await promoteRequiredDeferredAncestors();
  await validateRepetitiveGroups();

  const probeFocusedPathParents = async () => {
    if (!scanScope.focused || targetedGroupCapture || stopRequested) return;
    const candidates = new Set();
    pageMap.forEach((_, url) => {
      if (focusedContentUrls.has(url) || !isUrlWithinFocusedPath(url, scanScope)) return;
      const parentUrl = getParentUrl(url);
      if (
        !parentUrl
        || parentUrl === seed
        || pageMap.has(parentUrl)
        || focusedAncestorUrlSet.has(parentUrl)
        || deferredUrlToGroup.has(parentUrl)
        || !allowUrl(parentUrl)
      ) {
        return;
      }
      const leaf = decodeURIComponent(new URL(parentUrl).pathname.split('/').filter(Boolean).at(-1) || '');
      if (!/[a-z]/i.test(leaf) || leaf.length < 3) return;
      candidates.add(parentUrl);
    });
    const remainingAllowance = pageLimit === null
      ? 20
      : Math.max(0, pageLimit - pageMap.size);
    const probeUrls = Array.from(candidates)
      .sort(compareNaturalScanUrls)
      .slice(0, Math.min(20, remainingAllowance));
    scanDiagnostics.focusedParentProbeCount = probeUrls.length;
    await runWithConcurrency(probeUrls, 4, async (url) => {
      if (await pollJobStatus() || pageMap.has(url)) return;
      await processCrawlItem({
        url,
        depth: Math.max(1, getUrlDepth(url) - scanScope.focusDepth),
        source: 'parent_probe',
      });
      if (isSuccessfulCapturedPageMeta(pageMap.get(url))) {
        scanDiagnostics.focusedParentProbeSuccessCount += 1;
      }
    });
  };
  await probeFocusedPathParents();
  if (focusedParentReserve > 0 && !stopRequested) {
    activePageLimit = pageLimit;
    await runCrawlWorkers();
  }

  const inspectFocusedAncestor = async (url) => {
    let html = '';
    let status = 0;
    let contentType = '';
    let finalUrl = url;
    let responseTime = null;
    let headers = {};
    let usedBrowserFetch = false;
    try {
      const response = await fetchCrawlPage(url, 'focus_ancestor');
      html = response.html;
      status = response.status;
      contentType = response.contentType;
      headers = response.headers || {};
      finalUrl = response.finalUrl || url;
      responseTime = response.responseTime;
      usedBrowserFetch = Boolean(response.usedBrowser);
    } catch {
      return {
        url,
        finalUrl: url,
        title: getUrlFallbackTitle(url),
        httpStatus: 0,
        statusCode: 0,
        responseTime,
        titleSource: 'url_fallback',
        blockedReason: 'fetch_failed',
        scanStatus: 'inactive',
        isInactive: true,
        metadataAvailable: false,
      };
    }

    let classification = classifyScanResponse({ html, status, url, finalUrl, headers });
    if (!usedBrowserFetch && shouldRetryWithBrowser({ classification, status, headers, source: 'focus_ancestor' })) {
      try {
        const retryContext = await getCrawlBrowserContext(url);
        const retry = await fetchPageWithBrowserContext(retryContext, url);
        html = retry.html;
        status = retry.status;
        contentType = retry.contentType;
        headers = retry.headers || {};
        finalUrl = retry.finalUrl || url;
        responseTime = retry.responseTime;
        classification = classifyScanResponse({
          html,
          status,
          url,
          finalUrl,
          headers,
        });
      } catch {
        // Keep the original response when the browser retry is unavailable.
      }
    }

    const fileInfo = getScanFileInfo(finalUrl || url, contentType);
    if (fileInfo.isFile || !isHtmlContentType(contentType)) {
      return {
        url,
        finalUrl,
        title: getUrlFallbackTitle(finalUrl || url),
        httpStatus: status,
        statusCode: status,
        responseTime,
        isFile: true,
        fileType: fileInfo.fileType || 'File',
        contentType: fileInfo.contentType || normalizeContentType(contentType) || null,
        metadataAvailable: false,
      };
    }

    const seoMetadata = classification.shouldExtractMetadata
      ? extractSeoMetadata(html, finalUrl || url)
      : {};
    const title = classification.shouldExtractMetadata
      ? extractTitle(html, finalUrl || url)
      : (classification.isErrorStatus
        ? (classification.title || classification.fallbackTitle)
        : classification.fallbackTitle);
    const canonicalUrl = classification.shouldExtractMetadata
      ? (normalizeUrl(seoMetadata.canonicalUrl) || extractCanonicalUrl(html, finalUrl || url))
      : null;

    return {
      url,
      finalUrl,
      canonicalUrl,
      title,
      description: getPrimaryDescription(seoMetadata),
      metaTags: getPrimaryMetaTags(seoMetadata),
      seoMetadata,
      authRequired: classification.isAuthStatus,
      httpStatus: status,
      statusCode: status,
      errorStatus: classification.isErrorStatus ? status : null,
      isError: classification.isErrorStatus,
      isInactive: classification.isInactiveStatus,
      httpErrorType: classification.isErrorStatus ? getHttpErrorType(status) : null,
      httpErrorLabel: classification.isErrorStatus ? getHttpErrorLabel(status) : null,
      isViewableError: classification.isViewableError,
      wasRedirect: normalizeUrl(finalUrl || url) !== normalizeUrl(url),
      redirectTarget: normalizeUrl(finalUrl || url) !== normalizeUrl(url) ? finalUrl : null,
      responseTime,
      titleSource: classification.titleSource,
      blockedReason: classification.blockedReason,
      isChallengePage: classification.isChallengePage,
      isBlocked: classification.isBlockedStatus,
      scanStatus: classification.scanStatus,
      metadataAvailable: classification.metadataAvailable,
    };
  };

  reportScanProgress({ phase: 'finalizing' });

  if (scanScope.focused && !targetedGroupCapture && !stopRequested) {
    const ancestorUrls = getFocusedAncestorUrls(seed)
      .map((url) => normalizeUrl(url))
      .filter((url) => url && url !== seed);
    await runWithConcurrency(ancestorUrls, 3, async (ancestorUrl) => {
      if (await pollJobStatus()) return;
      const inspected = await inspectFocusedAncestor(ancestorUrl);
      focusedAncestorMetaByUrl.set(ancestorUrl, inspected);
      scanDiagnostics.focusedAncestorInspectedCount += 1;
    });
  }

  if (scanOptions.brokenLinks && brokenLinkCandidates.length && !stopRequested) {
    await runWithConcurrency(
      brokenLinkCandidates,
      SCAN_BROKEN_LINK_CONCURRENCY,
      async ({ link, sourceUrl }) => {
        if (await pollJobStatus()) return;
        const statusResult = authContext
          ? await checkLinkStatusWithBrowserContext(authContext, link)
          : await checkLinkStatus(link, extraHeaders);
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
    reportScanProgress();
  }

  if (scanScope.focused) {
    focusedCollectionUrls.forEach((url) => {
      const meta = pageMap.get(url);
      if (meta) meta.preserveRouteIdentity = true;
    });
    const seedIdentity = getPageIdentityKey(pageMap.get(seed));
    pageMap.forEach((meta, url) => {
      if (url === seed || focusedDiscoveryHelperUrls.has(url)) return;
      if (
        focusedListingUrls.has(url)
        && seedIdentity
        && getPageIdentityKey(meta) === seedIdentity
      ) {
        focusedDiscoveryHelperUrls.add(url);
        focusedDiscoveryOwnerByUrl.set(
          url,
          getFocusedDiscoveryOwner(focusedListingParentByUrl.get(url) || seed)
        );
      }
    });
    focusedDiscoveryHelperUrls.forEach((helperUrl) => {
      const ownerUrl = getFocusedDiscoveryOwner(helperUrl);
      focusedListingParentByUrl.forEach((parentUrl, childUrl) => {
        if (parentUrl === helperUrl) focusedListingParentByUrl.set(childUrl, ownerUrl);
      });
      focusedListingOrder.delete(helperUrl);
      focusedListingParentByUrl.delete(helperUrl);
      focusedListingUrls.delete(helperUrl);
      focusedContentUrls.delete(helperUrl);
      numberingDiscoveryOrder.delete(helperUrl);
      sitemapNumberingOrder.delete(helperUrl);
      scopedDiscoveredUrls.delete(helperUrl);
      pageMap.delete(helperUrl);
      failedOutcomeUrls.delete(helperUrl);
      blockedOutcomeUrls.delete(helperUrl);
      deferredOutcomeUrls.delete(helperUrl);
    });
  }

  const scannedKeys = new Set();
  pageMap.forEach((meta) => {
    const key = getPageIdentityKey(meta);
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
      title: getFocusedCollectionTitle(meta) || url,
      pageType: url === seed && !scanScope.focused ? PAGE_TYPE_HOME : PAGE_TYPE_PAGE,
      nodeKind: undefined,
      isBlockedBoundary: Boolean(
        scanScope.focused
        && (meta.isBlocked || meta.isChallengePage || meta.scanStatus === 'scan_limited')
      ),
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
      errorStatus: meta.errorStatus ?? null,
      isError: Boolean(meta.isError),
      httpErrorType: meta.httpErrorType || null,
      httpErrorLabel: meta.httpErrorLabel || null,
      isViewableError: Boolean(meta.isViewableError),
      wasRedirect: meta.wasRedirect || false,
      redirectTarget: meta.wasRedirect ? (meta.finalUrl || url) : null,
      responseTime: Number.isFinite(meta.responseTime) ? meta.responseTime : null,
      titleSource: meta.titleSource || 'html',
      blockedReason: meta.blockedReason || null,
      isChallengePage: Boolean(meta.isChallengePage),
      isBlocked: Boolean(meta.isBlocked),
      scanStatus: meta.scanStatus || null,
      metadataAvailable: meta.metadataAvailable !== false,
      repetitiveGroupId: captureUrlSet.has(url) ? repetitiveCapture?.groupId || null : null,
      scanNumber: captureEntryByUrl.get(url)?.scanNumber || undefined,
      isVirtualMissing: false,
      children: [],
    });
  }

  // Clear missing flag for anything actually scanned
  pageMap.forEach((_, url) => {
    const node = nodes.get(url);
    if (node) node.isMissing = false;
  });

  // Structural hierarchy always follows normalized URL paths. Referrers remain
  // discovery/crosslink evidence and never decide parentage.
  const rootUrl = seed;
  const rootHost = new URL(rootUrl).hostname;
  const rootHostNormalized = normalizeHost(rootHost);
  const focusedContextAncestorUrls = new Set(
    scanScope.focused
      ? getFocusedAncestorUrls(seed)
        .map((url) => normalizeUrl(url))
        .filter((url) => url && url !== rootUrl)
      : []
  );
  focusedContextAncestorUrls.forEach((url) => {
    const existing = nodes.get(url);
    if (existing && !focusedAncestorMetaByUrl.has(url)) {
      focusedAncestorMetaByUrl.set(url, existing);
    }
    nodes.delete(url);
  });

  const canonicalKeyFor = (node) => getPageIdentityKey(
    (
      focusedCollectionUrls.has(node?.url)
      || (scanScope.focused && hasStableCollectionQuery(node?.url))
    )
      ? { ...node, preserveRouteIdentity: true }
      : node
  );
  const rootNodeBeforeGrouping = nodes.get(rootUrl);
  const rootRedirectAliasUrl = normalizeUrl(rootNodeBeforeGrouping?.finalUrl);
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

  const focusedContentParentByUrl = new Map();
  if (scanScope.focused) {
    nodes.forEach((node) => {
      if (
        !focusedContentUrls.has(node.url)
        || isWithinFocusedPathAlias(node.url)
      ) {
        return;
      }
      let parentUrl = focusedListingParentByUrl.get(node.url)
        || referrerMap.get(node.url)
        || seed;
      const visitedParents = new Set([node.url]);
      let resolvedParentUrl = null;
      while (parentUrl && !visitedParents.has(parentUrl)) {
        visitedParents.add(parentUrl);
        const normalizedParentUrl = normalizeUrl(parentUrl);
        if (
          normalizedParentUrl
          && nodes.has(normalizedParentUrl)
          && (
            normalizedParentUrl === seed
            || isWithinFocusedPathAlias(normalizedParentUrl)
            || focusedContentUrls.has(normalizedParentUrl)
          )
        ) {
          resolvedParentUrl = normalizedParentUrl;
          break;
        }
        parentUrl = normalizedParentUrl
          ? focusedListingParentByUrl.get(normalizedParentUrl)
            || referrerMap.get(normalizedParentUrl)
          : null;
      }
      parentUrl = resolvedParentUrl || seed;
      node.parentUrl = parentUrl;
      focusedContentParentByUrl.set(node.url, parentUrl);
    });
  }

  const ensureParentChain = (url, { allowFocusedContentAncestors = false } = {}) => {
    let parentUrl = getParentUrl(url);
    while (parentUrl && !nodes.has(parentUrl)) {
      if (focusedContextAncestorUrls.has(parentUrl)) break;
      if (scanScope.focused && !allowUrl(parentUrl) && !allowFocusedContentAncestors) break;
      const canonicalMatch = canonicalToUrl.get(getCanonicalKey(parentUrl));
      if (canonicalMatch) return;
      const isStoppedStructuralContext = partialReason === 'stopped_by_user';
      const isFocusedStructuralContext = scanScope.focused && allowFocusedContentAncestors;
      const isStructuralContext = isFocusedStructuralContext || isStoppedStructuralContext;
      nodes.set(parentUrl, {
        id: safeIdFromUrl(parentUrl),
        url: parentUrl,
        title: getTitleFromUrl(parentUrl),
        parentUrl: getParentUrl(parentUrl),
        referrerUrl: null,
        authRequired: false,
        thumbnailUrl: undefined,
        nodeKind: isFocusedStructuralContext ? 'focus-ghost' : undefined,
        isFocusAncestor: isFocusedStructuralContext,
        isStructuralContext,
        isMissing: !isStructuralContext,
        isVirtualMissing: !isStructuralContext,
        scanStatus: isStructuralContext ? 'structural' : 'missing',
        metadataAvailable: false,
        children: [],
      });
      const key = getCanonicalKey(parentUrl);
      if (key && !canonicalToUrl.has(key)) canonicalToUrl.set(key, parentUrl);
      parentUrl = getParentUrl(parentUrl);
    }
  };

  const shouldSuppressVirtualPlaceholders = entitlementCappedScan
    && pageLimit !== null
    && pageMap.size >= pageLimit;

  for (const node of nodes.values()) {
    if (node.url === rootUrl) continue;
    if (!shouldInferPathParents(node)) continue;
    if (focusedContentParentByUrl.has(node.url)) continue;
    const allowFocusedContentAncestors = scanScope.focused && focusedContentUrls.has(node.url);
    if (shouldSuppressVirtualPlaceholders && !allowFocusedContentAncestors) continue;
    ensureParentChain(node.url, { allowFocusedContentAncestors });
  }

  if (
    rootNodeBeforeGrouping
    && rootRedirectAliasUrl
    && rootRedirectAliasUrl !== rootUrl
    && nodes.has(rootRedirectAliasUrl)
  ) {
    const aliasNode = nodes.get(rootRedirectAliasUrl);
    rootNodeBeforeGrouping.linksIn = Math.max(
      Number(rootNodeBeforeGrouping.linksIn || 0),
      Number(aliasNode?.linksIn || 0)
    );
    rootNodeBeforeGrouping.linksOut = Math.max(
      Number(rootNodeBeforeGrouping.linksOut || 0),
      Number(aliasNode?.linksOut || 0)
    );
    const mergedRootLinks = Array.from(new Set([
      ...(linksByUrl.get(rootUrl) || []),
      ...(linksByUrl.get(rootRedirectAliasUrl) || []),
    ]));
    linksByUrl.set(rootUrl, mergedRootLinks);
    linksByUrl.delete(rootRedirectAliasUrl);
    nodes.forEach((node) => {
      if (normalizeUrl(node.parentUrl) === rootRedirectAliasUrl) node.parentUrl = rootUrl;
    });
    focusedContentParentByUrl.forEach((parentUrl, childUrl) => {
      if (normalizeUrl(parentUrl) === rootRedirectAliasUrl) {
        focusedContentParentByUrl.set(childUrl, rootUrl);
      }
    });
    focusedListingParentByUrl.forEach((parentUrl, childUrl) => {
      if (normalizeUrl(parentUrl) === rootRedirectAliasUrl) {
        focusedListingParentByUrl.set(childUrl, rootUrl);
      }
    });
    canonicalToUrl.forEach((mappedUrl, key) => {
      if (mappedUrl === rootRedirectAliasUrl) canonicalToUrl.set(key, rootUrl);
    });
    const redirectAliasKey = getCanonicalKey(rootRedirectAliasUrl);
    if (redirectAliasKey) canonicalToUrl.set(redirectAliasKey, rootUrl);
    nodes.delete(rootRedirectAliasUrl);
    pageMap.delete(rootRedirectAliasUrl);
    focusedContentUrls.delete(rootRedirectAliasUrl);
    focusedListingUrls.delete(rootRedirectAliasUrl);
    focusedListingOrder.delete(rootRedirectAliasUrl);
    focusedListingParentByUrl.delete(rootRedirectAliasUrl);
    scopedDiscoveredUrls.delete(rootRedirectAliasUrl);
    numberingDiscoveryOrder.delete(rootRedirectAliasUrl);
    sitemapNumberingOrder.delete(rootRedirectAliasUrl);
    sitemapOrder.delete(rootRedirectAliasUrl);
    failedOutcomeUrls.delete(rootRedirectAliasUrl);
    blockedOutcomeUrls.delete(rootRedirectAliasUrl);
    deferredOutcomeUrls.delete(rootRedirectAliasUrl);
    scanDiagnostics.rootRedirectAliasCollapsedCount += 1;
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

  // Ensure path ancestors for visible nodes are also visible (for missing placeholders).
  // Capped scans should spend the visible allowance on captured pages, not generated placeholders.
  Array.from(visiblePrimaryUrls).forEach((url) => {
    const linkedNode = nodes.get(url);
    if (linkedNode && !shouldInferPathParents(linkedNode)) return;
    if (focusedContentParentByUrl.has(url)) return;
    const allowFocusedContentAncestors = scanScope.focused && focusedContentUrls.has(url);
    if (shouldSuppressVirtualPlaceholders && !allowFocusedContentAncestors) return;
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
    const key = normalizeUrl(child.url) || child.id;
    if (!key) return;
    if (parent._childUrls.has(key)) return;
    parent._childUrls.add(key);
    parent.children.push(child);
  };

  const attachVisibleNodeToTree = (node) => {
    if (!node || node.url === rootUrl) return false;
    const parentUrl = node.parentUrl;
    if (parentUrl && nodes.has(parentUrl) && visiblePrimaryUrls.has(parentUrl)) {
      pushUniqueChild(nodes.get(parentUrl), node);
    } else {
      pushUniqueChild(nodes.get(rootUrl), node);
    }
    return true;
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
      if (scanOptions.duplicates || scanOptions.orphanPages) orphanCandidates.push(node);
      continue;
    }

    if (visiblePrimaryUrls.has(node.url)) {
      attachVisibleNodeToTree(node);
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
          isVirtualMissing: sourceNode ? false : true,
          scanStatus: sourceNode?.scanStatus || (sourceNode ? null : 'missing'),
          orphanType: 'orphan',
          children: [],
        });
      }
      parentUrl = getParentUrl(parentUrl);
    }
  };

  if (!shouldSuppressVirtualPlaceholders) {
    Array.from(orphanMap.values()).forEach((node) => {
      if (!shouldInferPathParents(node)) return;
      ensureOrphanParentChain(node.url);
    });
  }

  const orphanNodes = [];
  orphanMap.forEach((node) => {
    const parentUrl = node.parentUrl;
    if (parentUrl && orphanMap.has(parentUrl)) {
      pushUniqueChild(orphanMap.get(parentUrl), node);
    } else {
      orphanNodes.push(node);
    }
  });

  const focusedKnownNumberingParents = new Set();
  if (scanScope.focused) {
    focusedContentUrls.forEach((url) => {
      let parentUrl = focusedContentParentByUrl.get(url)
        || nodes.get(url)?.parentUrl
        || getParentUrl(url);
      const visitedParents = new Set([url]);
      while (parentUrl && parentUrl !== scanScope.siteRootUrl) {
        if (visitedParents.has(parentUrl)) break;
        visitedParents.add(parentUrl);
        focusedKnownNumberingParents.add(parentUrl);
        parentUrl = focusedContentParentByUrl.get(parentUrl)
          || nodes.get(parentUrl)?.parentUrl
          || getParentUrl(parentUrl);
      }
    });
  }
  const preservedNumberingEntries = scanScope.focused
    ? Array.from(numberingDiscoveryOrder.entries())
      .filter(([url]) => (
        focusedAncestorUrlSet.has(url)
        || isWithinFocusedPathAlias(url)
        || scopedDiscoveredUrls.has(url)
        || focusedContentUrls.has(url)
        || focusedListingUrls.has(url)
      ))
      .map(([url, order]) => {
        const isOutOfPathFocusedContent = (
          (focusedContentUrls.has(url) || focusedListingUrls.has(url))
          && !isWithinFocusedPathAlias(url)
        );
        const sitemapSortKey = isOutOfPathFocusedContent
          ? ''
          : sitemapNumberingOrder.get(url) || '';
        return {
          url,
          parentUrl: focusedContentParentByUrl.get(url)
            || nodes.get(url)?.parentUrl
            || undefined,
          order,
          sortKey: sitemapSortKey,
          exact: Boolean(sitemapSortKey),
        };
      })
    : [];
  const preservedNumberMap = scanScope.focused
    ? buildPreservedNumberMap(
      preservedNumberingEntries,
      seed,
      {
        completeParentUrls: Array.from(sitemapCompleteParentUrls),
        knownParentUrls: Array.from(focusedKnownNumberingParents),
      }
    )
    : new Map();
  if (scanScope.focused) {
    nodes.forEach((node) => {
      const scanNumber = preservedNumberMap.get(normalizeUrl(node.url));
      if (scanNumber) node.scanNumber = scanNumber;
    });
  }

  const repetitiveGroups = [];
  if (!targetedGroupCapture) {
    const groupsByVisibleParent = new Map();
    repetitiveGroupsById.forEach((group) => {
      if (!group.active || !group.validated || group.disabled) return;
      const retryableSampleEntries = Array.from(group.captureUrls)
        .filter((url) => {
          const meta = pageMap.get(url);
          return !isSuccessfulCapturedPageMeta(meta) && Number(meta?.httpStatus || 0) === 0;
        })
        .map((url) => ({
          url,
          source: discoverySourceByUrl.get(url) || 'crawl',
          order: numberingDiscoveryOrder.get(url) ?? 0,
        }));
      const deferredEntries = [...group.deferredEntries, ...retryableSampleEntries]
        .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.url === entry.url) === index)
        .filter((entry) => {
          const meta = pageMap.get(entry.url);
          return !meta || Number(meta.httpStatus || 0) === 0;
        })
        .map((entry, index) => ({
          url: entry.url,
          source: entry.source,
          order: entry.order ?? index,
          scanNumber: preservedNumberMap.get(entry.url) || '',
        }));
      const capturedEntries = group.members
        .filter((entry) => isSuccessfulCapturedPageMeta(pageMap.get(entry.url)))
        .map((entry) => ({
          url: entry.url,
          source: entry.source,
          order: numberingDiscoveryOrder.get(entry.url) ?? entry.order ?? 0,
          scanNumber: preservedNumberMap.get(entry.url) || '',
        }));
      if (
        deferredEntries.length === 0
        && capturedEntries.length <= REPETITIVE_GROUP_CAPTURE_LIMIT
      ) return;
      const placeholderParentUrl = normalizeUrl(group.parentUrl);
      const primaryParentNode = (
        placeholderParentUrl
        && nodes.has(placeholderParentUrl)
        && visiblePrimaryUrls.has(placeholderParentUrl)
        && !nodes.get(placeholderParentUrl)?.isDuplicate
      ) ? nodes.get(placeholderParentUrl) : null;
      const subdomainParentNode = (
        placeholderParentUrl
        && subdomainSet.has(placeholderParentUrl)
      ) ? nodes.get(placeholderParentUrl) : null;
      const orphanParentNode = placeholderParentUrl
        ? orphanMap.get(placeholderParentUrl)
        : null;
      const parentNode = primaryParentNode
        || subdomainParentNode
        || orphanParentNode
        || nodes.get(seed);
      if (!parentNode) return;
      const parentKey = normalizeUrl(parentNode.url) || seed;
      const stableGroupId = getStableRepetitiveGroupId(`${parentKey}|visible-parent`);
      if (!groupsByVisibleParent.has(parentKey)) {
        groupsByVisibleParent.set(parentKey, {
          id: stableGroupId,
          key: `${parentKey}|visible-parent`,
          parentNode,
          parentUrl: parentKey,
          shapes: new Set(),
          sourceGroupIds: [],
          capturedEntries: [],
          entries: [],
        });
      }
      const combined = groupsByVisibleParent.get(parentKey);
      combined.shapes.add(group.shape);
      combined.sourceGroupIds.push(group.groupId);
      combined.capturedEntries.push(...capturedEntries);
      combined.entries.push(...deferredEntries);
    });

    groupsByVisibleParent.forEach((combined) => {
      const compareCombinedEntries = (left, right) => (
        compareScanNumberStrings(left.scanNumber, right.scanNumber)
        || Number(left.order || 0) - Number(right.order || 0)
        || compareNaturalScanUrls(left.url, right.url)
      );
      const directChildUrls = new Set((combined.parentNode.children || [])
        .map((child) => normalizeUrl(child?.url))
        .filter(Boolean));
      const capturedEntries = combined.capturedEntries
        .sort(compareCombinedEntries)
        .filter((entry, index, entries) => (
          entries.findIndex((candidate) => candidate.url === entry.url) === index
        ))
        .filter((entry) => directChildUrls.has(normalizeUrl(entry.url)));
      const requiredCapturedEntries = capturedEntries.filter((entry) => (
        (nodes.get(entry.url)?.children || []).length > 0
      ));
      const retainedCapturedUrls = new Set(
        requiredCapturedEntries
          .slice(0, REPETITIVE_GROUP_CAPTURE_LIMIT)
          .map((entry) => entry.url)
      );
      capturedEntries.forEach((entry) => {
        if (retainedCapturedUrls.size >= REPETITIVE_GROUP_CAPTURE_LIMIT) return;
        retainedCapturedUrls.add(entry.url);
      });
      const overflowEntries = capturedEntries.filter((entry) => !retainedCapturedUrls.has(entry.url));
      if (overflowEntries.length > 0) {
        const overflowUrls = new Set(overflowEntries.map((entry) => normalizeUrl(entry.url)));
        combined.parentNode.children = (combined.parentNode.children || []).filter((child) => (
          !overflowUrls.has(normalizeUrl(child?.url))
        ));
        overflowEntries.forEach((entry) => {
          nodes.delete(entry.url);
          pageMap.delete(entry.url);
          visiblePrimaryUrls.delete(entry.url);
          deferredOutcomeUrls.add(entry.url);
        });
      }
      const deferredEntries = [...combined.entries, ...overflowEntries]
        .sort(compareCombinedEntries)
        .filter((entry, index, entries) => (
          entries.findIndex((candidate) => candidate.url === entry.url) === index
        ));
      if (deferredEntries.length === 0) return;
      deferredEntries.forEach((entry) => deferredOutcomeUrls.add(entry.url));
      const capturedCount = capturedEntries.length - overflowEntries.length;
      const summary = {
        id: combined.id,
        key: combined.key,
        parentUrl: combined.parentUrl,
        shape: combined.shapes.size === 1 ? Array.from(combined.shapes)[0] : 'mixed',
        sourceGroupIds: combined.sourceGroupIds,
        capturedCount,
        deferredCount: deferredEntries.length,
        totalCount: capturedCount + deferredEntries.length,
        entries: deferredEntries,
      };
      repetitiveGroups.push(summary);
      pushUniqueChild(combined.parentNode, {
        id: `placeholder_${combined.id}`,
        url: '',
        title: `${deferredEntries.length} more pages like this`,
        nodeKind: 'deferred-group',
        deferredGroupId: combined.id,
        deferredGroupKey: combined.key,
        parentUrl: combined.parentUrl,
        capturedCount,
        remainingCount: deferredEntries.length,
        totalCount: capturedCount + deferredEntries.length,
        deferredEntries,
        children: [],
      });
    });
  }

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
  const compareScanNumbers = (a, b) => (
    compareScanNumberStrings(a?.scanNumber, b?.scanNumber)
  );

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
      if (a?.nodeKind === 'deferred-group' && b?.nodeKind !== 'deferred-group') return 1;
      if (a?.nodeKind !== 'deferred-group' && b?.nodeKind === 'deferred-group') return -1;
      const scanNumberDifference = compareScanNumbers(a, b);
      if (scanNumberDifference !== 0) return scanNumberDifference;
      const sa = getSitemapIndex(a);
      const sb = getSitemapIndex(b);
      if (sa !== undefined && sb !== undefined && sa !== sb) return sa - sb;
      if (sa !== undefined && sb === undefined) return -1;
      if (sa === undefined && sb !== undefined) return 1;
      return compareByStats(a, b);
    });
    node.children.forEach((child) => sortTree(child, depth + 1));
  };

  const enforceFinalSiblingLimit = (node) => {
    if (!node?.children?.length) return;
    const existingPlaceholder = node.children.find((child) => child?.nodeKind === 'deferred-group') || null;
    const visibleChildren = node.children.filter((child) => child?.nodeKind !== 'deferred-group');
    if (visibleChildren.length > REPETITIVE_GROUP_CAPTURE_LIMIT) {
      const retainedKeys = new Set();
      visibleChildren
        .filter((child) => (child?.children || []).length > 0)
        .slice(0, REPETITIVE_GROUP_CAPTURE_LIMIT)
        .forEach((child) => retainedKeys.add(normalizeUrl(child?.url) || child?.id));
      visibleChildren.forEach((child) => {
        if (retainedKeys.size >= REPETITIVE_GROUP_CAPTURE_LIMIT) return;
        retainedKeys.add(normalizeUrl(child?.url) || child?.id);
      });

      const retainedChildren = visibleChildren.filter((child) => (
        retainedKeys.has(normalizeUrl(child?.url) || child?.id)
      ));
      const overflowChildren = visibleChildren.filter((child) => (
        !retainedKeys.has(normalizeUrl(child?.url) || child?.id)
      ));
      const overflowEntries = [];
      const collectOverflowEntries = (child) => {
        if (!child || child.nodeKind === 'deferred-group') return;
        const url = normalizeUrl(child.url);
        if (url) {
          overflowEntries.push({
            url,
            source: discoverySourceByUrl.get(url) || 'final_tree',
            order: numberingDiscoveryOrder.get(url) ?? overflowEntries.length,
            scanNumber: child.scanNumber || preservedNumberMap.get(url) || '',
          });
        }
        (child.children || []).forEach(collectOverflowEntries);
      };
      overflowChildren.forEach(collectOverflowEntries);

      const parentUrl = normalizeUrl(node.url) || seed;
      const groupId = existingPlaceholder?.deferredGroupId
        || getStableRepetitiveGroupId(`${parentUrl}|visible-parent`);
      const deferredEntries = [
        ...(existingPlaceholder?.deferredEntries || []),
        ...overflowEntries,
      ].filter((entry, index, entries) => (
        entry?.url
        && entries.findIndex((candidate) => candidate?.url === entry.url) === index
      ));
      const capturedCount = retainedChildren.length;
      const placeholder = {
        ...(existingPlaceholder || {}),
        id: existingPlaceholder?.id || `placeholder_${groupId}`,
        url: '',
        title: `${deferredEntries.length} more pages like this`,
        nodeKind: 'deferred-group',
        deferredGroupId: groupId,
        deferredGroupKey: existingPlaceholder?.deferredGroupKey || `${parentUrl}|visible-parent`,
        parentUrl,
        capturedCount,
        remainingCount: deferredEntries.length,
        totalCount: capturedCount + deferredEntries.length,
        deferredEntries,
        children: [],
      };
      node.children = [...retainedChildren, placeholder];

      overflowEntries.forEach((entry) => {
        nodes.delete(entry.url);
        pageMap.delete(entry.url);
        visiblePrimaryUrls.delete(entry.url);
        deferredOutcomeUrls.add(entry.url);
      });

      const existingSummary = repetitiveGroups.find((group) => group.id === groupId);
      if (existingSummary) {
        existingSummary.capturedCount = capturedCount;
        existingSummary.deferredCount = deferredEntries.length;
        existingSummary.totalCount = capturedCount + deferredEntries.length;
        existingSummary.entries = deferredEntries;
      } else {
        repetitiveGroups.push({
          id: groupId,
          key: `${parentUrl}|visible-parent`,
          parentUrl,
          shape: 'mixed',
          sourceGroupIds: [],
          capturedCount,
          deferredCount: deferredEntries.length,
          totalCount: capturedCount + deferredEntries.length,
          entries: deferredEntries,
        });
      }
    }
    node.children
      .filter((child) => child?.nodeKind !== 'deferred-group')
      .forEach(enforceFinalSiblingLimit);
  };

  let root = nodes.get(rootUrl);
  if (root && (!root.children || root.children.length === 0) && pageMap.size > 1) {
    let repairedCount = 0;
    nodes.forEach((node) => {
      if (!node?.url || node.url === rootUrl) return;
      if (node.isMissing || node.isDuplicate) return;
      if (!pageMap.has(node.url)) return;
      const nodeHost = normalizeHost(new URL(node.url).hostname);
      if (nodeHost !== rootHostNormalized) return;
      pushUniqueChild(root, node);
      repairedCount += 1;
    });
    if (repairedCount > 0) {
      scanDiagnostics.treeRepairApplied = true;
      scanDiagnostics.treeRepairAdded = repairedCount;
    }
  }
  computeStats(root);
  subdomainNodes.forEach(computeStats);
  orphanNodes.forEach(computeStats);
  sortTree(root);
  subdomainNodes.forEach((node) => sortTree(node, 0));
  orphanNodes.forEach((node) => sortTree(node, 0));
  enforceFinalSiblingLimit(root);
  subdomainNodes.forEach(enforceFinalSiblingLimit);
  orphanNodes.forEach(enforceFinalSiblingLimit);
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
      node.isVirtualMissing = false;
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
        node.isVirtualMissing = false;
      } else if (key && (sitemapKeys.has(key) || scannedKeys.has(key))) {
        node.isMissing = false;
        node.isVirtualMissing = false;
      }
    }
    node.children?.forEach(clearMissingIfKnown);
  };

  if (root) clearMissingIfKnown(root);
  prunedOrphanNodes.forEach(clearMissingIfKnown);
  subdomainNodes.forEach(clearMissingIfKnown);

  const capturedTreeNodeCount = countScanTreeNodes(root);
  if (scanScope.focused && root) {
    const ancestorUrls = getFocusedAncestorUrls(seed)
      .filter((url) => normalizeUrl(url) !== seed);
    let focusedTree = root;
    for (let index = ancestorUrls.length - 1; index >= 0; index -= 1) {
      const ancestorUrl = normalizeUrl(ancestorUrls[index]);
      if (!ancestorUrl) continue;
      const inspectedMeta = focusedAncestorMetaByUrl.get(ancestorUrl) || {};
      const isSiteRoot = ancestorUrl === scanScope.siteRootUrl;
      const contextStatus = Number(inspectedMeta.httpStatus || 0);
      const isResolvedPage = contextStatus >= 200 && contextStatus < 400;
      const isAuthenticationPage = Boolean(inspectedMeta.authRequired);
      const isMissingContext = contextStatus === 404 || contextStatus === 410;
      const isUnresolvedContext = contextStatus === 0;
      const shouldExposePageStatus = isResolvedPage || isAuthenticationPage;
      const inspectedFinalUrl = normalizeUrl(inspectedMeta.finalUrl);
      const collapseRedirectAliasChild = Boolean(
        inspectedFinalUrl
        && inspectedFinalUrl !== ancestorUrl
        && inspectedFinalUrl === normalizeUrl(focusedTree.url)
      );
      const focusedChildren = collapseRedirectAliasChild
        ? (focusedTree.children || [])
        : [focusedTree];
      if (collapseRedirectAliasChild) {
        scanDiagnostics.rootRedirectAliasCollapsedCount += 1;
      }
      focusedTree = {
        id: safeIdFromUrl(`focus:${ancestorUrl}`),
        url: ancestorUrl,
        finalUrl: inspectedMeta.finalUrl || ancestorUrl,
        canonicalUrl: inspectedMeta.canonicalUrl || null,
        title: (shouldExposePageStatus && inspectedMeta.title)
          || (isSiteRoot ? new URL(ancestorUrl).hostname : getTitleFromUrl(ancestorUrl)),
        pageType: isSiteRoot ? PAGE_TYPE_HOME : PAGE_TYPE_PAGE,
        description: inspectedMeta.description || '',
        metaTags: inspectedMeta.metaTags || '',
        seoMetadata: inspectedMeta.seoMetadata || {},
        nodeKind: isUnresolvedContext ? 'focus-ghost' : undefined,
        isFocusAncestor: isUnresolvedContext,
        isStructuralContext: true,
        isBlockedBoundary: false,
        scanNumber: preservedNumberMap.get(ancestorUrl) || (isSiteRoot ? '0' : ''),
        parentUrl: getParentUrl(ancestorUrl),
        authRequired: isAuthenticationPage,
        contextHttpStatus: inspectedMeta.httpStatus ?? null,
        httpStatus: shouldExposePageStatus ? inspectedMeta.httpStatus ?? null : null,
        statusCode: shouldExposePageStatus
          ? inspectedMeta.statusCode ?? inspectedMeta.httpStatus ?? null
          : null,
        errorStatus: shouldExposePageStatus ? inspectedMeta.errorStatus ?? null : null,
        isError: shouldExposePageStatus && Boolean(inspectedMeta.isError),
        isInactive: false,
        isFile: shouldExposePageStatus && Boolean(inspectedMeta.isFile),
        fileType: shouldExposePageStatus ? inspectedMeta.fileType || null : null,
        httpErrorType: shouldExposePageStatus ? inspectedMeta.httpErrorType || null : null,
        httpErrorLabel: shouldExposePageStatus ? inspectedMeta.httpErrorLabel || null : null,
        isViewableError: shouldExposePageStatus && Boolean(inspectedMeta.isViewableError),
        wasRedirect: shouldExposePageStatus && Boolean(inspectedMeta.wasRedirect),
        redirectTarget: shouldExposePageStatus ? inspectedMeta.redirectTarget || null : null,
        responseTime: shouldExposePageStatus && Number.isFinite(inspectedMeta.responseTime)
          ? inspectedMeta.responseTime
          : null,
        titleSource: shouldExposePageStatus ? inspectedMeta.titleSource || 'html' : 'url_fallback',
        blockedReason: isAuthenticationPage ? inspectedMeta.blockedReason || 'authentication_required' : null,
        isChallengePage: false,
        isBlocked: false,
        isMissing: isMissingContext,
        isVirtualMissing: isMissingContext,
        scanStatus: isAuthenticationPage
          ? 'auth'
          : isMissingContext
            ? 'missing'
            : isResolvedPage
              ? inspectedMeta.scanStatus || null
              : 'structural',
        metadataAvailable: shouldExposePageStatus ? inspectedMeta.metadataAvailable !== false : false,
        children: focusedChildren,
      };
    }
    root = focusedTree;
  }

  const annotateImageCaptureEligibility = (node) => {
    if (!node || typeof node !== 'object') return;
    const eligibility = getImageCaptureEligibility(node);
    node.captureEligible = eligibility.eligible;
    node.captureReasonCode = eligibility.code || '';
    node.captureReason = eligibility.reason || '';
    node.children?.forEach(annotateImageCaptureEligibility);
  };
  annotateImageCaptureEligibility(root);
  prunedOrphanNodes.forEach(annotateImageCaptureEligibility);
  subdomainNodes.forEach(annotateImageCaptureEligibility);

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

  scanDiagnostics.visitedCount = visited.size;
  scanDiagnostics.pageMapCount = pageMap.size;
  scanDiagnostics.queueRemaining = Math.max(0, queue.length - queueIndex);
  scanDiagnostics.rootChildCount = root?.children?.length || 0;
  scanDiagnostics.treeNodeCount = countScanTreeNodes(root);
  scanDiagnostics.capturedTreeNodeCount = capturedTreeNodeCount;
  scanDiagnostics.numberingDiscoveredPageCount = numberingDiscoveryOrder.size;
  scanDiagnostics.focusedNumberingEntryCount = scanScope.focused
    ? numberingDiscoveryOrder.size
    : 0;
  scanDiagnostics.scopedDiscoveredPageCount = scopedDiscoveredUrls.size;
  scanDiagnostics.repetitiveGroups = repetitiveGroups.length;
  scanDiagnostics.repetitiveDeferredPages = repetitiveGroups.reduce(
    (sum, group) => sum + group.deferredCount,
    0
  );

  const buildDiscoveryManifest = () => {
    const hiddenEntries = [];
    const seenHiddenUrls = new Set();
    let hiddenPageCount = 0;
    for (let index = queueIndex; index < queue.length; index += 1) {
      const item = queue[index];
      const normalized = normalizeUrl(item?.url);
      if (!normalized || seenHiddenUrls.has(normalized) || pageMap.has(normalized)) continue;
      if (focusedDiscoveryHelperUrls.has(normalized)) continue;
      if (!allowPageUrl(normalized)) continue;
      seenHiddenUrls.add(normalized);
      hiddenPageCount += 1;
      if (hiddenEntries.length >= SCAN_DISCOVERY_MANIFEST_ENTRY_LIMIT) continue;
      const rawParentUrl = referrerMap.get(normalized) || getParentUrl(normalized) || seed;
      const parentUrl = normalizeUrl(rawParentUrl);
      hiddenEntries.push({
        url: normalized,
        parentUrl: parentUrl && parentUrl !== normalized ? parentUrl : seed,
        source: String(item.source || discoverySourceByUrl.get(normalized) || 'crawl').slice(0, 80),
        depth: Math.max(0, Math.floor(Number(item.depth || 0) || 0)),
        order: index,
      });
    }
    const estimatedHiddenPageCount = scanScope.focused
      ? hiddenPageCount
      : Math.max(
        hiddenPageCount,
        scanDiagnostics.queueRemaining,
        Math.max(0, scanDiagnostics.queuedCount - scanDiagnostics.visitedCount)
      );
    if (estimatedHiddenPageCount <= 0) return null;
    return {
      version: 1,
      seedUrl: seed,
      capturedPageCount: pageMap.size,
      totalDiscoveredPageCount: scanScope.focused
        ? pageMap.size + estimatedHiddenPageCount
        : Math.max(
          scanDiagnostics.queuedCount,
          scanDiagnostics.visitedCount + estimatedHiddenPageCount
        ),
      hiddenPageCount: estimatedHiddenPageCount,
      storedHiddenPageCount: hiddenEntries.length,
      truncated: hiddenEntries.length < estimatedHiddenPageCount,
      maxStoredEntries: SCAN_DISCOVERY_MANIFEST_ENTRY_LIMIT,
      entries: hiddenEntries,
    };
  };
  const discoveryManifest = buildDiscoveryManifest();
  if (discoveryManifest) {
    scanDiagnostics.discoveryManifest = {
      version: discoveryManifest.version,
      capturedPageCount: discoveryManifest.capturedPageCount,
      totalDiscoveredPageCount: discoveryManifest.totalDiscoveredPageCount,
      hiddenPageCount: discoveryManifest.hiddenPageCount,
      storedHiddenPageCount: discoveryManifest.storedHiddenPageCount,
      truncated: discoveryManifest.truncated,
      maxStoredEntries: discoveryManifest.maxStoredEntries,
    };
  }

  const canOverrideRootOnlyPartialReason = (reason) => (
    !reason || reason === 'stopped_by_user' || reason === 'entitlement_cap'
  );
  const hasRootOnlyCollapseSignal = scanDiagnostics.rootAllowedLinks > 0
    || scanDiagnostics.sitemapUrlsQueued > 0
    || scanDiagnostics.commonPathActive > 0
    || scanDiagnostics.renderedLinksQueued > 0
    || scanDiagnostics.queueRemaining > 0
    || pageMap.size > 1;
  if (!targetedGroupCapture && canOverrideRootOnlyPartialReason(partialReason) && capturedTreeNodeCount <= 1 && hasRootOnlyCollapseSignal) {
    const previousPartialReason = partialReason;
    partialReason = 'scan_collapsed';
    const reasons = [];
    if (scanDiagnostics.rootAllowedLinks > 0) reasons.push('root_links_found');
    if (scanDiagnostics.sitemapUrlsQueued > 0) reasons.push('sitemap_urls_queued');
    if (scanDiagnostics.commonPathActive > 0) reasons.push('common_paths_active');
    if (scanDiagnostics.renderedLinksQueued > 0) reasons.push('rendered_links_queued');
    if (scanDiagnostics.queueRemaining > 0) reasons.push('queue_had_discovered_pages');
    if (pageMap.size > 1) reasons.push('page_map_has_pages');
    scanDiagnostics.collapseReason = reasons.join(',') || 'root_only_with_discovery_signals';
    if (previousPartialReason && previousPartialReason !== partialReason) {
      scanDiagnostics.previousPartialReason = previousPartialReason;
    }
    console.warn('[scan] Root-only scan collapse detected:', {
      seed,
      collapseReason: scanDiagnostics.collapseReason,
      treeNodeCount: scanDiagnostics.treeNodeCount,
      pageMapCount: scanDiagnostics.pageMapCount,
      rootAllowedLinks: scanDiagnostics.rootAllowedLinks,
      sitemapUrlsQueued: scanDiagnostics.sitemapUrlsQueued,
      renderedLinksQueued: scanDiagnostics.renderedLinksQueued,
    });
  }
  const getRootOnlyFailureReason = () => {
    if (scanDiagnostics.rootBlockedReason) return scanDiagnostics.rootBlockedReason;
    if (scanDiagnostics.rootClassification === 'auth') return 'auth_required';
    if (scanDiagnostics.rootClassification === 'scan_limited') return 'scan_limited';
    if (scanDiagnostics.rootClassification === 'inactive') return 'fetch_failed';
    if (scanDiagnostics.fetchedPageCount === 0 && scanDiagnostics.failedFetches > 0) return 'fetch_failed';
    return null;
  };
  const rootOnlyFailureReason = capturedTreeNodeCount <= 1
    ? getRootOnlyFailureReason()
    : null;
  if (!targetedGroupCapture && canOverrideRootOnlyPartialReason(partialReason) && rootOnlyFailureReason) {
    const previousPartialReason = partialReason;
    partialReason = 'root_discovery_failed';
    scanDiagnostics.collapseReason = rootOnlyFailureReason;
    if (previousPartialReason && previousPartialReason !== partialReason) {
      scanDiagnostics.previousPartialReason = previousPartialReason;
    }
    console.warn('[scan] Root discovery failed because the root page was not crawlable:', {
      seed,
      collapseReason: scanDiagnostics.collapseReason,
      rootStatus: scanDiagnostics.rootStatus,
      rootClassification: scanDiagnostics.rootClassification,
      treeNodeCount: scanDiagnostics.treeNodeCount,
      pageMapCount: scanDiagnostics.pageMapCount,
    });
  }
  const hasDiscoveryFailureSignal = (
    scanDiagnostics.sitemapFetchFailures > 0
    && (scanDiagnostics.robotsSitemapUrlsFound > 0 || scanDiagnostics.sitemapUrlsQueued > 0)
  ) || (
    Boolean(scanDiagnostics.renderedDiscoveryError)
    && (
      scanDiagnostics.rootAllowedLinks > 0
      || scanDiagnostics.sitemapUrlsFound > 0
      || scanDiagnostics.robotsSitemapUrlsFound > 0
    )
  );
  if (!targetedGroupCapture && canOverrideRootOnlyPartialReason(partialReason) && capturedTreeNodeCount <= 1 && hasDiscoveryFailureSignal) {
    const previousPartialReason = partialReason;
    partialReason = 'root_discovery_failed';
    scanDiagnostics.collapseReason = [
      scanDiagnostics.sitemapFetchFailures > 0 ? 'sitemap_fetch_failed' : null,
      scanDiagnostics.robotsFetchFailed ? 'robots_fetch_failed' : null,
      scanDiagnostics.renderedDiscoveryError ? 'rendered_discovery_failed' : null,
    ].filter(Boolean).join(',') || 'root_discovery_failed';
    if (previousPartialReason && previousPartialReason !== partialReason) {
      scanDiagnostics.previousPartialReason = previousPartialReason;
    }
    console.warn('[scan] Root discovery failed with one-node result:', {
      seed,
      collapseReason: scanDiagnostics.collapseReason,
      treeNodeCount: scanDiagnostics.treeNodeCount,
      pageMapCount: scanDiagnostics.pageMapCount,
    });
  }

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
    const iaSummary = await persistPagesForIa(nodes, scanScope, discoverySourceByUrl, linksInCounts);
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

  scopedDiscoveredUrls.forEach((url) => {
    if (!visited.has(url)) deferredOutcomeUrls.add(url);
  });
  finalProgressSummary = getProgressSummary([root, ...prunedOrphanNodes, ...subdomainNodes]);
  reportScanProgress({ final: true });

  const includePartialOrphans = Boolean(partialReason);
  const capturedPageCount = countPageMapValues(isSuccessfulCapturedPageMeta);
  const totalDiscoveredPageCount = Math.max(
    capturedPageCount + deferredOutcomeUrls.size,
    Number(discoveryManifest?.totalDiscoveredPageCount || 0) || 0
  );
  const pageCountSummary = {
    capturedPageCount,
    deferredPageCount: deferredOutcomeUrls.size,
    estimatedRemainingPageCount: Math.max(0, totalDiscoveredPageCount - capturedPageCount),
    totalDiscoveredPageCount,
  };
  const captureSummary = targetedGroupCapture
    ? (() => {
      const successfulEntries = repetitiveCapture.entries.filter((entry) => {
        return isSuccessfulCapturedPageMeta(pageMap.get(entry.url));
      });
      const successfulUrlSet = new Set(successfulEntries.map((entry) => entry.url));
      const terminalEntries = repetitiveCapture.entries
        .filter((entry) => !successfulUrlSet.has(entry.url))
        .map((entry) => {
          const meta = pageMap.get(entry.url);
          if (!meta) return null;
          const status = Number(meta.httpStatus || 0);
          const terminal = (
            status >= 400
            || status === 0
            || meta.metadataAvailable === false
            || meta.isBlocked
            || meta.isChallengePage
            || meta.isInactive
          );
          if (!terminal) return null;
          return {
            ...entry,
            status: status || null,
            reason: meta.authRequired
              ? 'authentication'
              : (
                meta.isBlocked || meta.isChallengePage
                  ? 'blocked'
                  : (status >= 400 ? 'http_error' : 'unreachable')
              ),
          };
        })
        .filter(Boolean);
      const terminalUrlSet = new Set(terminalEntries.map((entry) => entry.url));
      return {
        groupId: repetitiveCapture.groupId,
        requestedCount: repetitiveCapture.entries.length,
        capturedCount: successfulEntries.length,
        successfulEntries,
        terminalCount: terminalEntries.length,
        terminalEntries,
        remainingEntries: repetitiveCapture.entries.filter((entry) => (
          !successfulUrlSet.has(entry.url) && !terminalUrlSet.has(entry.url)
        )),
      };
    })()
    : null;
  const blockedSections = Array.from(pageMap.values())
    .filter((meta) => (
      meta?.isBlocked
      || meta?.isChallengePage
      || meta?.scanStatus === 'scan_limited'
    ))
    .map((meta) => ({
      url: normalizeUrl(meta.url || meta.finalUrl),
      status: Number(meta.httpStatus || 0) || null,
      reason: meta.blockedReason || meta.scanStatus || 'blocked',
    }))
    .filter((entry) => entry.url);
  if (
    blockedSections.length > 0
    && !targetedGroupCapture
    && partialReason !== 'stopped_by_user'
    && partialReason !== 'entitlement_cap'
    && partialReason !== 'root_discovery_failed'
  ) {
    partialReason = 'blocked_sections';
  }

  const result = {
    root,
    orphans: (scanOptions.orphanPages || scanOptions.duplicates || includePartialOrphans) ? prunedOrphanNodes : [],
    subdomains: scanOptions.subdomains ? subdomainNodes : [],
    errors: scanOptions.errorPages ? errors : [],
    inactivePages: scanOptions.inactivePages ? inactivePages : [],
    brokenLinks: scanOptions.brokenLinks ? brokenLinks : [],
    files: scanOptions.files ? Array.from(filesByUrl.values()) : [],
    scanScope: {
      seed,
      baseHost: scanScope.baseHost,
      rootDomain: scanScope.rootDomain,
      allowSubdomains: scanScope.allowSubdomains,
      exactOnly: scanScope.exactOnly,
      focused: scanScope.focused,
      focusPath: scanScope.focusPath,
      focusDepth: scanScope.focusDepth,
      siteRootUrl: scanScope.siteRootUrl,
    },
    scanOptions,
    scanDiagnostics,
    discoveryManifest,
    pageCountSummary,
    repetitiveGroups,
    blockedSections,
    ...(captureSummary ? { captureSummary } : {}),
    crosslinks,
  };

  if (partialReason) {
    result.partial = true;
    result.partialReason = partialReason;
  }
  if (captureSummary?.remainingEntries?.length) {
    result.partial = true;
    result.partialReason = 'deferred_capture_incomplete';
  }

  if (authContext) {
    await authContext.close().catch(() => {});
  }
  await Promise.all(
    Array.from(crawlBrowserContextsByHost.values()).map((context) => context.close().catch(() => {}))
  );

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

function escapeScreenshotHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getBrowserNavigationErrorCode(error) {
  const message = String(error?.message || error || '');
  const netMatch = message.match(/net::(ERR_[A-Z0-9_]+)/i);
  if (netMatch) return netMatch[1].toUpperCase();
  const nodeMatch = message.match(/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b/i);
  if (nodeMatch) return nodeMatch[1].toUpperCase();
  return '';
}

function isCapturableBrowserNavigationError(error) {
  const code = getBrowserNavigationErrorCode(error);
  return Boolean(code && (
    code.includes('NAME_NOT_RESOLVED')
    || code === 'ENOTFOUND'
    || code === 'EAI_AGAIN'
    || code.includes('CONNECTION_REFUSED')
    || code === 'ECONNREFUSED'
    || code.includes('ADDRESS_UNREACHABLE')
    || code.includes('INTERNET_DISCONNECTED')
    || code.includes('CONNECTION_RESET')
    || code === 'ECONNRESET'
    || code.includes('CONNECTION_TIMED_OUT')
    || code === 'ETIMEDOUT'
  ));
}

function buildBrowserErrorCaptureHtml(safeUrl, error) {
  let host = safeUrl;
  try {
    host = new URL(safeUrl).hostname;
  } catch {
    // Keep the original URL as the host label.
  }
  const code = getBrowserNavigationErrorCode(error) || 'ERR_FAILED';
  const safeHost = escapeScreenshotHtml(host);
  const safeCode = escapeScreenshotHtml(code);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>This site can't be reached</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        background: #fff;
        color: #3c4043;
        font-family: Arial, sans-serif;
      }
      main {
        margin-left: 22%;
        margin-top: 22vh;
        max-width: 620px;
      }
      .icon {
        width: 48px;
        height: 58px;
        margin-bottom: 32px;
        border: 4px solid #5f6368;
        border-radius: 2px;
        position: relative;
        box-sizing: border-box;
      }
      .icon::before {
        content: "";
        position: absolute;
        right: -4px;
        top: -4px;
        width: 18px;
        height: 18px;
        background: #fff;
        border-left: 4px solid #5f6368;
        border-bottom: 4px solid #5f6368;
      }
      .icon::after {
        content: ":(";
        position: absolute;
        left: 8px;
        bottom: 6px;
        color: #5f6368;
        font-size: 20px;
        font-weight: 700;
      }
      h1 {
        margin: 0 0 18px;
        color: #202124;
        font-size: 32px;
        font-weight: 500;
      }
      p {
        margin: 0 0 18px;
        font-size: 17px;
        line-height: 1.5;
      }
      .code {
        color: #5f6368;
        font-size: 15px;
        letter-spacing: .01em;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="icon" aria-hidden="true"></div>
      <h1>This site can't be reached</h1>
      <p>Check if there is a typo in ${safeHost}.</p>
      <p class="code">${safeCode}</p>
    </main>
  </body>
</html>`;
}

async function captureScreenshotInWorkspace(
  safeUrl,
  type = SCREENSHOT_TYPES.full,
  options = {},
  workspaceDirectory = SCREENSHOT_DIR
) {
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
  const filepath = path.join(workspaceDirectory, filename);
  const thumbPreviewPath = path.join(workspaceDirectory, thumbPreviewFilename);
  const thumbSmallPath = path.join(workspaceDirectory, thumbSmallFilename);
  const fullSmallPath = path.join(workspaceDirectory, fullSmallFilename);
  const fullViewportTempPath = path.join(workspaceDirectory, fullViewportTempFilename);
  const primaryPath = normalizedType === SCREENSHOT_TYPES.thumb ? thumbSmallPath : filepath;
  const metaPath = path.join(workspaceDirectory, `${path.basename(primaryPath)}${SCREENSHOT_META_SUFFIX}`);
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
      ...(options?.storageState ? { storageState: options.storageState } : {}),
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
      const defaultCaptureTimeoutMs = normalizedType === SCREENSHOT_TYPES.thumb
        ? SCREENSHOT_THUMB_CAPTURE_TIMEOUT_MS
        : SCREENSHOT_CAPTURE_TIMEOUT_MS;
      const requestedCaptureTimeoutMs = Number(options?.captureTimeoutMs);
      const captureTimeoutMs = Math.max(
        5000,
        Number.isFinite(requestedCaptureTimeoutMs)
          ? requestedCaptureTimeoutMs
          : defaultCaptureTimeoutMs
      );
      const requestedSettleTimeoutMs = Number(options?.networkSettleTimeoutMs);
      const networkSettleTimeoutMs = Math.max(
        250,
        Number.isFinite(requestedSettleTimeoutMs)
          ? requestedSettleTimeoutMs
          : SCREENSHOT_NETWORK_SETTLE_TIMEOUT_MS
      );
      page.setDefaultTimeout(captureTimeoutMs);
      page.setDefaultNavigationTimeout(captureTimeoutMs);
      const maxAttempts = 1;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const captureStartedAt = Date.now();
        try {
          throwIfAborted();
          try {
            await page.goto(safeUrl, {
              waitUntil: 'domcontentloaded',
              timeout: captureTimeoutMs,
            });
          } catch (navigationError) {
            if (!isCapturableBrowserNavigationError(navigationError)) {
              throw navigationError;
            }
            await page.goto('about:blank', {
              waitUntil: 'domcontentloaded',
              timeout: Math.min(captureTimeoutMs, 3000),
            }).catch(() => {});
            await page.setContent(buildBrowserErrorCaptureHtml(safeUrl, navigationError), {
              waitUntil: 'domcontentloaded',
              timeout: Math.min(captureTimeoutMs, 3000),
            });
          }
          throwIfAborted();
          await page.waitForTimeout(normalizedType === SCREENSHOT_TYPES.thumb ? 450 : 650);
          await dismissScreenshotObstructions(page);
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
            timeout: normalizedType === SCREENSHOT_TYPES.full
              ? networkSettleTimeoutMs
              : Math.max(2500, networkSettleTimeoutMs),
          }).catch(() => {});
          if (normalizedType === SCREENSHOT_TYPES.thumb) {
            await page.waitForLoadState('networkidle', { timeout: networkSettleTimeoutMs }).catch(() => {});
          }
          await page.waitForTimeout(normalizedType === SCREENSHOT_TYPES.thumb ? 250 : 150);
          await dismissScreenshotObstructions(page, { settleMs: 100 });
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

async function captureScreenshot(safeUrl, type = SCREENSHOT_TYPES.full, options = {}) {
  let workspace = null;
  try {
    workspace = await createScreenshotWorkspace({
      provider: getScreenshotStorageProvider(),
      localDirectory: SCREENSHOT_DIR,
    });
    return await captureScreenshotInWorkspace(
      safeUrl,
      type,
      options,
      workspace.directory
    );
  } catch (error) {
    throw normalizeScreenshotStorageError(error);
  } finally {
    if (workspace?.transient) {
      await removeScreenshotWorkspace(workspace).catch((error) => {
        console.warn('Screenshot workspace cleanup error:', error.message);
      });
    }
  }
}

async function processJob(job) {
  const jobId = job.id;
  if (activeJobIds.has(jobId)) return;
  activeJobIds.add(jobId);
  const jobType = normalizeBackgroundJobType(job.type);
  const payload = parseJsonSafe(job.payload) || {};
  try {
    if (jobType === JOB_TYPES.scan) {
      if (job.status === JOB_STATUS.stopping) {
        const interruptedStop = new Error('Scan stopped before a usable partial map was ready. No map was created.');
        interruptedStop.scanFailureReason = 'stale_stopping_job';
        console.warn('[scan] Refusing to restart stale stopping scan job:', { jobId });
        await markJobFailed(jobId, interruptedStop);
        return;
      }
      const progressState = {
        lastUpdate: 0,
        lastScanned: 0,
        lastMapped: 0,
        lastProgress: null,
        sequence: 0,
        writePromise: Promise.resolve(),
      };
      const readJobStatus = createJobStatusReader(jobId);
      const authSessionStorageState = payload.options?.authSessionId
        ? getReadyScanAuthStorageStateForJob({
          sessionId: payload.options.authSessionId,
          ownerKey: payload.authSessionOwnerKey,
          safeUrl: payload.url,
        })
        : null;
      if (payload.options?.authSessionId && !authSessionStorageState) {
        throw new Error('Authenticated scan session expired before the scan started');
      }
      const progressCb = (progress) => {
        const nextProgress = {
          ...progress,
          sequence: ++progressState.sequence,
        };
        progressState.lastProgress = nextProgress;
        const now = Date.now();
        const scanned = Math.max(0, Number(nextProgress.scanned || 0) || 0);
        const mapped = Math.max(0, Number(nextProgress.mapped || 0) || 0);
        const mappedChanged = mapped !== progressState.lastMapped;
        const forceUpdate = nextProgress?.final === true;
        if (!forceUpdate && scanned - progressState.lastScanned < 5 && !mappedChanged && now - progressState.lastUpdate < 500) {
          return;
        }
        progressState.lastUpdate = now;
        progressState.lastScanned = scanned;
        progressState.lastMapped = mapped;
        progressState.writePromise = progressState.writePromise
          .then(() => updateJobProgress(jobId, nextProgress))
          .catch((err) => {
            console.error('Job progress update error:', err);
          });
      };

      const result = await crawlSite(
        payload.url,
        payload.maxPages,
        payload.maxDepth,
        {
          ...(payload.options || {}),
          ...(authSessionStorageState ? { authSessionStorageState } : {}),
          _entitlementCappedScan: Boolean(payload.entitlement?.capped),
        },
        progressCb,
        readJobStatus
      );

      if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;

      await progressState.writePromise;
      if (progressState.lastProgress) {
        await updateJobProgress(jobId, progressState.lastProgress);
      }
      if (!result.captureSummary) {
        hardenCollapsedScanResult(result, {
          progress: progressState.lastProgress,
          entitlementCapped: Boolean(payload.entitlement?.capped),
        });
      }
      applyScanEntitlementMetadata(result, payload.entitlement || null);
      const failureError = result.captureSummary ? null : getScanResultFailureError(result);
      logScanOutcome({
        jobId,
        result,
        payload,
        failureReason: failureError?.scanFailureReason || null,
      });
      if (failureError) {
        await markJobFailed(jobId, failureError);
        return;
      }
      await debitScanPagesForJobAsync({
        jobId,
        jobUserId: job.user_id,
        result,
      });
      await markJobComplete(jobId, result);
      return;
    }

    if (jobType === JOB_TYPES.screenshot) {
      const result = await captureScreenshot(payload.url, payload.type || 'full');
      if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;
      await debitScreenshotCreditsForJobAsync({
        jobId,
        jobUserId: job.user_id,
        type: payload.type || 'full',
        result,
      });
      await markJobComplete(jobId, result);
      return;
    }

    if (jobType === JOB_TYPES.imageCapture) {
      const result = await runImageCaptureJob(jobId, payload);
      if ((await jobStore.getJobStatusAsync(jobId)) === JOB_STATUS.canceled) return;
      await debitImageCaptureCreditsForJobAsync({
        jobId,
        jobUserId: job.user_id,
        result,
      });
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
  } finally {
    if (payload.options?.authSessionId) {
      const session = scanAuthSessions.get(payload.options.authSessionId);
      closeScanAuthSession(session);
      scanAuthSessions.delete(payload.options.authSessionId);
    }
    activeJobIds.delete(jobId);
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

const runClaimedJob = async (jobId) => {
  const job = await getJobRow(jobId);
  if (!job) return;
  activeJobs += 1;
  try {
    await processJob(job);
  } catch (err) {
    console.error('Job processing error:', err);
  } finally {
    activeJobs -= 1;
    runJobLoop().catch((err) => console.error('Job loop error:', err));
  }
};

const scheduleClaimedJob = (jobId) => {
  setImmediate(() => {
    runClaimedJob(jobId).catch((err) => console.error('Claimed job error:', err));
  });
};

if (JOB_WORKER_TYPES.length > 0) {
  console.log(`[jobs] processor enabled for types=${JOB_WORKER_TYPES.join(',')}`);
  setInterval(() => {
    runJobLoop().catch((err) => console.error('Job loop error:', err));
  }, JOB_POLL_INTERVAL_MS);
  setTimeout(() => {
    recoverInterruptedScanJobs()
      .catch((err) => console.error('Interrupted scan recovery error:', err))
      .finally(() => {
        runJobLoop().catch((err) => console.error('Job loop error:', err));
      });
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

app.post('/scan-auth/precheck', authMiddleware, requireAuth, scanLimiter, requireApiKey, async (req, res) => {
  const { url, options } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });
  if (!SCAN_AUTH_FEATURE_ENABLED) {
    return res.json({
      authRequired: false,
      authCount: 0,
      sampleUrls: [],
      interactiveLoginSupported: false,
      featureDisabled: true,
      scanDiagnostics: null,
    });
  }

  try {
    const safeUrl = await assertSafeUrl(url);
    const result = await crawlSite(
      safeUrl,
      SCAN_AUTH_PRECHECK_MAX_PAGES,
      SCAN_AUTH_PRECHECK_MAX_DEPTH,
      {
        ...(options || {}),
        thumbnails: false,
        authenticatedPages: true,
      }
    );
    const nodes = [];
    const visit = (node) => {
      if (!node) return;
      nodes.push(node);
      (node.children || []).forEach(visit);
    };
    visit(result.root);
    (result.orphans || []).forEach(visit);
    let authNodes = nodes.filter((node) => node?.authRequired);
    if (authNodes.length === 0) {
      const scope = createScanScope(safeUrl, Boolean(options?.subdomains));
      const rootPage = await fetchPage(safeUrl);
      const rootClassification = classifyScanResponse({
        html: rootPage.html,
        status: rootPage.status,
        url: safeUrl,
        finalUrl: rootPage.finalUrl || safeUrl,
        headers: rootPage.headers || {},
      });
      const directAuthUrls = [];
      if (rootClassification.isAuthStatus) {
        directAuthUrls.push(safeUrl);
      } else if (rootClassification.shouldExtractLinks) {
        const directLinks = extractLinks(rootPage.html, rootPage.finalUrl || safeUrl)
          .map((link) => normalizeUrl(link))
          .filter(Boolean)
          .filter((link) => getPlacementForUrl(link, scope))
          .slice(0, SCAN_AUTH_PRECHECK_MAX_PAGES);
        for (const link of directLinks) {
          const page = await fetchPage(link).catch(() => null);
          if (!page) continue;
          const classification = classifyScanResponse({
            html: page.html,
            status: page.status,
            url: link,
            finalUrl: page.finalUrl || link,
            headers: page.headers || {},
          });
          if (classification.isAuthStatus) directAuthUrls.push(link);
        }
      }
      authNodes = directAuthUrls.map((authUrl) => ({ url: authUrl, authRequired: true }));
    }
    return res.json({
      authRequired: authNodes.length > 0,
      authCount: authNodes.length,
      sampleUrls: authNodes.slice(0, 5).map((node) => node.url).filter(Boolean),
      interactiveLoginSupported: SCAN_AUTH_INTERACTIVE_SUPPORTED,
      scanDiagnostics: result.scanDiagnostics || null,
    });
  } catch (error) {
    const message = error.message || 'Authenticated scan pre-check failed';
    const status = message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500;
    return res.status(status).json({ error: message });
  }
});

app.post('/scan-auth/sessions', authMiddleware, requireAuth, requireApiKey, async (req, res) => {
  const { url, storageState } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });
  if (!SCAN_AUTH_FEATURE_ENABLED) {
    return res.status(503).json({
      error: 'Authenticated scanning is temporarily disabled',
      code: 'scan_auth_disabled',
    });
  }

  try {
    const safeUrl = await assertSafeUrl(url);
    const session = createScanAuthSession({ safeUrl, req, storageState });
    if (session.status !== 'ready' && SCAN_AUTH_INTERACTIVE_SUPPORTED) {
      await startInteractiveScanAuthSession(session);
    }
    if (SCAN_AUTH_INTERACTIVE_SUPPORTED && session.status !== 'ready' && session.status !== 'interactive') {
      throw new Error('Target-site login browser did not start');
    }
    return res.json({
      sessionId: session.id,
      status: session.status,
      expiresAt: new Date(session.expiresAt).toISOString(),
      origin: session.origin,
      interactiveSupported: SCAN_AUTH_INTERACTIVE_SUPPORTED,
      loginUrl: session.pageUrl || safeUrl,
      message: session.status === 'ready'
        ? 'Authenticated scan session ready'
        : 'Log in inside the Vellic browser, then continue the scan',
    });
  } catch (error) {
    const message = error.message || 'Failed to create authenticated scan session';
    const status = message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500;
    return res.status(status).json({ error: message });
  }
});

app.get('/scan-auth/sessions/:id', authMiddleware, requireAuth, requireApiKey, (req, res) => {
  const session = getScanAuthSessionForRequest(req, req.params.id);
  if (!session) return res.status(404).json({ error: 'Authenticated scan session not found' });
  return res.json({
    sessionId: session.id,
    status: session.status,
    expiresAt: new Date(session.expiresAt).toISOString(),
    origin: session.origin,
    pageUrl: session.pageUrl || session.seedUrl,
    interactiveSupported: SCAN_AUTH_INTERACTIVE_SUPPORTED,
    ready: session.status === 'ready' && !!session.storageState,
  });
});

app.delete('/scan-auth/sessions/:id', authMiddleware, requireAuth, requireApiKey, (req, res) => {
  const session = getScanAuthSessionForRequest(req, req.params.id);
  if (session) {
    closeScanAuthSession(session);
    scanAuthSessions.delete(session.id);
  }
  return res.json({ success: true });
});

app.get('/scan-auth/sessions/:id/screenshot', authMiddleware, requireAuth, requireApiKey, async (req, res) => {
  let target = await getInteractiveScanAuthPage(req, req.params.id);
  if (!target) return res.status(404).json({ error: 'Interactive login session not found' });
  try {
    target.session.pageUrl = target.page.url();
    const image = await target.page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'image/jpeg');
    return res.send(image);
  } catch (error) {
    target.session.page = null;
    target = await getInteractiveScanAuthPage(req, req.params.id);
    if (target) {
      try {
        target.session.pageUrl = target.page.url();
        const image = await target.page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'image/jpeg');
        return res.send(image);
      } catch {
        // Fall through to the original error so the user sees the useful failure.
      }
    }
    return res.status(500).json({ error: error.message || 'Failed to capture login screen' });
  }
});

app.post('/scan-auth/sessions/:id/action', authMiddleware, requireAuth, requireApiKey, async (req, res) => {
  const target = await getInteractiveScanAuthPage(req, req.params.id);
  if (!target) return res.status(404).json({ error: 'Interactive login session not found' });
  const { action, x, y, text, key } = req.body || {};
  try {
    if (action === 'click') {
      await target.page.mouse.click(Number(x), Number(y));
    } else if (action === 'type') {
      await target.page.keyboard.type(String(text || ''), { delay: 10 });
    } else if (action === 'press') {
      await target.page.keyboard.press(String(key || 'Enter'));
    } else {
      return res.status(400).json({ error: 'Unsupported login action' });
    }
    target.session.pageUrl = target.page.url();
    return res.json({ success: true, pageUrl: target.session.pageUrl });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to control login browser' });
  }
});

app.post('/scan-auth/sessions/:id/complete', authMiddleware, requireAuth, requireApiKey, async (req, res) => {
  const session = getScanAuthSessionForRequest(req, req.params.id);
  if (!session || !session.browserContext) {
    return res.status(404).json({ error: 'Interactive login session not found' });
  }
  try {
    session.storageState = normalizePlaywrightStorageState(await session.browserContext.storageState());
    session.status = 'ready';
    session.pageUrl = session.page?.url?.() || session.pageUrl || session.seedUrl;
    closeScanAuthSession(session);
    return res.json({
      sessionId: session.id,
      status: session.status,
      ready: true,
      pageUrl: session.pageUrl,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to finish target-site login' });
  }
});

app.post('/scan-preview', authMiddleware, scanPreviewLimiter, requireApiKey, async (req, res) => {
  const { maxPages } = req.body || {};

  try {
    const maxPagesSafe = normalizeMaxPagesLimit(maxPages, SCAN_LIMITS.maxPagesDefault);
    const scanEntitlement = await resolveScanEntitlementForRequestAsync(req, maxPagesSafe);
    if (!scanEntitlement.allowed) {
      return sendEntitlementError(res, scanEntitlement.entitlement);
    }

    return res.json({ entitlement: scanEntitlement.entitlementPayload });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to preview scan limits' });
  }
});

app.post('/scan', authMiddleware, requireAuth, scanLimiter, requireApiKey, enforceUsageLimit('scan'), async (req, res) => {
  const { url, maxPages, maxDepth, options, authSessionId } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const safeUrl = await assertSafeUrl(url);
    const maxPagesSafe = normalizeMaxPagesLimit(maxPages, SCAN_LIMITS.maxPagesDefault);
    const maxDepthSafe = normalizeScanDepthLimit(maxDepth);
    const authSessionStorageState = getReadyScanAuthStorageState(req, authSessionId || options?.authSessionId, safeUrl);
    const scanEntitlement = await resolveScanEntitlementForRequestAsync(req, maxPagesSafe);
    if (!scanEntitlement.allowed) {
      return sendEntitlementError(res, scanEntitlement.entitlement);
    }
    const entitledMaxPages = scanEntitlement.entitledMaxPages;

    recordUsage(req, 'scan', 1, {
      host: new URL(safeUrl).hostname,
      maxPages: entitledMaxPages,
      maxDepth: maxDepthSafe,
      entitlementCapped: Boolean(scanEntitlement.entitlementPayload.capped),
    });

    const result = await crawlSite(
      safeUrl,
      entitledMaxPages,
      maxDepthSafe,
      {
        ...(options || {}),
        ...(authSessionStorageState ? { authSessionStorageState } : {}),
        _entitlementCappedScan: Boolean(scanEntitlement.entitlementPayload.capped),
      }
    );
    hardenCollapsedScanResult(result, {
      entitlementCapped: Boolean(scanEntitlement.entitlementPayload.capped),
    });
    applyScanEntitlementMetadata(result, scanEntitlement.entitlementPayload);
    const failureError = getScanResultFailureError(result);
    if (failureError) {
      throw failureError;
    }
    await recordMeterDebitAsync({
      user: req.user,
      accountSummary: scanEntitlement.entitlement?.summary,
      meter: ENTITLEMENT_METERS.crawlPages,
      quantity: countScanResultPages(result),
      idempotencyKey: req.get('Idempotency-Key') || `scan:${crypto.randomUUID()}`,
      metadata: {
        host: new URL(safeUrl).hostname,
        requestedPages: maxPagesSafe,
        allowedPages: entitledMaxPages,
        capped: Boolean(scanEntitlement.entitlementPayload.capped),
      },
    });
    res.json(result);
  } catch (e) {
    const message = e.message || 'Scan failed';
    if (e.code === 'ENTITLEMENT_REQUIRED') {
      return res.status(e.status || 402).json({ error: message, code: e.code });
    }
    const status = e.status || (message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500);
    res.status(status).json({ error: message });
  }
});

// SSE endpoint for scan with progress updates
app.get('/scan-stream', authMiddleware, requireAuth, scanLimiter, requireApiKey, enforceUsageLimit('scan_stream'), async (req, res) => {
  const { url, maxPages, maxDepth, options, authSessionId } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let safeUrl;
  try {
    safeUrl = await assertSafeUrl(url);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invalid url' });
  }

  let parsedOptions = {};
  try {
    parsedOptions = options ? JSON.parse(options) : {};
  } catch {
    parsedOptions = {};
  }

  const maxPagesSafe = normalizeMaxPagesLimit(maxPages, SCAN_LIMITS.maxPagesDefault);
  const maxDepthSafe = normalizeScanDepthLimit(maxDepth);
  let scanEntitlement;
  try {
    scanEntitlement = await resolveScanEntitlementForRequestAsync(req, maxPagesSafe);
    if (!scanEntitlement.allowed) {
      return sendEntitlementError(res, scanEntitlement.entitlement);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to verify scan limits' });
  }
  const entitledMaxPages = scanEntitlement.entitledMaxPages;

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
    const authSessionStorageState = getReadyScanAuthStorageState(req, authSessionId || parsedOptions?.authSessionId, safeUrl);
    let lastScanProgress = null;

    recordUsage(req, 'scan_stream', 1, {
      host: new URL(safeUrl).hostname,
      maxPages: entitledMaxPages,
      maxDepth: maxDepthSafe,
      entitlementCapped: Boolean(scanEntitlement.entitlementPayload.capped),
    });

    const result = await crawlSite(
      safeUrl,
      entitledMaxPages,
      maxDepthSafe,
      {
        ...parsedOptions,
        ...(authSessionStorageState ? { authSessionStorageState } : {}),
        _entitlementCappedScan: Boolean(scanEntitlement.entitlementPayload.capped),
      },
      (progress) => {
        lastScanProgress = progress;
        sendEvent('progress', progress);
      },
      () => aborted
    );
    hardenCollapsedScanResult(result, {
      progress: lastScanProgress,
      entitlementCapped: Boolean(scanEntitlement.entitlementPayload.capped),
    });
    applyScanEntitlementMetadata(result, scanEntitlement.entitlementPayload);
    const failureError = getScanResultFailureError(result);
    if (failureError) {
      throw failureError;
    }
    await recordMeterDebitAsync({
      user: req.user,
      accountSummary: scanEntitlement.entitlement?.summary,
      meter: ENTITLEMENT_METERS.crawlPages,
      quantity: countScanResultPages(result),
      idempotencyKey: req.get('Idempotency-Key') || `scan-stream:${crypto.randomUUID()}`,
      metadata: {
        host: new URL(safeUrl).hostname,
        requestedPages: maxPagesSafe,
        allowedPages: entitledMaxPages,
        capped: Boolean(scanEntitlement.entitlementPayload.capped),
      },
    });

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
    sendEvent('error', { error: e.message || 'Scan failed', code: e.code || undefined });
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});

// Background scan jobs
app.post('/scan-jobs', authMiddleware, scanLimiter, requireApiKey, enforceUsageLimit('scan_job'), async (req, res) => {
  const { url, maxPages, maxDepth, options, authSessionId } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const safeUrl = await assertSafeUrl(url);
    const maxPagesSafe = normalizeMaxPagesLimit(maxPages, SCAN_LIMITS.maxPagesDefault);
    const maxDepthSafe = normalizeScanDepthLimit(maxDepth);
    const readyAuthSession = getScanAuthSessionForRequest(req, authSessionId || options?.authSessionId, safeUrl);
    if ((authSessionId || options?.authSessionId) && (!readyAuthSession || readyAuthSession.status !== 'ready')) {
      return res.status(400).json({ error: 'Authenticated scan session is missing or expired' });
    }
    const scanEntitlement = await resolveScanEntitlementForRequestAsync(req, maxPagesSafe);
    if (!scanEntitlement.allowed) {
      return sendEntitlementError(res, scanEntitlement.entitlement);
    }
    const entitledMaxPages = scanEntitlement.entitledMaxPages;
    const entitlementPayload = scanEntitlement.entitlementPayload;
    const idempotencyKey = String(req.get('Idempotency-Key') || '').trim().slice(0, 160) || null;
    const existingJob = await findScanJobByIdempotencyKey(req, idempotencyKey, safeUrl);
    if (existingJob) {
      const existingPayload = getJobPayload(existingJob);
      return res.json({
        jobId: existingJob.id,
        jobAccessToken: existingPayload.accessToken || null,
        idempotentReplay: true,
        entitlement: {
          mode: existingPayload.entitlement?.mode || entitlementPayload.mode,
          capped: Boolean(existingPayload.entitlement?.capped ?? entitlementPayload.capped),
          requestedPages: existingPayload.entitlement?.requestedPages ?? maxPagesSafe,
          allowedPages: existingPayload.entitlement?.allowedPages ?? entitledMaxPages,
          remaining: existingPayload.entitlement?.remaining ?? entitlementPayload.remaining ?? null,
          capReason: existingPayload.entitlement?.capReason || entitlementPayload.capReason || null,
          planName: existingPayload.entitlement?.planName || entitlementPayload.planName || null,
        },
      });
    }
    const jobAccessToken = crypto.randomBytes(24).toString('hex');

    const jobId = await createJob({
      type: JOB_TYPES.scan,
      payload: {
        url: safeUrl,
        maxPages: entitledMaxPages,
        maxDepth: maxDepthSafe,
        options: {
          ...(options || {}),
          ...(readyAuthSession ? { authSessionId: readyAuthSession.id } : {}),
        },
        authSessionOwnerKey: readyAuthSession?.ownerKey || null,
        accessToken: jobAccessToken,
        entitlement: entitlementPayload,
        idempotencyKey,
      },
      req,
    });

    recordUsage(req, 'scan_job', 1, {
      host: new URL(safeUrl).hostname,
      maxPages: entitledMaxPages,
      maxDepth: maxDepthSafe,
      entitlementCapped: Boolean(entitlementPayload.capped),
      entitlementMode: entitlementPayload.mode,
    });

    res.json({
      jobId,
      jobAccessToken,
      entitlement: {
        mode: entitlementPayload.mode,
        capped: Boolean(entitlementPayload.capped),
        requestedPages: maxPagesSafe,
        allowedPages: entitledMaxPages,
        remaining: entitlementPayload.remaining ?? null,
        capReason: entitlementPayload.capReason || null,
        planName: entitlementPayload.planName || null,
      },
    });
  } catch (e) {
    const message = e.message || 'Failed to create scan job';
    if (e.code === 'ENTITLEMENT_REQUIRED') {
      return res.status(e.status || 402).json({ error: message, code: e.code });
    }
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
  if (row.status === JOB_STATUS.queued) {
    await markJobCanceled(id);
    return res.json({
      success: true,
      canceled: true,
      reason: 'no_results_ready',
    });
  }
  if ([JOB_STATUS.complete, JOB_STATUS.failed, JOB_STATUS.canceled].includes(row.status)) {
    return res.json({
      success: true,
      status: row.status,
    });
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
  targetApp.post('/api/maps/:id/image-capture-jobs', authMiddleware, requireAuth, (req, res, next) => enforceUsageLimit('screenshot_job')(req, res, next), async (req, res) => {
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
      const force = targetMode === IMAGE_CAPTURE_TARGET_MODES.captured || scope === 'selected' || Boolean(req.body?.force);

      const existingJob = await findActiveImageCaptureJob(id, captureType, {
        scope,
        nodeIds,
        targetMode,
      });
      if (existingJob?.id && existingJob.matchesRequest) {
        return res.json({
          ok: true,
          alreadyRunning: true,
          jobId: existingJob.id,
          jobType: JOB_TYPES.imageCapture,
          mapId: id,
        });
      }
      if (existingJob?.id) {
        return res.status(409).json({
          error: 'A previous image capture is still finishing. Wait a moment, then retry.',
          code: 'IMAGE_CAPTURE_JOB_ACTIVE',
          jobId: existingJob.id,
          jobType: JOB_TYPES.imageCapture,
          mapId: id,
        });
      }

      let estimatedCredits = 0;
      try {
        const root = parseJsonSafe(map.root_data);
        const orphans = parseJsonSafe(map.orphans_data) || [];
        const savedManifestRows = await imageAssetStore.listSavedImageAssetsByMapAsync(id);
        const manifestRows = await verifySavedImageCaptureManifestRows({
          mapId: id,
          manifestRows: savedManifestRows,
        });
        const targetPlan = await buildImageCaptureTargets({
          root,
          orphans,
          captureType,
          scope,
          nodeIds,
          force,
          targetMode,
          manifestRows,
        });
        estimatedCredits = targetPlan.captureRecords.length * getScreenshotCreditCost({ type: captureType });
      } catch (estimateError) {
        console.error('Image capture credit estimate error:', estimateError);
        estimatedCredits = getScreenshotCreditCost({ type: captureType });
      }
      if (estimatedCredits > 0) {
        const screenshotEntitlement = await requireAccountActionAsync(
          req,
          res,
          ENTITLEMENT_ACTIONS.screenshotCapture,
          { credits: estimatedCredits }
        );
        if (!screenshotEntitlement) return;
      }

      const jobPayload = {
        mapId: id,
        captureType,
        scope,
        nodeIds,
        targetMode,
        force,
        estimatedCredits,
      };
      // Claim image-capture jobs here so older generic workers cannot take this newer job type.
      const claimInCurrentProcess = RUN_WEB && JOB_WORKER_TYPES.includes(JOB_TYPES.imageCapture);
      const jobId = await createJob({
        type: JOB_TYPES.imageCapture,
        payload: jobPayload,
        req,
        status: claimInCurrentProcess ? JOB_STATUS.running : JOB_STATUS.queued,
      });
      if (claimInCurrentProcess) {
        scheduleClaimedJob(jobId);
      }

      recordUsage(req, 'screenshot_job', 1, {
        mapId: id,
        type: captureType,
        scope,
        targetMode,
        selected: nodeIds.length,
        estimatedCredits,
      });

      return res.json({
        ok: true,
        jobId,
        jobType: JOB_TYPES.imageCapture,
        mapId: id,
        estimatedCredits,
      });
    } catch (error) {
      console.error('Create image capture job error:', error);
      return res.status(error?.status || 500).json({ error: error?.message || 'Failed to create image capture job' });
    }
  });

  targetApp.get('/api/maps/:id/image-capture-jobs/active', authMiddleware, requireAuth, async (req, res) => {
    const { id } = req.params;
    const map = await getImageCaptureMapForRequest(req, id);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    const row = await findAnyActiveImageCaptureJob(id);
    if (!row) {
      return res.json({ job: null });
    }
    return res.json({ job: serializeJobRow(row, true) });
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

  targetApp.post('/api/maps/:id/image-capture-jobs/:jobId/pause', authMiddleware, requireAuth, async (req, res) => {
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
    await markJobPaused(jobId);
    return res.json({ success: true });
  });

  targetApp.post('/api/maps/:id/image-capture-jobs/:jobId/resume', authMiddleware, requireAuth, async (req, res) => {
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
    await markJobResumed(jobId);
    if (RUN_WEB && JOB_WORKER_TYPES.includes(JOB_TYPES.imageCapture)) {
      scheduleClaimedJob(jobId);
    }
    return res.json({ success: true });
  });
}

// Screenshot endpoint - captures full-page screenshot
// Note: Playwright requires browser binaries which may not be available on all hosts
app.get('/screenshot', authMiddleware, requireAuth, requireApiKey, enforceUsageLimit('screenshot'), async (req, res) => {
  const { url, authSessionId } = req.query;
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
  const screenshotCredits = getScreenshotCreditCost({ type: screenshotType });
  const screenshotEntitlement = await requireAccountActionAsync(
    req,
    res,
    ENTITLEMENT_ACTIONS.screenshotCapture,
    { credits: screenshotCredits }
  );
  if (!screenshotEntitlement) return;

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
    const authSessionStorageState = getReadyScanAuthStorageState(req, authSessionId, safeUrl);
    const result = await captureScreenshot(safeUrl, screenshotType, {
      signal: abortController.signal,
      ...(authSessionStorageState ? { storageState: authSessionStorageState } : {}),
    });
    if (clientGone) return;
    if (!result.cached) {
      await recordMeterDebitAsync({
        user: req.user,
        accountSummary: screenshotEntitlement.summary,
        meter: ENTITLEMENT_METERS.screenshotCredits,
        quantity: screenshotCredits,
        idempotencyKey: req.get('Idempotency-Key') || `screenshot:${crypto.randomUUID()}`,
        metadata: {
          host: new URL(safeUrl).hostname,
          type: screenshotType,
          credits: screenshotCredits,
        },
      });
    }
    recordUsage(req, 'screenshot', 1, { host: new URL(safeUrl).hostname, type: screenshotType });
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
    if (e.code === 'storage_exhausted') {
      return res.status(507).json({
        error: e.message,
        code: 'storage_exhausted',
      });
    }
    if (e.code === 'ENTITLEMENT_REQUIRED') {
      return res.status(e.status || 402).json({ error: e.message || 'Plan limit reached', code: e.code });
    }
    const shortError = e.message?.includes('Executable')
      ? 'Screenshots not available in this environment'
      : 'Screenshot failed';
    res.status(500).json({ error: shortError });
  }
});

app.post('/screenshot-assets/validate', authMiddleware, requireAuth, requireApiKey, async (req, res) => {
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
app.post('/screenshot-jobs', authMiddleware, requireAuth, requireApiKey, enforceUsageLimit('screenshot_job'), async (req, res) => {
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
    const screenshotCredits = getScreenshotCreditCost({ type: screenshotType });
    const screenshotEntitlement = await requireAccountActionAsync(
      req,
      res,
      ENTITLEMENT_ACTIONS.screenshotCapture,
      { credits: screenshotCredits }
    );
    if (!screenshotEntitlement) return;
    const jobId = await createJob({
      type: JOB_TYPES.screenshot,
      payload: {
        url: safeUrl,
        type: screenshotType,
        host,
        entitlement: {
          accountId: screenshotEntitlement.summary.account.id,
          estimatedCredits: screenshotCredits,
        },
      },
      req,
    });

    recordUsage(req, 'screenshot_job', 1, { host, type: screenshotType });

    res.json({ jobId, estimatedCredits: screenshotCredits });
  } catch (e) {
    const message = e.message || 'Failed to create screenshot job';
    if (e.code === 'ENTITLEMENT_REQUIRED') {
      return res.status(e.status || 402).json({ error: message, code: e.code });
    }
    const status = e.status || (message.includes('Invalid URL') || message.includes('Blocked host') || message.includes('Unable to resolve')
      ? 400
      : 500);
    res.status(status).json({ error: message });
  }
});

app.get('/screenshot-jobs/:id', authMiddleware, requireAuth, requireApiKey, async (req, res) => {
  const { id } = req.params;
  const includeResult = req.query.include_result !== 'false';
  const row = await getJobRow(id);
  if (!row || row.type !== JOB_TYPES.screenshot || !isJobVisibleToRequest(row, req)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ job: serializeJobRow(row, includeResult) });
});

app.post('/screenshot-jobs/:id/cancel', authMiddleware, requireAuth, requireApiKey, async (req, res) => {
  const { id } = req.params;
  const row = await getJobRow(id);
  if (!row || row.type !== JOB_TYPES.screenshot || !isJobVisibleToRequest(row, req)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  await markJobCanceled(id);
  res.json({ success: true });
});

app.get('/screenshot-jobs/:id/stream', authMiddleware, requireAuth, requireApiKey, (req, res) => {
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
} else {
  const workerHealthServer = http.createServer((req, res) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://worker.local').pathname;
    } catch {
      // Keep the default path so malformed requests receive a 404.
    }
    const payload = req.method === 'GET' && pathname === '/health'
      ? { status: 200, body: { ok: true } }
      : { status: 404, body: { error: 'Not found' } };
    res.writeHead(payload.status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload.body));
  });
  const listenArgs = HOST ? [PORT, HOST] : [PORT];
  workerHealthServer.listen(...listenArgs, () => {
    console.log(`Vellic Worker health endpoint running on http://${HOST || 'localhost'}:${PORT}`);
  });
}
