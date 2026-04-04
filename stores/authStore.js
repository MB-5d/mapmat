const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');
const db = require('../db');

let ensureSchemaPromise = null;

async function ensureAuthSchemaAsync() {
  if (ensureSchemaPromise) return ensureSchemaPromise;

  ensureSchemaPromise = (async () => {
    if (adapter.runtime?.activeProvider === 'postgres') {
      await adapter.executeAsync('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT');
      await adapter.executeAsync("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'");
      await adapter.executeAsync('ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP');
      await adapter.executeAsync('ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_reason TEXT');
      await adapter.executeAsync("UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR TRIM(account_status) = ''");
      await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status)');
      await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)');
      await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_users_name ON users(name)');
      return;
    }

    const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
    if (!columns.includes('avatar_path')) {
      db.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT');
    }
    if (!columns.includes('account_status')) {
      db.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'");
    }
    if (!columns.includes('disabled_at')) {
      db.exec('ALTER TABLE users ADD COLUMN disabled_at DATETIME');
    }
    if (!columns.includes('disabled_reason')) {
      db.exec('ALTER TABLE users ADD COLUMN disabled_reason TEXT');
    }
    db.exec("UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR TRIM(account_status) = ''");
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_name ON users(name)');
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

async function findUserIdByEmailAsync(email) {
  await ensureAuthSchemaAsync();
  const row = await adapter.queryOneAsync('SELECT id FROM users WHERE email = ?', [email]);
  return row?.id || null;
}

async function getUserByIdAsync(userId) {
  await ensureAuthSchemaAsync();
  return await adapter.queryOneAsync('SELECT * FROM users WHERE id = ?', [userId]);
}

async function getPublicUserByIdAsync(userId) {
  await ensureAuthSchemaAsync();
  return await adapter.queryOneAsync(
    `SELECT id, email, name, avatar_path, account_status, disabled_at, disabled_reason, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [userId]
  );
}

async function getUserByEmailAsync(email) {
  await ensureAuthSchemaAsync();
  return await adapter.queryOneAsync('SELECT * FROM users WHERE email = ?', [email]);
}

async function createUserAsync({ email, passwordHash, name }) {
  await ensureAuthSchemaAsync();
  const id = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO users (id, email, password_hash, name, account_status)
    VALUES (?, ?, ?, ?, 'active')
  `, [id, email, passwordHash, name]);
  return await getUserByIdAsync(id);
}

async function updateSeedUserCredentialsAsync({ userId, passwordHash, name }) {
  await ensureAuthSchemaAsync();
  return await adapter.executeAsync(`
    UPDATE users
    SET password_hash = ?,
        name = ?,
        account_status = 'active',
        disabled_at = NULL,
        disabled_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [passwordHash, name, userId]);
}

async function updateUserPasswordAsync(userId, passwordHash) {
  await ensureAuthSchemaAsync();
  return await adapter.executeAsync(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, userId]
  );
}

async function updateUserNameAsync(userId, name) {
  await ensureAuthSchemaAsync();
  return await adapter.executeAsync(
    'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, userId]
  );
}

async function updateUserAvatarPathAsync(userId, avatarPath) {
  await ensureAuthSchemaAsync();
  return await adapter.executeAsync(
    'UPDATE users SET avatar_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [avatarPath, userId]
  );
}

async function getUserPasswordHashAsync(userId) {
  await ensureAuthSchemaAsync();
  const row = await adapter.queryOneAsync('SELECT password_hash FROM users WHERE id = ?', [userId]);
  return row?.password_hash || null;
}

async function deleteUserAsync(userId) {
  await ensureAuthSchemaAsync();
  return await adapter.executeAsync('DELETE FROM users WHERE id = ?', [userId]);
}

function buildAdminUserSearch(query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return {
      normalizedQuery: '',
      whereClause: '',
      params: [],
    };
  }

  const likeQuery = `%${normalizedQuery}%`;
  return {
    normalizedQuery,
    whereClause: `
      WHERE LOWER(email) LIKE ?
        OR LOWER(COALESCE(name, '')) LIKE ?
    `,
    params: [likeQuery, likeQuery],
  };
}

const ADMIN_USER_SORT_FIELDS = Object.freeze({
  name: "LOWER(COALESCE(name, ''))",
  email: 'LOWER(email)',
  accountStatus: "LOWER(COALESCE(account_status, 'active'))",
  updatedAt: 'updated_at',
  createdAt: 'created_at',
});

function normalizeAdminUserSort(sortBy = 'updatedAt', sortDirection = 'desc') {
  const normalizedSortBy = Object.prototype.hasOwnProperty.call(ADMIN_USER_SORT_FIELDS, sortBy)
    ? sortBy
    : 'updatedAt';
  const normalizedSortDirection = String(sortDirection || '').trim().toLowerCase() === 'asc'
    ? 'ASC'
    : 'DESC';

  return {
    sortBy: normalizedSortBy,
    sortDirection: normalizedSortDirection,
    sortSql: ADMIN_USER_SORT_FIELDS[normalizedSortBy],
  };
}

async function listUsersForAdminAsync({
  query = '',
  limit = null,
  offset = 0,
  sortBy = 'updatedAt',
  sortDirection = 'desc',
} = {}) {
  await ensureAuthSchemaAsync();
  const search = buildAdminUserSearch(query);
  const sort = normalizeAdminUserSort(sortBy, sortDirection);
  const shouldPaginate = Number.isFinite(limit) && limit > 0;
  const queryParams = [...search.params];

  if (shouldPaginate) {
    queryParams.push(limit, Math.max(offset, 0));
  }

  const rows = await adapter.queryAllAsync(
    `
      SELECT
        id,
        email,
        name,
        avatar_path,
        account_status,
        disabled_at,
        disabled_reason,
        created_at,
        updated_at
      FROM users
      ${search.whereClause}
      ORDER BY
        ${sort.sortSql} ${sort.sortDirection},
        email ASC
      ${shouldPaginate ? 'LIMIT ? OFFSET ?' : ''}
    `,
    queryParams
  );
  return rows;
}

async function countUsersForAdminAsync({ query = '' } = {}) {
  await ensureAuthSchemaAsync();
  const search = buildAdminUserSearch(query);
  const row = await adapter.queryOneAsync(
    `
      SELECT COUNT(*) AS count
      FROM users
      ${search.whereClause}
    `,
    search.params
  );
  return Number(row?.count || 0);
}

async function getAdminUserByIdAsync(userId) {
  await ensureAuthSchemaAsync();
  return await adapter.queryOneAsync(
    `
      SELECT
        id,
        email,
        name,
        avatar_path,
        account_status,
        disabled_at,
        disabled_reason,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
    `,
    [userId]
  );
}

async function disableUserAsync(userId, { reason = null } = {}) {
  await ensureAuthSchemaAsync();
  return await adapter.executeAsync(
    `
      UPDATE users
      SET account_status = 'disabled',
          disabled_at = CURRENT_TIMESTAMP,
          disabled_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [reason, userId]
  );
}

async function reactivateUserAsync(userId) {
  await ensureAuthSchemaAsync();
  return await adapter.executeAsync(
    `
      UPDATE users
      SET account_status = 'active',
          disabled_at = NULL,
          disabled_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [userId]
  );
}

module.exports = {
  ensureAuthSchemaAsync,
  findUserIdByEmailAsync,
  getUserByIdAsync,
  getPublicUserByIdAsync,
  getUserByEmailAsync,
  createUserAsync,
  updateSeedUserCredentialsAsync,
  updateUserPasswordAsync,
  updateUserNameAsync,
  updateUserAvatarPathAsync,
  getUserPasswordHashAsync,
  deleteUserAsync,
  listUsersForAdminAsync,
  countUsersForAdminAsync,
  getAdminUserByIdAsync,
  disableUserAsync,
  reactivateUserAsync,
};
