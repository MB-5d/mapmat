const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

async function findUserIdByEmail(email) {
  const row = await adapter.queryOneAsync('SELECT id FROM users WHERE email = ?', [email]);
  return row?.id || null;
}

function getUserById(userId) {
  return adapter.queryOneAsync('SELECT * FROM users WHERE id = ?', [userId]);
}

function getPublicUserById(userId) {
  return adapter.queryOneAsync('SELECT id, email, name, created_at FROM users WHERE id = ?', [userId]);
}

function getUserByEmail(email) {
  return adapter.queryOneAsync('SELECT * FROM users WHERE email = ?', [email]);
}

async function createUser({ email, passwordHash, name }) {
  const id = uuidv4();
  await adapter.executeAsync(`
    INSERT INTO users (id, email, password_hash, name)
    VALUES (?, ?, ?, ?)
  `, [id, email, passwordHash, name]);
  return await getUserById(id);
}

function updateSeedUserCredentials({ userId, passwordHash, name }) {
  return adapter.executeAsync(`
    UPDATE users
    SET password_hash = ?, name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [passwordHash, name, userId]);
}

function updateUserPassword(userId, passwordHash) {
  return adapter.executeAsync(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, userId]
  );
}

function updateUserName(userId, name) {
  return adapter.executeAsync(
    'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, userId]
  );
}

async function getUserPasswordHash(userId) {
  const row = await adapter.queryOneAsync('SELECT password_hash FROM users WHERE id = ?', [userId]);
  return row?.password_hash || null;
}

function deleteUser(userId) {
  return adapter.executeAsync('DELETE FROM users WHERE id = ?', [userId]);
}

module.exports = {
  findUserIdByEmail,
  getUserById,
  getPublicUserById,
  getUserByEmail,
  createUser,
  updateSeedUserCredentials,
  updateUserPassword,
  updateUserName,
  getUserPasswordHash,
  deleteUser,
};
