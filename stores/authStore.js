const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

const ADMIN_ROLES = Object.freeze({
  NONE: 'none',
  SUPPORT: 'support',
  PLATFORM_OWNER: 'platform_owner',
});

const ADMIN_CONSOLE_ROLES = new Set([
  ADMIN_ROLES.SUPPORT,
  ADMIN_ROLES.PLATFORM_OWNER,
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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
  return ADMIN_CONSOLE_ROLES.has(normalizeAdminRole(role));
}

function parseAdminBootstrapEmails(rawValue = process.env.ADMIN_BOOTSTRAP_EMAILS || '') {
  return Array.from(new Set(
    String(rawValue || '')
      .split(/[,\n]/)
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  ));
}

async function syncBootstrapAdminRolesAsync() {
  const bootstrapEmails = parseAdminBootstrapEmails();
  if (bootstrapEmails.length === 0) return;

  const placeholders = bootstrapEmails.map(() => '?').join(', ');
  await adapter.executeAsync(
    `
      UPDATE users
      SET admin_role = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE LOWER(email) IN (${placeholders})
        AND LOWER(COALESCE(admin_role, '')) <> ?
    `,
    [ADMIN_ROLES.PLATFORM_OWNER, ...bootstrapEmails, ADMIN_ROLES.PLATFORM_OWNER]
  );
}

async function syncBootstrapAdminRoleForEmailAsync(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  const bootstrapEmails = parseAdminBootstrapEmails();
  if (!bootstrapEmails.includes(normalizedEmail)) return;

  await adapter.executeAsync(
    `
      UPDATE users
      SET admin_role = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE LOWER(email) = ?
        AND LOWER(COALESCE(admin_role, '')) <> ?
    `,
    [ADMIN_ROLES.PLATFORM_OWNER, normalizedEmail, ADMIN_ROLES.PLATFORM_OWNER]
  );
}

async function ensureColumnAsync(table, column, type) {
  let rows = [];

  if (adapter.runtime?.activeProvider === 'postgres') {
    rows = await adapter.queryAllAsync(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ?
    `, [table]);
  } else {
    rows = await adapter.queryAllAsync(`PRAGMA table_info(${table})`);
  }

  const columns = rows.map((row) => row.column_name || row.name).filter(Boolean);
  if (!columns.includes(column)) {
    await adapter.executeAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

async function ensureAuthSchemaAsync() {
  if (ensureSchemaPromise) return ensureSchemaPromise;

  ensureSchemaPromise = (async () => {
    await ensureColumnAsync('users', 'avatar_path', 'TEXT');
    await ensureColumnAsync('users', 'account_status', "TEXT NOT NULL DEFAULT 'active'");
    await ensureColumnAsync('users', 'disabled_at', 'TIMESTAMP');
    await ensureColumnAsync('users', 'disabled_reason', 'TEXT');
    await ensureColumnAsync('users', 'admin_role', "TEXT NOT NULL DEFAULT 'none'");
    await adapter.executeAsync(
      "UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR TRIM(account_status) = ''"
    );
    await adapter.executeAsync(
      "UPDATE users SET admin_role = 'none' WHERE admin_role IS NULL OR TRIM(admin_role) = ''"
    );
    await syncBootstrapAdminRolesAsync();
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_users_admin_role ON users(admin_role)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)');
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_users_name ON users(name)');
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
  const normalizedEmail = normalizeEmail(email);
  await syncBootstrapAdminRoleForEmailAsync(normalizedEmail);
  const row = await adapter.queryOneAsync('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
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
  const normalizedEmail = normalizeEmail(email);
  await syncBootstrapAdminRoleForEmailAsync(normalizedEmail);
  return await adapter.queryOneAsync('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
}

async function createUserAsync({ email, passwordHash, name }) {
  await ensureAuthSchemaAsync();
  const id = uuidv4();
  const normalizedEmail = normalizeEmail(email);
  await adapter.executeAsync(`
    INSERT INTO users (id, email, password_hash, name, account_status)
    VALUES (?, ?, ?, ?, 'active')
  `, [id, normalizedEmail, passwordHash, name]);
  await syncBootstrapAdminRoleForEmailAsync(normalizedEmail);
  return await getUserByIdAsync(id);
}

async function updateSeedUserCredentialsAsync({ userId, passwordHash, name }) {
  await ensureAuthSchemaAsync();
  await adapter.executeAsync(`
    UPDATE users
    SET password_hash = ?,
        name = ?,
        account_status = 'active',
        disabled_at = NULL,
        disabled_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [passwordHash, name, userId]);
  const user = await getUserByIdAsync(userId);
  await syncBootstrapAdminRoleForEmailAsync(user?.email || '');
  return user;
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
        admin_role,
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
        admin_role,
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
