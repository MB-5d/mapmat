/**
 * Authentication routes for Vellic
 */

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authStore = require('../stores/authStore');
const authChallengeStore = require('../stores/authChallengeStore');
const { queueTemplatedEmailAsync } = require('../utils/emailDelivery');
const { EMAIL_TEMPLATE_KEYS, getDefaultAppBaseUrl } = require('../utils/emailTemplates');
const { saveAvatarFromDataUrl, removeAvatarFile } = require('../utils/avatarStorage');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
if (isProd && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}
const JWT_SECRET_EFFECTIVE = JWT_SECRET || 'mapmat-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

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
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const CLEAR_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 0,
};
const GOOGLE_STATE_COOKIE = 'mapmat_google_state';
const GOOGLE_STATE_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  sameSite: 'lax',
  maxAge: 10 * 60 * 1000,
};

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
const AUTH_VERIFY_RATE_LIMIT = Number(process.env.AUTH_VERIFY_RATE_LIMIT ?? (isProd ? 40 : 120));
const AUTH_RESEND_RATE_LIMIT = Number(process.env.AUTH_RESEND_RATE_LIMIT ?? (isProd ? 20 : 80));
const AUTH_FORGOT_RATE_LIMIT = Number(process.env.AUTH_FORGOT_RATE_LIMIT ?? (isProd ? 20 : 80));
const AUTH_RESET_RATE_LIMIT = Number(process.env.AUTH_RESET_RATE_LIMIT ?? (isProd ? 30 : 100));
const AUTH_GOOGLE_RATE_LIMIT = Number(process.env.AUTH_GOOGLE_RATE_LIMIT ?? (isProd ? 50 : 150));

const AUTH_CHALLENGE_PURPOSES = Object.freeze({
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
});
const AUTH_CODE_LENGTH = 6;
const AUTH_CHALLENGE_MAX_ATTEMPTS = Math.max(
  3,
  Number(process.env.AUTH_CHALLENGE_MAX_ATTEMPTS ?? 5)
);
const AUTH_EMAIL_VERIFICATION_TTL_MINUTES = Math.max(
  5,
  Number(process.env.AUTH_EMAIL_VERIFICATION_TTL_MINUTES ?? 10)
);
const AUTH_PASSWORD_RESET_TTL_MINUTES = Math.max(
  5,
  Number(process.env.AUTH_PASSWORD_RESET_TTL_MINUTES ?? 15)
);

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REDIRECT_URI = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
const GOOGLE_AUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const GOOGLE_AUTH_SCOPES = 'openid email profile';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

let googleJwksCache = {
  expiresAt: 0,
  keys: new Map(),
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeIp(ip) {
  return ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip || '';
}

function getClientIp(req) {
  return normalizeIp(req.ip || req.connection?.remoteAddress || 'unknown');
}

function normalizeStoredAuthProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['password', 'google', 'password+google'].includes(normalized)) {
    return normalized;
  }
  return 'password';
}

function normalizeAuthProviderForClient(value) {
  const normalized = normalizeStoredAuthProvider(value);
  return normalized === 'password+google' ? 'google' : normalized;
}

function isUserEmailVerified(user) {
  if (!user) return false;
  return !!user.email_verified_at || !Boolean(Number(user.email_verification_required || 0));
}

function buildClientUser(user) {
  if (!user) return null;

  const hasPassword = user.has_password !== undefined
    ? Boolean(Number(user.has_password))
    : !!String(user.password_hash || '').trim();
  const emailVerified = isUserEmailVerified(user);
  const authProvider = normalizeAuthProviderForClient(user.auth_provider);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_path || null,
    createdAt: user.created_at,
    emailVerified,
    emailVerifiedAt: user.email_verified_at || null,
    authProvider,
    authMode: authProvider,
    hasPassword,
  };
}

function isAccountDisabled(user) {
  return String(user?.account_status || 'active').trim().toLowerCase() === 'disabled';
}

function isVerificationPending(user) {
  return !!user && !isUserEmailVerified(user);
}

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

const verifyLimiter = createRateLimiter({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_VERIFY_RATE_LIMIT,
  name: 'auth_verify_email',
});

const resendLimiter = createRateLimiter({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_RESEND_RATE_LIMIT,
  name: 'auth_resend_verification',
});

const forgotPasswordLimiter = createRateLimiter({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_FORGOT_RATE_LIMIT,
  name: 'auth_forgot_password',
});

const resetPasswordLimiter = createRateLimiter({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_RESET_RATE_LIMIT,
  name: 'auth_reset_password',
});

const googleAuthLimiter = createRateLimiter({
  windowMs: AUTH_RATE_WINDOW_MS,
  max: AUTH_GOOGLE_RATE_LIMIT,
  name: 'auth_google',
});

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET_EFFECTIVE, { expiresIn: JWT_EXPIRES_IN });
}

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

function issueSessionCookie(res, user) {
  const token = generateToken(user.id);
  res.cookie('auth_token', token, COOKIE_OPTIONS);
  return token;
}

function clearSessionCookie(res) {
  res.clearCookie('auth_token', CLEAR_COOKIE_OPTIONS);
}

function hashSecret(secret) {
  return crypto
    .createHmac('sha256', JWT_SECRET_EFFECTIVE)
    .update(String(secret || '').trim())
    .digest('hex');
}

function compareSecret(secret, expectedHash) {
  const left = Buffer.from(hashSecret(secret), 'utf8');
  const right = Buffer.from(String(expectedHash || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function generateNumericCode(length = AUTH_CODE_LENGTH) {
  const digits = [];
  for (let index = 0; index < length; index += 1) {
    digits.push(String(crypto.randomInt(0, 10)));
  }
  return digits.join('');
}

function getExpiryTimestamp(minutes) {
  return new Date(Date.now() + (minutes * 60 * 1000)).toISOString();
}

function buildRequestBaseUrl(req) {
  const protocol = req.protocol || 'http';
  const host = req.get('host');
  return `${protocol}://${host}`;
}

function getGoogleRedirectUri(req) {
  if (GOOGLE_REDIRECT_URI) return GOOGLE_REDIRECT_URI;
  return new URL('/auth/google/callback', `${buildRequestBaseUrl(req)}/`).toString();
}

function buildSafeNextPath(rawNextPath) {
  const fallback = '/app';
  const normalized = String(rawNextPath || '').trim();
  if (!normalized) return fallback;
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return fallback;
  return normalized;
}

function createGoogleState(nextPath) {
  const payload = {
    type: 'google_oauth_state',
    nextPath: buildSafeNextPath(nextPath),
    nonce: crypto.randomUUID(),
  };

  return {
    payload,
    token: jwt.sign(payload, JWT_SECRET_EFFECTIVE, { expiresIn: '10m' }),
  };
}

function verifyGoogleState(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);
    if (decoded?.type !== 'google_oauth_state') return null;
    return decoded;
  } catch {
    return null;
  }
}

function buildAuthRedirectUrl(nextPath, params = {}) {
  const appBaseUrl = getDefaultAppBaseUrl();
  const targetUrl = new URL(buildSafeNextPath(nextPath), `${appBaseUrl}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    targetUrl.searchParams.set(key, String(value));
  });
  return targetUrl.toString();
}

function redirectWithGoogleError(res, nextPath, errorCode) {
  return res.redirect(buildAuthRedirectUrl(nextPath, {
    auth_error: errorCode,
    auth_provider: 'google',
  }));
}

function normalizeGoogleAudience(audienceClaim) {
  if (Array.isArray(audienceClaim)) {
    return audienceClaim
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  const normalized = String(audienceClaim || '').trim();
  return normalized ? [normalized] : [];
}

function parseNumericClaim(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeBase64UrlJson(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
}

function decodeBase64UrlBuffer(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
  return Buffer.from(normalized, 'base64');
}

function getCacheMaxAgeMs(headers) {
  const cacheControl = String(headers?.get?.('cache-control') || '');
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 300;
  return Math.max(60, Math.min(maxAgeSeconds, 3600)) * 1000;
}

async function getGoogleSigningKeyAsync(keyId) {
  const normalizedKeyId = String(keyId || '').trim();
  if (!normalizedKeyId) throw new Error('Missing Google token key id');

  const now = Date.now();
  if (googleJwksCache.expiresAt > now && googleJwksCache.keys.has(normalizedKeyId)) {
    return googleJwksCache.keys.get(normalizedKeyId);
  }

  const response = await fetch(GOOGLE_JWKS_URL);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.keys)) {
    throw new Error('Unable to load Google signing keys');
  }

  const keys = new Map();
  payload.keys.forEach((key) => {
    if (key?.kid && key?.kty === 'RSA') {
      keys.set(String(key.kid), crypto.createPublicKey({ key, format: 'jwk' }));
    }
  });
  googleJwksCache = {
    expiresAt: now + getCacheMaxAgeMs(response.headers),
    keys,
  };

  const signingKey = keys.get(normalizedKeyId);
  if (!signingKey) throw new Error('Google signing key not found');
  return signingKey;
}

async function verifyGoogleIdTokenAsync(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid Google ID token');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeBase64UrlJson(encodedHeader);
  if (header.alg !== 'RS256') throw new Error('Unsupported Google token algorithm');

  const signingKey = await getGoogleSigningKeyAsync(header.kid);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const isValid = verifier.verify(signingKey, decodeBase64UrlBuffer(encodedSignature));
  if (!isValid) throw new Error('Invalid Google token signature');

  return decodeBase64UrlJson(encodedPayload);
}

async function exchangeGoogleCodeAsync({ code, redirectUri }) {
  const payload = new URLSearchParams({
    code: String(code || ''),
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error_description || data?.error || 'Google token exchange failed');
    error.providerResponse = data;
    throw error;
  }

  return data;
}

async function queueEmailVerificationCodeAsync(user) {
  const code = generateNumericCode();
  const expiresAt = getExpiryTimestamp(AUTH_EMAIL_VERIFICATION_TTL_MINUTES);

  await authChallengeStore.invalidateActiveAuthChallengesAsync({
    userId: user.id,
    email: user.email,
    purpose: AUTH_CHALLENGE_PURPOSES.EMAIL_VERIFICATION,
  });

  await authChallengeStore.createAuthChallengeAsync({
    userId: user.id,
    email: user.email,
    purpose: AUTH_CHALLENGE_PURPOSES.EMAIL_VERIFICATION,
    secretHash: hashSecret(code),
    expiresAt,
    maxAttempts: AUTH_CHALLENGE_MAX_ATTEMPTS,
    metadata: {
      template: EMAIL_TEMPLATE_KEYS.AUTH_EMAIL_VERIFICATION,
    },
  });

  await queueTemplatedEmailAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.AUTH_EMAIL_VERIFICATION,
    toEmail: user.email,
    userId: user.id,
    payload: {
      appBaseUrl: getDefaultAppBaseUrl(),
      name: user.name || null,
      code,
      expiresMinutes: AUTH_EMAIL_VERIFICATION_TTL_MINUTES,
    },
  });

  return {
    expiresAt,
    expiresInMinutes: AUTH_EMAIL_VERIFICATION_TTL_MINUTES,
  };
}

async function queuePasswordResetCodeAsync(user) {
  const code = generateNumericCode();
  const expiresAt = getExpiryTimestamp(AUTH_PASSWORD_RESET_TTL_MINUTES);

  await authChallengeStore.invalidateActiveAuthChallengesAsync({
    userId: user.id,
    email: user.email,
    purpose: AUTH_CHALLENGE_PURPOSES.PASSWORD_RESET,
  });

  await authChallengeStore.createAuthChallengeAsync({
    userId: user.id,
    email: user.email,
    purpose: AUTH_CHALLENGE_PURPOSES.PASSWORD_RESET,
    secretHash: hashSecret(code),
    expiresAt,
    maxAttempts: AUTH_CHALLENGE_MAX_ATTEMPTS,
    metadata: {
      template: EMAIL_TEMPLATE_KEYS.AUTH_PASSWORD_RESET,
    },
  });

  await queueTemplatedEmailAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.AUTH_PASSWORD_RESET,
    toEmail: user.email,
    userId: user.id,
    payload: {
      appBaseUrl: getDefaultAppBaseUrl(),
      name: user.name || null,
      code,
      expiresMinutes: AUTH_PASSWORD_RESET_TTL_MINUTES,
    },
  });

  return {
    expiresAt,
    expiresInMinutes: AUTH_PASSWORD_RESET_TTL_MINUTES,
  };
}

async function validateChallengeAsync({ email, purpose, code, userId = null }) {
  const challenge = await authChallengeStore.getLatestActiveAuthChallengeAsync({
    userId,
    email,
    purpose,
  });

  if (!challenge) {
    return {
      ok: false,
      status: 400,
      code: 'AUTH_CODE_REQUIRED',
      error: 'Request a new code and try again.',
    };
  }

  const expiresAt = new Date(challenge.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await authChallengeStore.invalidateAuthChallengeAsync(challenge.id);
    return {
      ok: false,
      status: 400,
      code: 'AUTH_CODE_EXPIRED',
      error: 'That code expired. Request a new one and try again.',
    };
  }

  if (Number(challenge.attempts || 0) >= Number(challenge.max_attempts || AUTH_CHALLENGE_MAX_ATTEMPTS)) {
    await authChallengeStore.invalidateAuthChallengeAsync(challenge.id);
    return {
      ok: false,
      status: 429,
      code: 'AUTH_CODE_TOO_MANY_ATTEMPTS',
      error: 'Too many incorrect code attempts. Request a new code and try again.',
    };
  }

  if (!compareSecret(code, challenge.secret_hash)) {
    const updatedChallenge = await authChallengeStore.incrementAuthChallengeAttemptsAsync(challenge.id);
    if (Number(updatedChallenge?.attempts || 0) >= Number(updatedChallenge?.max_attempts || AUTH_CHALLENGE_MAX_ATTEMPTS)) {
      await authChallengeStore.invalidateAuthChallengeAsync(challenge.id);
    }
    return {
      ok: false,
      status: 400,
      code: 'AUTH_CODE_INVALID',
      error: 'That code is incorrect.',
    };
  }

  await authChallengeStore.consumeAuthChallengeAsync(challenge.id);
  return {
    ok: true,
    challenge,
  };
}

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
      emailVerifiedAt: new Date().toISOString(),
      emailVerificationRequired: false,
      authProvider: 'password',
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
console.log(`[auth] Google auth: ${GOOGLE_AUTH_ENABLED ? 'ENABLED' : 'DISABLED'}`);

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
    if (!user || isAccountDisabled(user)) {
      return null;
    }
    return user;
  } catch (error) {
    console.error('Authenticate request error:', error);
    return null;
  }
}

async function authMiddleware(req, res, next) {
  req.user = await authenticateRequestAsync(req);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

router.post('/signup', signupLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    await authChallengeStore.ensureAuthChallengeSchemaAsync();
    const { email, password, name } = req.body || {};
    const emailNormalized = normalizeEmail(email);

    if (!emailNormalized || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await authStore.getUserByEmailAsync(emailNormalized);
    if (existingUser) {
      if (isVerificationPending(existingUser)) {
        return res.status(409).json({
          error: 'This account is waiting for email verification.',
          code: 'EMAIL_NOT_VERIFIED',
          email: emailNormalized,
          canResendVerification: true,
        });
      }
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const displayName = String(name || '').trim() || emailNormalized.split('@')[0];

    const createdUser = await authStore.createUserAsync({
      email: emailNormalized,
      passwordHash,
      name: displayName,
      emailVerificationRequired: true,
      authProvider: 'password',
    });

    const verificationState = await queueEmailVerificationCodeAsync(createdUser);

    res.json({
      pendingVerification: true,
      verificationRequired: true,
      email: createdUser.email,
      expiresInMinutes: verificationState.expiresInMinutes,
      codeLength: AUTH_CODE_LENGTH,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/verify-email', verifyLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    await authChallengeStore.ensureAuthChallengeSchemaAsync();

    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required.' });
    }

    const user = await authStore.getUserByEmailAsync(email);
    if (!user) {
      return res.status(400).json({
        error: 'That verification code is invalid.',
        code: 'AUTH_CODE_INVALID',
      });
    }

    if (isAccountDisabled(user)) {
      return res.status(403).json({
        error: 'This account has been disabled. Contact support for help reactivating it.',
      });
    }

    if (!isVerificationPending(user)) {
      return res.status(400).json({
        error: 'This email is already verified. Log in to continue.',
        code: 'EMAIL_ALREADY_VERIFIED',
      });
    }

    const verification = await validateChallengeAsync({
      userId: user.id,
      email,
      purpose: AUTH_CHALLENGE_PURPOSES.EMAIL_VERIFICATION,
      code,
    });

    if (!verification.ok) {
      return res.status(verification.status).json({
        error: verification.error,
        code: verification.code,
        canResendVerification: true,
      });
    }

    await authStore.markUserEmailVerifiedAsync(user.id);
    await authChallengeStore.invalidateActiveAuthChallengesAsync({
      userId: user.id,
      email,
      purpose: AUTH_CHALLENGE_PURPOSES.EMAIL_VERIFICATION,
    });

    const updatedUser = await authStore.getPublicUserByIdAsync(user.id);
    const token = issueSessionCookie(res, updatedUser);

    res.json({
      user: buildClientUser(updatedUser),
      token: AUTH_HEADER_FALLBACK ? token : undefined,
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

router.post('/resend-verification', resendLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    await authChallengeStore.ensureAuthChallengeSchemaAsync();

    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await authStore.getUserByEmailAsync(email);
    if (user && !isAccountDisabled(user) && isVerificationPending(user)) {
      await queueEmailVerificationCodeAsync(user);
    }

    return res.json({
      success: true,
      email,
      expiresInMinutes: AUTH_EMAIL_VERIFICATION_TTL_MINUTES,
      codeLength: AUTH_CODE_LENGTH,
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification code' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    const { email, password } = req.body || {};
    const emailNormalized = normalizeEmail(email);

    if (!emailNormalized || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    let user = await authStore.getUserByEmailAsync(emailNormalized);

    if (!user && TEST_AUTH_ENABLED) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const displayName = emailNormalized.split('@')[0];
      const passwordHash = await bcrypt.hash(password, 10);
      user = await authStore.createUserAsync({
        email: emailNormalized,
        passwordHash,
        name: displayName,
        emailVerifiedAt: new Date().toISOString(),
        emailVerificationRequired: false,
        authProvider: 'password',
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (isAccountDisabled(user)) {
      return res.status(403).json({
        error: 'This account has been disabled. Contact support for help reactivating it.',
      });
    }

    if (isVerificationPending(user)) {
      return res.status(403).json({
        error: 'Check your email for a verification code before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
        email: emailNormalized,
        canResendVerification: true,
      });
    }

    const passwordHashCurrent = String(user.password_hash || '');
    if (!passwordHashCurrent) {
      return res.status(401).json({
        error: 'This account does not have a password yet. Use Google sign-in or reset your password.',
        code: 'PASSWORD_LOGIN_UNAVAILABLE',
      });
    }

    const isValid = await bcrypt.compare(password, passwordHashCurrent);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const publicUser = await authStore.getPublicUserByIdAsync(user.id);
    const token = issueSessionCookie(res, publicUser);

    res.json({
      user: buildClientUser(publicUser),
      token: AUTH_HEADER_FALLBACK ? token : undefined,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    await authChallengeStore.ensureAuthChallengeSchemaAsync();

    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await authStore.getUserByEmailAsync(email);
    if (user && !isAccountDisabled(user)) {
      await queuePasswordResetCodeAsync(user);
    }

    return res.json({
      success: true,
      message: 'If an account exists for that email, a reset code has been sent.',
      expiresInMinutes: AUTH_PASSWORD_RESET_TTL_MINUTES,
      codeLength: AUTH_CODE_LENGTH,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to start password reset' });
  }
});

router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    await authChallengeStore.ensureAuthChallengeSchemaAsync();

    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = await authStore.getUserByEmailAsync(email);
    if (!user) {
      return res.status(400).json({
        error: 'That reset code is invalid.',
        code: 'AUTH_CODE_INVALID',
      });
    }

    if (isAccountDisabled(user)) {
      return res.status(403).json({
        error: 'This account has been disabled. Contact support for help reactivating it.',
      });
    }

    const resetValidation = await validateChallengeAsync({
      userId: user.id,
      email,
      purpose: AUTH_CHALLENGE_PURPOSES.PASSWORD_RESET,
      code,
    });

    if (!resetValidation.ok) {
      return res.status(resetValidation.status).json({
        error: resetValidation.error,
        code: resetValidation.code,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await authStore.updateUserPasswordAsync(user.id, passwordHash);
    if (!isUserEmailVerified(user)) {
      await authStore.markUserEmailVerifiedAsync(user.id);
    }
    await authChallengeStore.invalidateActiveAuthChallengesAsync({
      userId: user.id,
      email,
      purpose: AUTH_CHALLENGE_PURPOSES.PASSWORD_RESET,
    });

    const updatedUser = await authStore.getPublicUserByIdAsync(user.id);
    const token = issueSessionCookie(res, updatedUser);

    res.json({
      user: buildClientUser(updatedUser),
      token: AUTH_HEADER_FALLBACK ? token : undefined,
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.get('/config', (_req, res) => {
  res.json({
    googleAuthEnabled: GOOGLE_AUTH_ENABLED,
  });
});

router.get('/google/start', googleAuthLimiter, async (req, res) => {
  const nextPath = buildSafeNextPath(req.query?.next);

  if (!GOOGLE_AUTH_ENABLED) {
    return redirectWithGoogleError(res, nextPath, 'google_not_configured');
  }

  try {
    const googleState = createGoogleState(nextPath);
    const stateToken = googleState.token;
    res.cookie(GOOGLE_STATE_COOKIE, stateToken, GOOGLE_STATE_COOKIE_OPTIONS);

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', getGoogleRedirectUri(req));
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_AUTH_SCOPES);
    authUrl.searchParams.set('state', stateToken);
    authUrl.searchParams.set('nonce', googleState.payload.nonce);
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('prompt', 'select_account');

    return res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Google auth start error:', error);
    return redirectWithGoogleError(res, nextPath, 'google_start_failed');
  }
});

router.get('/google/callback', googleAuthLimiter, async (req, res) => {
  const cookieState = req.cookies?.[GOOGLE_STATE_COOKIE] || null;
  const state = typeof req.query?.state === 'string' ? req.query.state : '';
  const decodedState = cookieState && state && cookieState === state
    ? verifyGoogleState(state)
    : null;
  const nextPath = buildSafeNextPath(decodedState?.nextPath || '/app');

  res.clearCookie(GOOGLE_STATE_COOKIE, { ...CLEAR_COOKIE_OPTIONS, sameSite: 'lax' });

  if (!GOOGLE_AUTH_ENABLED) {
    return redirectWithGoogleError(res, nextPath, 'google_not_configured');
  }

  if (!decodedState) {
    return redirectWithGoogleError(res, nextPath, 'google_state_invalid');
  }

  if (req.query?.error) {
    return redirectWithGoogleError(res, nextPath, String(req.query.error));
  }

  const code = String(req.query?.code || '').trim();
  if (!code) {
    return redirectWithGoogleError(res, nextPath, 'google_code_missing');
  }

  try {
    await authStore.ensureAuthSchemaAsync();
    const tokenData = await exchangeGoogleCodeAsync({
      code,
      redirectUri: getGoogleRedirectUri(req),
    });

    const idToken = String(tokenData.id_token || '').trim();
    if (!idToken) {
      return redirectWithGoogleError(res, nextPath, 'google_profile_invalid');
    }

    const googleProfile = await verifyGoogleIdTokenAsync(idToken);
    const googleEmail = normalizeEmail(googleProfile.email);
    const googleSub = String(googleProfile.sub || '').trim();
    const googleName = String(googleProfile.name || '').trim();
    const googleEmailVerified = googleProfile.email_verified === true || googleProfile.email_verified === 'true';
    const googleNonce = String(googleProfile.nonce || '').trim();
    const stateNonce = String(decodedState.nonce || '').trim();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const audience = normalizeGoogleAudience(googleProfile.aud);
    const audienceMatches = audience.includes(GOOGLE_CLIENT_ID);
    const authorizedParty = String(googleProfile.azp || '').trim();
    const authorizedPartyMatches = audience.length <= 1 || authorizedParty === GOOGLE_CLIENT_ID;
    const issuerMatches = ['accounts.google.com', 'https://accounts.google.com'].includes(String(googleProfile.iss || '').trim());
    const nonceMatches = !!googleNonce && googleNonce === stateNonce;
    const expiresAtSeconds = parseNumericClaim(googleProfile.exp);
    const expiresAtValid = expiresAtSeconds !== null && expiresAtSeconds > nowSeconds;
    const issuedAtSeconds = parseNumericClaim(googleProfile.iat);
    const issuedAtValid = issuedAtSeconds === null || issuedAtSeconds <= nowSeconds + 60;
    const notBeforeSeconds = parseNumericClaim(googleProfile.nbf);
    const notBeforeValid = notBeforeSeconds === null || notBeforeSeconds <= nowSeconds + 60;

    if (
      !googleSub
      || !googleEmail
      || !googleEmailVerified
      || !audienceMatches
      || !authorizedPartyMatches
      || !issuerMatches
      || !nonceMatches
      || !expiresAtValid
      || !issuedAtValid
      || !notBeforeValid
    ) {
      return redirectWithGoogleError(res, nextPath, 'google_profile_invalid');
    }

    let user = await authStore.getUserByGoogleSubAsync(googleSub);
    if (user && isAccountDisabled(user)) {
      return redirectWithGoogleError(res, nextPath, 'account_disabled');
    }

    if (!user) {
      const matchingEmailUser = await authStore.getUserByEmailAsync(googleEmail);

      if (matchingEmailUser) {
        if (isAccountDisabled(matchingEmailUser)) {
          return redirectWithGoogleError(res, nextPath, 'account_disabled');
        }

        if (matchingEmailUser.google_sub && String(matchingEmailUser.google_sub).trim() !== googleSub) {
          return redirectWithGoogleError(res, nextPath, 'google_account_conflict');
        }

        user = await authStore.linkGoogleIdentityAsync(matchingEmailUser.id, {
          googleSub,
          verifiedAt: new Date().toISOString(),
          name: googleName || matchingEmailUser.name,
        });
      } else {
        user = await authStore.createUserAsync({
          email: googleEmail,
          passwordHash: '',
          name: googleName || googleEmail.split('@')[0],
          emailVerifiedAt: new Date().toISOString(),
          emailVerificationRequired: false,
          googleSub,
          authProvider: 'google',
        });
      }
    } else {
      user = await authStore.linkGoogleIdentityAsync(user.id, {
        googleSub,
        verifiedAt: new Date().toISOString(),
        name: googleName || user.name,
      });
    }

    const publicUser = await authStore.getPublicUserByIdAsync(user.id);
    issueSessionCookie(res, publicUser);

    return res.redirect(buildAuthRedirectUrl(nextPath, {
      auth_success: 'google',
      auth_provider: 'google',
    }));
  } catch (error) {
    console.error('Google auth callback error:', error);
    return redirectWithGoogleError(res, nextPath, 'google_callback_failed');
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.clearCookie(GOOGLE_STATE_COOKIE, { ...CLEAR_COOKIE_OPTIONS, sameSite: 'lax' });
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req, res) => {
  if (!req.user) {
    return res.json({ user: null });
  }

  return res.json({
    user: buildClientUser(req.user),
  });
});

router.put('/me', authMiddleware, requireAuth, profileMutationLimiter, async (req, res) => {
  try {
    await authStore.ensureAuthSchemaAsync();
    const { name, currentPassword, newPassword } = req.body || {};

    if (newPassword) {
      const passwordHashCurrent = await authStore.getUserPasswordHashAsync(req.user.id);
      const hasPassword = !!String(passwordHashCurrent || '');

      if (hasPassword) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password is required to change password' });
        }

        const isValid = await bcrypt.compare(currentPassword, passwordHashCurrent || '');
        if (!isValid) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await authStore.updateUserPasswordAsync(req.user.id, passwordHash);
    }

    if (name !== undefined) {
      await authStore.updateUserNameAsync(req.user.id, name);
    }

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

router.delete('/me', authMiddleware, requireAuth, profileMutationLimiter, async (req, res) => {
  try {
    const { password } = req.body || {};
    const passwordHashCurrent = await authStore.getUserPasswordHashAsync(req.user.id);
    const hasPassword = !!String(passwordHashCurrent || '');

    if (hasPassword) {
      if (!password) {
        return res.status(400).json({ error: 'Password is required to delete account' });
      }

      const isValid = await bcrypt.compare(password, passwordHashCurrent || '');
      if (!isValid) {
        return res.status(401).json({ error: 'Password is incorrect' });
      }
    }

    await authStore.deleteUserAsync(req.user.id);
    clearSessionCookie(res);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = { router, authMiddleware, requireAuth, authenticateRequestAsync };
