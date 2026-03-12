const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

async function findUserIdByEmailAsync(email) {
  const row = await adapter.queryOneAsync('SELECT id FROM users WHERE email = ?', [email]);
  return row?.id || null;
}

async function getUserByIdAsync(userId) {
  return await adapter.queryOneAsync('SELECT * FROM users WHERE id = ?', [userId]);
}

async function getPublicUserByIdAsync(userId) {
  return await adapter.queryOneAsync(
    'SELECT id, email, name, created_at FROM users WHERE id = ?',
    [userId]
  );
}

async function getUserByEmailAsync(email) {
  return await adapter.queryOneAsync('SELECT * FROM users WHERE email = ?', [email]);
}

async function createUserAsync({ email, passwordHash, name }) {
  const id = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO users (id, email, password_hash, name)
    VALUES (?, ?, ?, ?)
  `, [id, email, passwordHash, name]);
  return await getUserByIdAsync(id);
}

async function updateSeedUserCredentialsAsync({ userId, passwordHash, name }) {
  return await adapter.executeAsync(`
    UPDATE users
    SET password_hash = ?, name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [passwordHash, name, userId]);
}

async function updateUserPasswordAsync(userId, passwordHash) {
  return await adapter.executeAsync(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, userId]
  );
}

async function updateUserNameAsync(userId, name) {
  return await adapter.executeAsync(
    'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, userId]
  );
}

async function getUserPasswordHashAsync(userId) {
  const row = await adapter.queryOneAsync('SELECT password_hash FROM users WHERE id = ?', [userId]);
  return row?.password_hash || null;
}

async function deleteUserAsync(userId) {
  return await adapter.executeAsync('DELETE FROM users WHERE id = ?', [userId]);
}

module.exports = {
  findUserIdByEmailAsync,
  getUserByIdAsync,
  getPublicUserByIdAsync,
  getUserByEmailAsync,
  createUserAsync,
  updateSeedUserCredentialsAsync,
  updateUserPasswordAsync,
  updateUserNameAsync,
  getUserPasswordHashAsync,
  deleteUserAsync,
};
