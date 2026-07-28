const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePurpose(purpose) {
  return String(purpose || '').trim().toLowerCase();
}

function normalizeNullableText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function serializeJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

async function ensureAuthChallengeSchemaAsync() {
  if (ensureSchemaPromise) return ensureSchemaPromise;

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS auth_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TIMESTAMP NOT NULL,
        consumed_at TIMESTAMP,
        invalidated_at TIMESTAMP,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_auth_challenges_email_purpose_created ON auth_challenges(email, purpose, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_auth_challenges_user_purpose_created ON auth_challenges(user_id, purpose, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at)'
    );
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

async function createAuthChallengeAsync({
  userId = null,
  email,
  purpose,
  secretHash,
  expiresAt,
  maxAttempts = 5,
  metadata = null,
}) {
  await ensureAuthChallengeSchemaAsync();

  const id = uuidv4();
  await adapter.executeAsync(
    `
      INSERT INTO auth_challenges (
        id,
        user_id,
        email,
        purpose,
        secret_hash,
        attempts,
        max_attempts,
        expires_at,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `,
    [
      id,
      normalizeNullableText(userId),
      normalizeEmail(email),
      normalizePurpose(purpose),
      String(secretHash || '').trim(),
      Math.max(1, Number(maxAttempts || 5)),
      normalizeTimestamp(expiresAt),
      serializeJson(metadata),
    ]
  );

  return getAuthChallengeByIdAsync(id);
}

async function getAuthChallengeByIdAsync(id) {
  await ensureAuthChallengeSchemaAsync();
  return adapter.queryOneAsync('SELECT * FROM auth_challenges WHERE id = ?', [id]);
}

async function getLatestActiveAuthChallengeAsync({ email, purpose, userId = null }) {
  await ensureAuthChallengeSchemaAsync();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = normalizePurpose(purpose);
  const normalizedUserId = normalizeNullableText(userId);

  if (normalizedUserId) {
    return adapter.queryOneAsync(
      `
        SELECT *
        FROM auth_challenges
        WHERE email = ?
          AND purpose = ?
          AND user_id = ?
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [normalizedEmail, normalizedPurpose, normalizedUserId]
    );
  }

  return adapter.queryOneAsync(
    `
      SELECT *
      FROM auth_challenges
      WHERE email = ?
        AND purpose = ?
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [normalizedEmail, normalizedPurpose]
  );
}

async function invalidateActiveAuthChallengesAsync({ email, purpose, userId = null }) {
  await ensureAuthChallengeSchemaAsync();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = normalizePurpose(purpose);
  const normalizedUserId = normalizeNullableText(userId);

  if (normalizedUserId) {
    return adapter.executeAsync(
      `
        UPDATE auth_challenges
        SET invalidated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE email = ?
          AND purpose = ?
          AND user_id = ?
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
      `,
      [normalizedEmail, normalizedPurpose, normalizedUserId]
    );
  }

  return adapter.executeAsync(
    `
      UPDATE auth_challenges
      SET invalidated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE email = ?
        AND purpose = ?
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
    `,
    [normalizedEmail, normalizedPurpose]
  );
}

async function incrementAuthChallengeAttemptsAsync(id) {
  await ensureAuthChallengeSchemaAsync();
  await adapter.executeAsync(
    `
      UPDATE auth_challenges
      SET attempts = attempts + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [id]
  );
  return getAuthChallengeByIdAsync(id);
}

async function consumeAuthChallengeAsync(id) {
  await ensureAuthChallengeSchemaAsync();
  await adapter.executeAsync(
    `
      UPDATE auth_challenges
      SET consumed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [id]
  );
  return getAuthChallengeByIdAsync(id);
}

async function invalidateAuthChallengeAsync(id) {
  await ensureAuthChallengeSchemaAsync();
  await adapter.executeAsync(
    `
      UPDATE auth_challenges
      SET invalidated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [id]
  );
  return getAuthChallengeByIdAsync(id);
}

module.exports = {
  ensureAuthChallengeSchemaAsync,
  createAuthChallengeAsync,
  getAuthChallengeByIdAsync,
  getLatestActiveAuthChallengeAsync,
  invalidateActiveAuthChallengesAsync,
  incrementAuthChallengeAttemptsAsync,
  consumeAuthChallengeAsync,
  invalidateAuthChallengeAsync,
};
