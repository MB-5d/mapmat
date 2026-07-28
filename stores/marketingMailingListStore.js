const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

const EMAIL_MAX_LENGTH = 240;
const SOURCE_MAX_LENGTH = 80;
const ROUTE_PATH_MAX_LENGTH = 512;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeText(value, { maxLength = null } = {}) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeEmail(value) {
  const normalized = normalizeText(value, { maxLength: EMAIL_MAX_LENGTH });
  return normalized ? normalized.toLowerCase() : null;
}

function isValidEmail(value) {
  const normalized = normalizeEmail(value);
  return Boolean(normalized && EMAIL_REGEX.test(normalized));
}

function isUniqueConstraintError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === '23505'
    || code === 'SQLITE_CONSTRAINT_UNIQUE'
    || code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
    || message.includes('UNIQUE constraint failed')
  );
}

async function ensureMarketingMailingListSchemaAsync() {
  if (ensureSchemaPromise) return ensureSchemaPromise;

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS marketing_mailing_list_signups (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        source TEXT,
        route_path TEXT,
        status TEXT NOT NULL DEFAULT 'subscribed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.executeAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_mailing_list_email ON marketing_mailing_list_signups(email)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_marketing_mailing_list_created ON marketing_mailing_list_signups(created_at)'
    );
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

async function getSignupByEmailAsync(email) {
  await ensureMarketingMailingListSchemaAsync();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return adapter.queryOneAsync(
    'SELECT * FROM marketing_mailing_list_signups WHERE email = ?',
    [normalizedEmail]
  );
}

async function createOrGetSignupAsync({
  email,
  source = null,
  routePath = null,
} = {}) {
  await ensureMarketingMailingListSchemaAsync();
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    const error = new Error('Enter a valid email address.');
    error.status = 400;
    throw error;
  }

  const existing = await getSignupByEmailAsync(normalizedEmail);
  if (existing) {
    return { signup: existing, alreadySubscribed: true };
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  try {
    await adapter.executeAsync(`
      INSERT INTO marketing_mailing_list_signups (
        id,
        email,
        source,
        route_path,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'subscribed', ?, ?)
    `, [
      id,
      normalizedEmail,
      normalizeText(source, { maxLength: SOURCE_MAX_LENGTH }),
      normalizeText(routePath, { maxLength: ROUTE_PATH_MAX_LENGTH }),
      now,
      now,
    ]);
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const duplicate = await getSignupByEmailAsync(normalizedEmail);
    if (duplicate) {
      return { signup: duplicate, alreadySubscribed: true };
    }
    throw error;
  }

  return {
    signup: await getSignupByEmailAsync(normalizedEmail),
    alreadySubscribed: false,
  };
}

function serializeSignup(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    status: row.status || 'subscribed',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  ensureMarketingMailingListSchemaAsync,
  getSignupByEmailAsync,
  createOrGetSignupAsync,
  serializeSignup,
  normalizeEmail,
  isValidEmail,
};
