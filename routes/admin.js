const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authStore = require('../stores/authStore');
const adminAuditStore = require('../stores/adminAuditStore');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_PUBLIC_DOMAIN;
const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || '').trim();
const ADMIN_CONSOLE_ENABLED = parseEnvBool(process.env.ADMIN_CONSOLE_ENABLED, false);
const ADMIN_SESSION_COOKIE = 'admin_session';
const ADMIN_SESSION_TTL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.ADMIN_SESSION_TTL_MS ?? 8 * 60 * 60 * 1000)
);
const ADMIN_SESSION_TTL_SECONDS = Math.max(300, Math.floor(ADMIN_SESSION_TTL_MS / 1000));
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET
  || `${process.env.JWT_SECRET || 'mapmat-dev-secret-change-in-production'}:${ADMIN_API_KEY || 'unset-admin-key'}`;
const ADMIN_SESSION_AUDIENCE = 'mapmat-admin-console';
const ADMIN_LOGIN_RATE_WINDOW_MS = Math.max(
  1000,
  Number(process.env.ADMIN_LOGIN_RATE_WINDOW_MS ?? 15 * 60 * 1000)
);
const ADMIN_LOGIN_RATE_LIMIT = Math.max(
  1,
  Number(process.env.ADMIN_LOGIN_RATE_LIMIT ?? (isProd ? 10 : 30))
);

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
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ error: 'Admin console is not configured.' });
  }
  return next();
}

async function ensureAdminSupportSchemaAsync() {
  await authStore.ensureAuthSchemaAsync();
  await adminAuditStore.ensureAdminAuditSchemaAsync();
}

function createAdminSessionToken({ operatorLabel }) {
  return jwt.sign(
    {
      type: 'admin_session',
      operatorLabel,
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

function sanitizeOperatorLabel(value) {
  return String(value || '').trim().slice(0, 120);
}

async function authenticateAdminSession(req, res, next) {
  const token = getAdminSessionCookie(req);
  if (!token) {
    req.adminSession = null;
    return next();
  }

  const decoded = verifyAdminSessionToken(token);
  if (!decoded?.operatorLabel || decoded.type !== 'admin_session') {
    res.clearCookie(ADMIN_SESSION_COOKIE, CLEAR_COOKIE_OPTIONS);
    req.adminSession = null;
    return next();
  }

  req.adminSession = {
    operatorLabel: sanitizeOperatorLabel(decoded.operatorLabel),
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
    operatorLabel: req.adminSession.operatorLabel,
    expiresAt: req.adminSession.expiresAt,
  });
});

router.post('/session', adminLoginLimiter, async (req, res) => {
  try {
    const operatorLabel = sanitizeOperatorLabel(req.body?.operatorLabel);
    const adminKey = String(req.body?.adminKey || '');
    const actorIp = getClientIp(req);

    if (!operatorLabel) {
      return res.status(400).json({ error: 'Operator label is required.' });
    }
    if (!adminKey) {
      return res.status(400).json({ error: 'Admin key is required.' });
    }

    if (adminKey !== ADMIN_API_KEY) {
      await adminAuditStore.logAdminActionAsync({
        actorLabel: operatorLabel,
        actorIp,
        action: 'session_login_failed',
        metadata: {
          reason: 'invalid_admin_key',
        },
      });
      return res.status(401).json({ error: 'Invalid admin key.' });
    }

    const token = createAdminSessionToken({ operatorLabel });
    res.cookie(ADMIN_SESSION_COOKIE, token, COOKIE_OPTIONS);

    await adminAuditStore.logAdminActionAsync({
      actorLabel: operatorLabel,
      actorIp,
      action: 'session_login_success',
    });

    return res.json({
      authenticated: true,
      operatorLabel,
      expiresInMs: ADMIN_SESSION_TTL_MS,
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: 'Failed to start admin session.' });
  }
});

router.delete('/session', authenticateAdminSession, async (req, res) => {
  try {
    if (req.adminSession?.operatorLabel) {
      await adminAuditStore.logAdminActionAsync({
        actorLabel: req.adminSession.operatorLabel,
        actorIp: getClientIp(req),
        action: 'session_logout',
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
      actorLabel: req.adminSession.operatorLabel,
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
      actorLabel: req.adminSession.operatorLabel,
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
      actorLabel: req.adminSession.operatorLabel,
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
