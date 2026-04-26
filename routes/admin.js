const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authStore = require('../stores/authStore');
const adminAuditStore = require('../stores/adminAuditStore');
const feedbackStore = require('../stores/feedbackStore');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_PUBLIC_DOMAIN;
const ADMIN_CONSOLE_ENABLED = parseEnvBool(process.env.ADMIN_CONSOLE_ENABLED, false);
const ADMIN_SESSION_COOKIE = 'admin_session';
const ADMIN_SESSION_TTL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.ADMIN_SESSION_TTL_MS ?? 8 * 60 * 60 * 1000)
);
const ADMIN_SESSION_TTL_SECONDS = Math.max(300, Math.floor(ADMIN_SESSION_TTL_MS / 1000));
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET
  || `${process.env.JWT_SECRET || 'mapmat-dev-secret-change-in-production'}:admin-session`;
const ADMIN_SESSION_AUDIENCE = 'mapmat-admin-console';
const ADMIN_LOGIN_RATE_WINDOW_MS = Math.max(
  1000,
  Number(process.env.ADMIN_LOGIN_RATE_WINDOW_MS ?? 15 * 60 * 1000)
);
const ADMIN_LOGIN_RATE_LIMIT = Math.max(
  1,
  Number(process.env.ADMIN_LOGIN_RATE_LIMIT ?? (isProd ? 10 : 30))
);

const ADMIN_ROLES = Object.freeze({
  NONE: 'none',
  SUPPORT: 'support',
  PLATFORM_OWNER: 'platform_owner',
});

const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || (isProd ? 'none' : 'lax');
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : isProd;
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: COOKIE_SAMESITE,
  domain: COOKIE_DOMAIN,
  maxAge: ADMIN_SESSION_TTL_MS,
};
const CLEAR_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 0,
};

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAdminRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === ADMIN_ROLES.SUPPORT || normalized === ADMIN_ROLES.PLATFORM_OWNER) {
    return normalized;
  }
  return ADMIN_ROLES.NONE;
}

function hasAdminConsoleAccess(userOrRole) {
  const role = typeof userOrRole === 'string'
    ? userOrRole
    : userOrRole?.admin_role;
  return normalizeAdminRole(role) !== ADMIN_ROLES.NONE;
}

function normalizeIp(ip) {
  return ip && ip.startsWith('::ffff:') ? ip.slice(7) : (ip || '');
}

function getClientIp(req) {
  return normalizeIp(req.ip || req.connection?.remoteAddress || 'unknown');
}

function createRateLimiter({ windowMs, max, name }) {
  const hits = new Map();
  let lastSweep = Date.now();

  return (req, res, next) => {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${name}:${ip}`;
    const entry = hits.get(key);

    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }

    if (entry.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many admin login attempts. Please try again later.' });
    }

    entry.count += 1;

    if (now - lastSweep >= windowMs) {
      lastSweep = now;
      for (const [bucketKey, bucket] of hits.entries()) {
        if (now - bucket.start >= windowMs) hits.delete(bucketKey);
      }
    }

    return next();
  };
}

const adminLoginLimiter = createRateLimiter({
  windowMs: ADMIN_LOGIN_RATE_WINDOW_MS,
  max: ADMIN_LOGIN_RATE_LIMIT,
  name: 'admin_login',
});

function ensureAdminConsoleEnabled(req, res, next) {
  if (!ADMIN_CONSOLE_ENABLED) {
    return res.status(404).json({ error: 'Admin console is not enabled in this environment.' });
  }
  return next();
}

async function ensureAdminSupportSchemaAsync() {
  await authStore.ensureAuthSchemaAsync();
  await adminAuditStore.ensureAdminAuditSchemaAsync();
  await feedbackStore.ensureFeedbackSchemaAsync();
}

function isAccountDisabled(user) {
  return String(user?.account_status || 'active').trim().toLowerCase() === 'disabled';
}

function buildAdminSessionUser(user) {
  return {
    id: user.id,
    email: normalizeEmail(user.email),
    name: String(user.name || '').trim(),
    adminRole: normalizeAdminRole(user.admin_role),
  };
}

function createAdminSessionToken({ userId, email, name, adminRole }) {
  return jwt.sign(
    {
      type: 'admin_session',
      userId,
      email,
      name,
      adminRole,
    },
    ADMIN_SESSION_SECRET,
    {
      audience: ADMIN_SESSION_AUDIENCE,
      expiresIn: ADMIN_SESSION_TTL_SECONDS,
    }
  );
}

function verifyAdminSessionToken(token) {
  try {
    return jwt.verify(token, ADMIN_SESSION_SECRET, {
      audience: ADMIN_SESSION_AUDIENCE,
    });
  } catch {
    return null;
  }
}

function getAdminSessionCookie(req) {
  return req.cookies?.[ADMIN_SESSION_COOKIE] || null;
}

async function authenticateAdminSession(req, res, next) {
  const token = getAdminSessionCookie(req);
  if (!token) {
    req.adminSession = null;
    return next();
  }

  const decoded = verifyAdminSessionToken(token);
  if (!decoded?.userId || decoded.type !== 'admin_session') {
    res.clearCookie(ADMIN_SESSION_COOKIE, CLEAR_COOKIE_OPTIONS);
    req.adminSession = null;
    return next();
  }

  const user = await authStore.getUserByIdAsync(decoded.userId);
  if (!user || isAccountDisabled(user) || !hasAdminConsoleAccess(user)) {
    res.clearCookie(ADMIN_SESSION_COOKIE, CLEAR_COOKIE_OPTIONS);
    req.adminSession = null;
    return next();
  }

  const sessionUser = buildAdminSessionUser(user);
  req.adminSession = {
    ...sessionUser,
    actorLabel: sessionUser.email,
    expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
  };
  return next();
}

function requireAdminSession(req, res, next) {
  if (!req.adminSession) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }
  return next();
}

function parsePagination(query) {
  const limitValue = query?.limit;
  const hasLimit = limitValue !== undefined && limitValue !== null && String(limitValue).trim() !== '';
  const limitRaw = Number.parseInt(limitValue, 10);
  const offsetRaw = Number.parseInt(query?.offset, 10);
  if (!hasLimit) {
    return { limit: null, offset: 0 };
  }
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 100;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
  return { limit, offset };
}

function parseUserSort(query) {
  const allowedSortFields = new Set(['name', 'email', 'accountStatus', 'updatedAt', 'createdAt']);
  const requestedSortBy = String(query?.sortBy || '').trim();
  const requestedSortDirection = String(query?.sortDirection || '').trim().toLowerCase();

  return {
    sortBy: allowedSortFields.has(requestedSortBy) ? requestedSortBy : 'updatedAt',
    sortDirection: requestedSortDirection === 'asc' ? 'asc' : 'desc',
  };
}

function serializeUserSummary(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    avatarUrl: user.avatar_path || null,
    avatarPresent: !!user.avatar_path,
    accountStatus: user.account_status || 'active',
    adminRole: normalizeAdminRole(user.admin_role),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function serializeUserDetail(user) {
  if (!user) return null;
  return {
    ...serializeUserSummary(user),
    disabledAt: user.disabled_at || null,
    disabledReason: user.disabled_reason || null,
  };
}

function parseJsonObject(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function serializeFeedbackItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorUserId: row.actor_user_id || null,
    actorName: row.actor_name || '',
    actorEmail: row.actor_email || '',
    surface: row.surface || '',
    routePath: row.route_path || '',
    routeSection: row.route_section || '',
    mapId: row.map_id || null,
    shareId: row.share_id || null,
    scope: row.scope || 'whole_app',
    intent: row.intent || 'idea',
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    message: row.message || '',
    componentKey: row.component_key || null,
    componentLabel: row.component_label || null,
    domHint: parseJsonObject(row.dom_hint_json),
    screenshotPath: row.screenshot_path || null,
    allowFollowUp: Number(row.allow_follow_up || 0) > 0,
    triageStatus: row.triage_status || 'new',
    themeId: row.theme_id || null,
    themeTitle: row.theme_title || null,
    themeStatus: row.theme_status || null,
    themePriorityBucket: row.theme_priority_bucket || null,
    context: parseJsonObject(row.context_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeFeedbackTheme(row) {
  if (!row) return null;
  return {
    id: row.id,
    normalizedTitle: row.normalized_title || '',
    title: row.title || '',
    summary: row.summary || '',
    severity: row.severity || 'medium',
    feedbackCount: Number(row.feedback_count || 0),
    priorityBucket: row.priority_bucket || 'medium',
    status: row.status || 'watching',
    ownerLabel: row.owner_label || '',
    externalTrackerType: row.external_tracker_type || '',
    externalTrackerUrl: row.external_tracker_url || '',
    averageRating: row.average_rating === null || row.average_rating === undefined
      ? null
      : Number(row.average_rating),
    lastFeedbackAt: row.last_feedback_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseFeedbackItemFilters(query = {}) {
  const unassigned = String(query?.unassigned || '').trim().toLowerCase();
  const hasTheme = unassigned === 'true'
    ? false
    : (String(query?.themed || '').trim().toLowerCase() === 'true' ? true : null);

  return {
    query: String(query?.q || query?.query || '').trim(),
    triageStatus: String(query?.status || query?.triageStatus || '').trim() || null,
    intent: String(query?.intent || '').trim() || null,
    scope: String(query?.scope || '').trim() || null,
    componentKey: String(query?.componentKey || query?.component_key || '').trim() || null,
    themeId: String(query?.themeId || query?.theme_id || '').trim() || null,
    hasTheme,
  };
}

function parseFeedbackThemeFilters(query = {}) {
  return {
    query: String(query?.q || query?.query || '').trim(),
    status: String(query?.status || '').trim() || null,
    priorityBucket: String(query?.priorityBucket || query?.priority_bucket || '').trim() || null,
    severity: String(query?.severity || '').trim() || null,
  };
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const normalized = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${String(normalized).replace(/"/g, '""')}"`;
}

function buildCsv(columns, rows) {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(',');
  const body = rows.map((row) => (
    columns.map((column) => escapeCsvCell(
      typeof column.value === 'function' ? column.value(row) : row[column.value]
    )).join(',')
  ));
  return [header, ...body].join('\n');
}

router.use(ensureAdminConsoleEnabled);
router.use(async (_req, _res, next) => {
  try {
    await ensureAdminSupportSchemaAsync();
    return next();
  } catch (error) {
    return next(error);
  }
});

router.get('/session', authenticateAdminSession, (req, res) => {
  if (!req.adminSession) {
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: {
      id: req.adminSession.id,
      email: req.adminSession.email,
      name: req.adminSession.name,
      adminRole: req.adminSession.adminRole,
    },
    expiresAt: req.adminSession.expiresAt,
  });
});

router.post('/session', adminLoginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const actorIp = getClientIp(req);

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    const user = await authStore.getUserByEmailAsync(email);
    if (!user) {
      await adminAuditStore.logAdminActionAsync({
        actorLabel: email,
        actorIp,
        action: 'session_login_failed',
        metadata: {
          reason: 'invalid_credentials',
        },
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (isAccountDisabled(user)) {
      await adminAuditStore.logAdminActionAsync({
        actorLabel: email,
        actorIp,
        action: 'session_login_failed',
        targetUserId: user.id,
        metadata: {
          reason: 'disabled_account',
        },
      });
      return res.status(403).json({
        error: 'This account has been disabled. Contact support for help reactivating it.',
      });
    }

    const isValid = await bcrypt.compare(password, user.password_hash || '');
    if (!isValid) {
      await adminAuditStore.logAdminActionAsync({
        actorLabel: email,
        actorIp,
        action: 'session_login_failed',
        targetUserId: user.id,
        metadata: {
          reason: 'invalid_credentials',
        },
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!hasAdminConsoleAccess(user)) {
      await adminAuditStore.logAdminActionAsync({
        actorLabel: email,
        actorIp,
        action: 'session_login_failed',
        targetUserId: user.id,
        metadata: {
          reason: 'missing_admin_role',
          adminRole: normalizeAdminRole(user.admin_role),
        },
      });
      return res.status(403).json({ error: 'This account does not have support console access.' });
    }

    const sessionUser = buildAdminSessionUser(user);
    const token = createAdminSessionToken(sessionUser);
    res.cookie(ADMIN_SESSION_COOKIE, token, COOKIE_OPTIONS);

    await adminAuditStore.logAdminActionAsync({
      actorLabel: sessionUser.email,
      actorIp,
      action: 'session_login_success',
      targetUserId: sessionUser.id,
      metadata: {
        adminRole: sessionUser.adminRole,
      },
    });

    return res.json({
      authenticated: true,
      user: sessionUser,
      expiresInMs: ADMIN_SESSION_TTL_MS,
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: 'Failed to start admin session.' });
  }
});

router.delete('/session', authenticateAdminSession, async (req, res) => {
  try {
    if (req.adminSession?.actorLabel) {
      await adminAuditStore.logAdminActionAsync({
        actorLabel: req.adminSession.actorLabel,
        actorIp: getClientIp(req),
        action: 'session_logout',
        targetUserId: req.adminSession.id,
      });
    }
    res.clearCookie(ADMIN_SESSION_COOKIE, CLEAR_COOKIE_OPTIONS);
    return res.json({ success: true });
  } catch (error) {
    console.error('Admin logout error:', error);
    return res.status(500).json({ error: 'Failed to end admin session.' });
  }
});

router.use(authenticateAdminSession);
router.use(requireAdminSession);

router.get('/feedback', async (req, res) => {
  try {
    const parsedPagination = parsePagination(req.query);
    const limit = parsedPagination.limit ?? 100;
    const offset = parsedPagination.offset ?? 0;
    const filters = parseFeedbackItemFilters(req.query);

    const [items, total] = await Promise.all([
      feedbackStore.listFeedbackItemsAsync({ ...filters, limit, offset }),
      feedbackStore.countFeedbackItemsAsync(filters),
    ]);

    return res.json({
      items: items.map((item) => serializeFeedbackItem(item)),
      pagination: {
        limit,
        offset,
        total,
      },
      filters,
    });
  } catch (error) {
    console.error('Admin list feedback error:', error);
    return res.status(500).json({ error: 'Failed to load feedback items.' });
  }
});

router.patch('/feedback/:id', async (req, res) => {
  try {
    const existing = await feedbackStore.getFeedbackItemByIdAsync(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Feedback item not found.' });
    }

    const updates = {};
    const oldThemeId = existing.theme_id || null;
    let newThemeId = oldThemeId;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'themeId')) {
      const requestedThemeId = String(req.body?.themeId || '').trim();
      if (requestedThemeId) {
        const theme = await feedbackStore.getFeedbackThemeByIdAsync(requestedThemeId);
        if (!theme) {
          return res.status(404).json({ error: 'Feedback theme not found.' });
        }
        updates.themeId = theme.id;
        newThemeId = theme.id;
      } else {
        updates.themeId = null;
        newThemeId = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'triageStatus')) {
      const triageStatus = String(req.body?.triageStatus || '').trim();
      if (!feedbackStore.ITEM_STATUSES.has(triageStatus)) {
        return res.status(400).json({ error: 'Invalid feedback item status.' });
      }
      updates.triageStatus = triageStatus;
    } else if (Object.prototype.hasOwnProperty.call(updates, 'themeId')) {
      updates.triageStatus = updates.themeId ? 'themed' : (existing.triage_status === 'themed' ? 'reviewed' : existing.triage_status);
    }

    const updated = await feedbackStore.updateFeedbackItemAsync(req.params.id, updates);
    await feedbackStore.syncFeedbackThemeCountsAsync([oldThemeId, newThemeId]);

    await adminAuditStore.logAdminActionAsync({
      actorLabel: req.adminSession.actorLabel,
      actorIp: getClientIp(req),
      action: 'feedback_item_updated',
      metadata: {
        feedbackId: req.params.id,
        oldThemeId,
        newThemeId,
        triageStatus: updated?.triage_status || null,
      },
    });

    return res.json({ item: serializeFeedbackItem(updated) });
  } catch (error) {
    console.error('Admin update feedback error:', error);
    return res.status(500).json({ error: 'Failed to update feedback item.' });
  }
});

router.get('/feedback/themes', async (req, res) => {
  try {
    const parsedPagination = parsePagination(req.query);
    const limit = parsedPagination.limit ?? 100;
    const offset = parsedPagination.offset ?? 0;
    const filters = parseFeedbackThemeFilters(req.query);

    const [themes, total] = await Promise.all([
      feedbackStore.listFeedbackThemesAsync({ ...filters, limit, offset }),
      feedbackStore.countFeedbackThemesAsync(filters),
    ]);

    return res.json({
      themes: themes.map((theme) => serializeFeedbackTheme(theme)),
      pagination: {
        limit,
        offset,
        total,
      },
      filters,
    });
  } catch (error) {
    console.error('Admin list feedback themes error:', error);
    return res.status(500).json({ error: 'Failed to load feedback themes.' });
  }
});

router.post('/feedback/themes', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'Theme title is required.' });
    }

    const severity = Object.prototype.hasOwnProperty.call(req.body || {}, 'severity')
      ? String(req.body.severity || '').trim()
      : 'medium';
    if (!feedbackStore.SEVERITY_LEVELS.has(severity)) {
      return res.status(400).json({ error: 'Invalid theme severity.' });
    }

    const priorityBucket = Object.prototype.hasOwnProperty.call(req.body || {}, 'priorityBucket')
      ? String(req.body.priorityBucket || '').trim()
      : 'medium';
    if (!feedbackStore.PRIORITY_BUCKETS.has(priorityBucket)) {
      return res.status(400).json({ error: 'Invalid theme priority bucket.' });
    }

    const status = Object.prototype.hasOwnProperty.call(req.body || {}, 'status')
      ? String(req.body.status || '').trim()
      : 'watching';
    if (!feedbackStore.THEME_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid theme status.' });
    }

    const created = await feedbackStore.createFeedbackThemeAsync({
      title,
      summary: req.body?.summary || null,
      severity,
      priorityBucket,
      status,
      ownerLabel: req.body?.ownerLabel || null,
      externalTrackerType: req.body?.externalTrackerType || null,
      externalTrackerUrl: req.body?.externalTrackerUrl || null,
    });

    await adminAuditStore.logAdminActionAsync({
      actorLabel: req.adminSession.actorLabel,
      actorIp: getClientIp(req),
      action: 'feedback_theme_created',
      metadata: {
        themeId: created.id,
        title: created.title,
      },
    });

    return res.status(201).json({ theme: serializeFeedbackTheme(created) });
  } catch (error) {
    console.error('Admin create feedback theme error:', error);
    return res.status(500).json({ error: 'Failed to create feedback theme.' });
  }
});

router.patch('/feedback/themes/:id', async (req, res) => {
  try {
    const existing = await feedbackStore.getFeedbackThemeByIdAsync(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Feedback theme not found.' });
    }

    const updates = {};
    const body = req.body || {};

    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      const title = String(body.title || '').trim();
      if (!title) {
        return res.status(400).json({ error: 'Theme title is required.' });
      }
      updates.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'summary')) {
      updates.summary = body.summary == null ? null : String(body.summary).trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'severity')) {
      const severity = String(body.severity || '').trim();
      if (!feedbackStore.SEVERITY_LEVELS.has(severity)) {
        return res.status(400).json({ error: 'Invalid theme severity.' });
      }
      updates.severity = severity;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'priorityBucket')) {
      const priorityBucket = String(body.priorityBucket || '').trim();
      if (!feedbackStore.PRIORITY_BUCKETS.has(priorityBucket)) {
        return res.status(400).json({ error: 'Invalid theme priority bucket.' });
      }
      updates.priorityBucket = priorityBucket;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      const status = String(body.status || '').trim();
      if (!feedbackStore.THEME_STATUSES.has(status)) {
        return res.status(400).json({ error: 'Invalid theme status.' });
      }
      updates.status = status;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'ownerLabel')) {
      updates.ownerLabel = body.ownerLabel == null ? null : String(body.ownerLabel).trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'externalTrackerType')) {
      updates.externalTrackerType = body.externalTrackerType == null ? null : String(body.externalTrackerType).trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'externalTrackerUrl')) {
      updates.externalTrackerUrl = body.externalTrackerUrl == null ? null : String(body.externalTrackerUrl).trim();
    }

    const updated = await feedbackStore.updateFeedbackThemeAsync(req.params.id, updates);

    await adminAuditStore.logAdminActionAsync({
      actorLabel: req.adminSession.actorLabel,
      actorIp: getClientIp(req),
      action: 'feedback_theme_updated',
      metadata: {
        themeId: req.params.id,
        status: updated?.status || null,
        priorityBucket: updated?.priority_bucket || null,
      },
    });

    return res.json({ theme: serializeFeedbackTheme(updated) });
  } catch (error) {
    console.error('Admin update feedback theme error:', error);
    return res.status(500).json({ error: 'Failed to update feedback theme.' });
  }
});

router.get('/feedback/export.csv', async (req, res) => {
  try {
    const items = await feedbackStore.listFeedbackItemsAsync(parseFeedbackItemFilters(req.query));
    const csv = buildCsv([
      { header: 'id', value: 'id' },
      { header: 'created_at', value: 'created_at' },
      { header: 'updated_at', value: 'updated_at' },
      { header: 'actor_name', value: 'actor_name' },
      { header: 'actor_email', value: 'actor_email' },
      { header: 'surface', value: 'surface' },
      { header: 'route_path', value: 'route_path' },
      { header: 'route_section', value: 'route_section' },
      { header: 'map_id', value: 'map_id' },
      { header: 'scope', value: 'scope' },
      { header: 'intent', value: 'intent' },
      { header: 'rating', value: 'rating' },
      { header: 'message', value: 'message' },
      { header: 'component_key', value: 'component_key' },
      { header: 'component_label', value: 'component_label' },
      { header: 'triage_status', value: 'triage_status' },
      { header: 'allow_follow_up', value: (row) => Number(row.allow_follow_up || 0) > 0 ? 'true' : 'false' },
      { header: 'theme_id', value: 'theme_id' },
      { header: 'theme_title', value: 'theme_title' },
      { header: 'screenshot_path', value: 'screenshot_path' },
      { header: 'dom_hint_json', value: 'dom_hint_json' },
      { header: 'context_json', value: 'context_json' },
    ], items);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vellic-feedback-items.csv"');
    return res.send(csv);
  } catch (error) {
    console.error('Admin export feedback items error:', error);
    return res.status(500).json({ error: 'Failed to export feedback items.' });
  }
});

router.get('/feedback/themes/export.csv', async (req, res) => {
  try {
    const themes = await feedbackStore.listFeedbackThemesAsync(parseFeedbackThemeFilters(req.query));
    const csv = buildCsv([
      { header: 'id', value: 'id' },
      { header: 'created_at', value: 'created_at' },
      { header: 'updated_at', value: 'updated_at' },
      { header: 'title', value: 'title' },
      { header: 'summary', value: 'summary' },
      { header: 'severity', value: 'severity' },
      { header: 'feedback_count', value: 'feedback_count' },
      { header: 'priority_bucket', value: 'priority_bucket' },
      { header: 'status', value: 'status' },
      { header: 'owner_label', value: 'owner_label' },
      { header: 'external_tracker_type', value: 'external_tracker_type' },
      { header: 'external_tracker_url', value: 'external_tracker_url' },
      { header: 'average_rating', value: 'average_rating' },
      { header: 'last_feedback_at', value: 'last_feedback_at' },
    ], themes);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vellic-feedback-themes.csv"');
    return res.send(csv);
  } catch (error) {
    console.error('Admin export feedback themes error:', error);
    return res.status(500).json({ error: 'Failed to export feedback themes.' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const query = String(req.query?.q || req.query?.query || '').trim();
    const { limit, offset } = parsePagination(req.query);
    const { sortBy, sortDirection } = parseUserSort(req.query);
    const [users, total] = await Promise.all([
      authStore.listUsersForAdminAsync({ query, limit, offset, sortBy, sortDirection }),
      authStore.countUsersForAdminAsync({ query }),
    ]);

    return res.json({
      query,
      sortBy,
      sortDirection,
      users: users.map((user) => serializeUserSummary(user)),
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    return res.status(500).json({ error: 'Failed to load users.' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await authStore.getAdminUserByIdAsync(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user: serializeUserDetail(user) });
  } catch (error) {
    console.error('Admin get user error:', error);
    return res.status(500).json({ error: 'Failed to load user.' });
  }
});

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const user = await authStore.getAdminUserByIdAsync(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Temporary password must be at least 6 characters.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await authStore.updateUserPasswordAsync(user.id, passwordHash);
    const updatedUser = await authStore.getAdminUserByIdAsync(user.id);

    await adminAuditStore.logAdminActionAsync({
      actorLabel: req.adminSession.actorLabel,
      actorIp: getClientIp(req),
      action: 'user_password_reset',
      targetUserId: user.id,
      metadata: {
        targetEmail: user.email,
      },
    });

    return res.json({
      success: true,
      user: serializeUserDetail(updatedUser),
    });
  } catch (error) {
    console.error('Admin reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password.' });
  }
});

router.post('/users/:id/disable', async (req, res) => {
  try {
    const user = await authStore.getAdminUserByIdAsync(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const reason = String(req.body?.reason || '').trim();
    await authStore.disableUserAsync(user.id, { reason: reason || null });
    const updatedUser = await authStore.getAdminUserByIdAsync(user.id);

    await adminAuditStore.logAdminActionAsync({
      actorLabel: req.adminSession.actorLabel,
      actorIp: getClientIp(req),
      action: 'user_disabled',
      targetUserId: user.id,
      metadata: {
        targetEmail: user.email,
        reason: reason || null,
      },
    });

    return res.json({
      success: true,
      user: serializeUserDetail(updatedUser),
    });
  } catch (error) {
    console.error('Admin disable user error:', error);
    return res.status(500).json({ error: 'Failed to disable user.' });
  }
});

router.post('/users/:id/reactivate', async (req, res) => {
  try {
    const user = await authStore.getAdminUserByIdAsync(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await authStore.reactivateUserAsync(user.id);
    const updatedUser = await authStore.getAdminUserByIdAsync(user.id);

    await adminAuditStore.logAdminActionAsync({
      actorLabel: req.adminSession.actorLabel,
      actorIp: getClientIp(req),
      action: 'user_reactivated',
      targetUserId: user.id,
      metadata: {
        targetEmail: user.email,
      },
    });

    return res.json({
      success: true,
      user: serializeUserDetail(updatedUser),
    });
  } catch (error) {
    console.error('Admin reactivate user error:', error);
    return res.status(500).json({ error: 'Failed to reactivate user.' });
  }
});

module.exports = router;
