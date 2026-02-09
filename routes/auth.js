/**
 * Authentication routes for Map Mat
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Seed a known test user for iterative QA cycles.
function seedTestUserIfEnabled() {
  console.log(`[auth] Test auth mode: ${TEST_AUTH_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (!TEST_AUTH_ENABLED) return;
  if (!TEST_AUTH_SEED_EMAIL || !TEST_AUTH_SEED_PASSWORD) {
    console.warn('[auth] Test auth enabled but seed account variables are missing');
    return;
  }

  try {
    const passwordHash = bcrypt.hashSync(TEST_AUTH_SEED_PASSWORD, 10);
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(TEST_AUTH_SEED_EMAIL);

    if (existing) {
      db.prepare(`
        UPDATE users
        SET password_hash = ?, name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(passwordHash, TEST_AUTH_SEED_NAME, existing.id);
      console.log(`[auth] Refreshed test account credentials: ${TEST_AUTH_SEED_EMAIL}`);
      return;
    }

    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name)
      VALUES (?, ?, ?, ?)
    `).run(userId, TEST_AUTH_SEED_EMAIL, passwordHash, TEST_AUTH_SEED_NAME);

    console.log(`[auth] Seeded test account: ${TEST_AUTH_SEED_EMAIL}`);
  } catch (error) {
    console.error('[auth] Failed to seed test account:', error);
  }
}

seedTestUserIfEnabled();

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

// Auth middleware - attaches user to request if authenticated
function authMiddleware(req, res, next) {
  const token = req.cookies?.auth_token;

  if (!token) {
    req.user = null;
    return next();
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    req.user = null;
    return next();
  }

  const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(decoded.userId);
  req.user = user || null;
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
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const emailNormalized = normalizeEmail(email);

    if (!emailNormalized || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNormalized);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const userId = uuidv4();
    const displayName = name || emailNormalized.split('@')[0];

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name)
      VALUES (?, ?, ?, ?)
    `).run(userId, emailNormalized, passwordHash, displayName);

    // Generate token and set cookie
    const token = generateToken(userId);
    res.cookie('auth_token', token, COOKIE_OPTIONS);

    res.json({
      user: {
        id: userId,
        email: emailNormalized,
        name: displayName,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /auth/login - Login to existing account
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const emailNormalized = normalizeEmail(email);

    if (!emailNormalized || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailNormalized);

    // In test-auth mode, allow quick account bootstrap by logging in with a new fake account.
    if (!user && TEST_AUTH_ENABLED) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const userId = uuidv4();
      const displayName = emailNormalized.split('@')[0];
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      db.prepare(`
        INSERT INTO users (id, email, password_hash, name)
        VALUES (?, ?, ?, ?)
      `).run(userId, emailNormalized, passwordHash, displayName);

      user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailNormalized);
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
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
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      createdAt: req.user.created_at,
    },
  });
});

// PUT /auth/me - Update current user profile
router.put('/me', authMiddleware, requireAuth, async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }

      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(passwordHash, req.user.id);
    }

    // Update name if provided
    if (name !== undefined) {
      db.prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, req.user.id);
    }

    // Get updated user
    const updated = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(req.user.id);

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        createdAt: updated.created_at,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// DELETE /auth/me - Delete account
router.delete('/me', authMiddleware, requireAuth, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Delete user (cascades to projects, maps, history, shares)
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);

    res.clearCookie('auth_token', CLEAR_COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = { router, authMiddleware, requireAuth };
