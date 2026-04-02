const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');
const db = require('../db');

let ensureSchemaPromise = null;

async function ensureAuthSchemaAsync() {
  if (ensureSchemaPromise) return ensureSchemaPromise;

  ensureSchemaPromise = (async () => {
    if (adapter.runtime?.activeProvider === 'postgres') {
      await adapter.executeAsync('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT');
      return;
    }

    const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
    if (!columns.includes('avatar_path')) {
      db.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT');
    }
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
    'SELECT id, email, name, avatar_path, created_at FROM users WHERE id = ?',
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
    INSERT INTO users (id, email, password_hash, name)
    VALUES (?, ?, ?, ?)
  `, [id, email, passwordHash, name]);
  return await getUserByIdAsync(id);
}

async function updateSeedUserCredentialsAsync({ userId, passwordHash, name }) {
  await ensureAuthSchemaAsync();
  return await adapter.executeAsync(`
    UPDATE users
    SET password_hash = ?, name = ?, updated_at = CURRENT_TIMESTAMP
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
};
