/**
 * Authentication routes for Map Mat
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authStore = require('../stores/authStore');
const { isSupportAdminEmail } = require('../utils/supportAdmin');
const { saveAvatarFromDataUrl, removeAvatarFile } = require('../utils/avatarStorage');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET;
if (isProd && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}
const JWT_SECRET_EFFECTIVE = JWT_SECRET || 'mapmat-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Cookie options
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
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
const CLEAR_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 0,
};

// Temporary test-auth mode for development/user testing.
// Disable before launch by setting TEST_AUTH_ENABLED=false (or removing it).
function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

const TEST_AUTH_ENABLED = parseEnvBool(process.env.TEST_AUTH_ENABLED, !isProd);
const TEST_AUTH_SEED_EMAIL = (process.env.TEST_AUTH_SEED_EMAIL || 'matt@email.com').trim().toLowerCase();
const TEST_AUTH_SEED_PASSWORD = process.env.TEST_AUTH_SEED_PASSWORD || 'Admin123';
const TEST_AUTH_SEED_NAME = process.env.TEST_AUTH_SEED_NAME || 'Matt Test';
const AUTH_HEADER_FALLBACK = parseEnvBool(process.env.AUTH_HEADER_FALLBACK, TEST_AUTH_ENABLED);
const AUTH_RATE_WINDOW_MS = Number(process.env.AUTH_RATE_WINDOW_MS ?? 15 * 60 * 1000);
const AUTH_LOGIN_RATE_LIMIT = Number(
  process.env.AUTH_LOGIN_RATE_LIMIT ?? (TEST_AUTH_ENABLED ? 300 : (isProd ? 50 : 150))
);
const AUTH_SIGNUP_RATE_LIMIT = Number(
  process.env.AUTH_SIGNUP_RATE_LIMIT ?? (TEST_AUTH_ENABLED ? 150 : (isProd ? 25 : 100))
);
const AUTH_PROFILE_RATE_LIMIT = Number(
  process.env.AUTH_PROFILE_RATE_LIMIT ?? (isProd ? 50 : 150)
);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function buildClientUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_path || null,
    isSupportAdmin: isSupportAdminEmail(user.email),
    createdAt: user.created_at,
  };
}

const normalizeIp = (ip) => (ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip || '');

const getClientIp = (req) => normalizeIp(req.ip || req.connection?.remoteAddress || 'unknown');

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

function createRateLimiter({ windowMs, max, name }) {
  const hits = new Map();
  let lastSweep = Date.now();
  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 15 * 60 * 1000;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;

  return (req, res, next) => {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${name}:${ip}`;
    const entry = hits.get(key);

    if (!entry || now - entry.start >= safeWindowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }

    if (entry.count >= safeMax) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.start + safeWindowMs - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      logSecurityEvent('auth_rate_limit_blocked', {
        limiter: name,
        ip,
        method: req.method,
        path: req.originalUrl || req.url,
        max: safeMax,
        windowMs: safeWindowMs,
      });
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }

    entry.count += 1;

    if (now - lastSweep >= safeWindowMs) {
      lastSweep = now;
      for (const [bucketKey, bucket] of hits.entries()) {
        if (now - bucket.start >= safeWindowMs) hits.delete(bucketKey);
      }
    }

    return next();
  };
}

const signupLimiter = createRateLimiter({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_SIGNUP_RATE_LIMIT,
  name: 'auth_signup',
});

const loginLimiter = createRateLimiter({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_LOGIN_RATE_LIMIT,
  name: 'auth_login',
});

const profileMutationLimiter = createRateLimiter({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_PROFILE_RATE_LIMIT,
  name: 'auth_profile_mutation',
});

// Seed a known test user for iterative QA cycles.
async function seedTestUserIfEnabled() {
  console.log(`[auth] Test auth mode: ${TEST_AUTH_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (!TEST_AUTH_ENABLED) return;
  if (!TEST_AUTH_SEED_EMAIL || !TEST_AUTH_SEED_PASSWORD) {
    console.warn('[auth] Test auth enabled but seed account variables are missing');
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(TEST_AUTH_SEED_PASSWORD, 10);
    const existingUserId = await authStore.findUserIdByEmailAsync(TEST_AUTH_SEED_EMAIL);

    if (existingUserId) {
      await authStore.updateSeedUserCredentialsAsync({
        userId: existingUserId,
        passwordHash,
        name: TEST_AUTH_SEED_NAME,
      });
      console.log(`[auth] Refreshed test account credentials: ${TEST_AUTH_SEED_EMAIL}`);
      return;
    }

    await authStore.createUserAsync({
      email: TEST_AUTH_SEED_EMAIL,
      passwordHash,
      name: TEST_AUTH_SEED_NAME,
    });

    console.log(`[auth] Seeded test account: ${TEST_AUTH_SEED_EMAIL}`);
  } catch (error) {
    console.error('[auth] Failed to seed test account:', error);
  }
}

seedTestUserIfEnabled().catch((error) => {
  console.error('[auth] Failed to seed test account:', error);
});
console.log(`[auth] Authorization header fallback: ${AUTH_HEADER_FALLBACK ? 'ENABLED' : 'DISABLED'}`);

// Generate JWT token
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET_EFFECTIVE, { expiresIn: JWT_EXPIRES_IN });
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET_EFFECTIVE);
  } catch {
    return null;
  }
}

function extractBearerToken(req) {
  const header = typeof req.get === 'function'
    ? (req.get('authorization') || '')
    : String(req.headers?.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function extractWebSocketProtocolToken(req) {
  if (!AUTH_HEADER_FALLBACK) return null;
  const rawHeader = typeof req.get === 'function'
    ? (req.get('sec-websocket-protocol') || '')
    : String(req.headers?.['sec-websocket-protocol'] || '');
  if (!rawHeader) return null;

  const protocols = rawHeader
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (protocols[0] !== 'mapmat-auth') return null;
  const token = protocols[1] || '';
  return token || null;
}

function parseCookieHeader(rawHeader) {
  const cookies = {};
  const header = String(rawHeader || '');
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) continue;

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function getCookieToken(req) {
  if (req.cookies && typeof req.cookies === 'object') {
    return req.cookies.auth_token || null;
  }

  const parsedCookies = parseCookieHeader(req.headers?.cookie);
  return parsedCookies.auth_token || null;
}

async function authenticateRequestAsync(req) {
  await authStore.ensureAuthSchemaAsync();
  const bearerToken = AUTH_HEADER_FALLBACK
    ? (extractBearerToken(req) || extractWebSocketProtocolToken(req))
    : null;
  const cookieToken = getCookieToken(req);
  const token = bearerToken || cookieToken;

  if (!token) {
    return null;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return null;
  }

  try {
    const user = await authStore.getPublicUserByIdAsync(decoded.userId);
    return user || null;
  } catch (error) {
    console.error('Authenticate request error:', error);
    return null;
  }
}

// Auth middleware - attaches user to request if authenticated
async function authMiddleware(req, res, next) {
  req.user = await authenticateRequestAsync(req);
  next();
}

// Require auth middleware - returns 401 if not authenticated
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// POST /auth/signup - Create new account
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    const { email, password, name } = req.body;
    const emailNormalized = normalizeEmail(email);

    if (!emailNormalized || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const existingUserId = await authStore.findUserIdByEmailAsync(emailNormalized);
    if (existingUserId) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const displayName = name || emailNormalized.split('@')[0];

    const createdUser = await authStore.createUserAsync({
      email: emailNormalized,
      passwordHash,
      name: displayName,
    });

    // Generate token and set cookie
    const token = generateToken(createdUser.id);
    res.cookie('auth_token', token, COOKIE_OPTIONS);

    res.json({
      user: buildClientUser(createdUser),
      token: AUTH_HEADER_FALLBACK ? token : undefined,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /auth/login - Login to existing account
router.post('/login', loginLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    const { email, password } = req.body;
    const emailNormalized = normalizeEmail(email);

    if (!emailNormalized || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    let user = await authStore.getUserByEmailAsync(emailNormalized);

    // In test-auth mode, allow quick account bootstrap by logging in with a new fake account.
    if (!user && TEST_AUTH_ENABLED) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const displayName = emailNormalized.split('@')[0];
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      user = await authStore.createUserAsync({
        email: emailNormalized,
        passwordHash,
        name: displayName,
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token and set cookie
    const token = generateToken(user.id);
    res.cookie('auth_token', token, COOKIE_OPTIONS);

    res.json({
      user: buildClientUser(user),
      token: AUTH_HEADER_FALLBACK ? token : undefined,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// POST /auth/logout - Logout (clear cookie)
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', CLEAR_COOKIE_OPTIONS);
  res.json({ success: true });
});

// GET /auth/me - Get current user
router.get('/me', authMiddleware, (req, res) => {
  if (!req.user) {
    return res.json({ user: null });
  }

  res.json({
    user: buildClientUser(req.user),
  });
});

// PUT /auth/me - Update current user profile
router.put('/me', authMiddleware, requireAuth, profileMutationLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    const { name, currentPassword, newPassword } = req.body;

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }

      const passwordHashCurrent = await authStore.getUserPasswordHashAsync(req.user.id);
      const isValid = await bcrypt.compare(currentPassword, passwordHashCurrent || '');
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      await authStore.updateUserPasswordAsync(req.user.id, passwordHash);
    }

    // Update name if provided
    if (name !== undefined) {
      await authStore.updateUserNameAsync(req.user.id, name);
    }

    // Get updated user
    const updated = await authStore.getPublicUserByIdAsync(req.user.id);

    res.json({
      user: buildClientUser(updated),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/me/avatar', authMiddleware, requireAuth, profileMutationLimiter, async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl) {
      return res.status(400).json({ error: 'Avatar image is required.' });
    }

    const nextAvatarPath = await saveAvatarFromDataUrl({
      userId: req.user.id,
      imageDataUrl,
    });

    if (req.user?.avatar_path) {
      await removeAvatarFile(req.user.avatar_path);
    }

    await authStore.updateUserAvatarPathAsync(req.user.id, nextAvatarPath);
    const updated = await authStore.getPublicUserByIdAsync(req.user.id);
    res.json({ user: buildClientUser(updated) });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(error?.status || 500).json({ error: error?.message || 'Failed to upload avatar' });
  }
});

router.delete('/me/avatar', authMiddleware, requireAuth, profileMutationLimiter, async (req, res) => {
  try {
    if (req.user?.avatar_path) {
      await removeAvatarFile(req.user.avatar_path);
    }
    await authStore.updateUserAvatarPathAsync(req.user.id, null);
    const updated = await authStore.getPublicUserByIdAsync(req.user.id);
    res.json({ user: buildClientUser(updated) });
  } catch (error) {
    console.error('Remove avatar error:', error);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

// DELETE /auth/me - Delete account
router.delete('/me', authMiddleware, requireAuth, profileMutationLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }

    const passwordHashCurrent = await authStore.getUserPasswordHashAsync(req.user.id);
    const isValid = await bcrypt.compare(password, passwordHashCurrent || '');
    if (!isValid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Delete user (cascades to projects, maps, history, shares)
    await authStore.deleteUserAsync(req.user.id);

    res.clearCookie('auth_token', CLEAR_COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = { router, authMiddleware, requireAuth, authenticateRequestAsync };
