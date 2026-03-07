const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

function findUserIdByEmail(email) {
  const row = adapter.queryOne('SELECT id FROM users WHERE email = ?', [email]);
  return row?.id || null;
}

function getUserById(userId) {
  return adapter.queryOne('SELECT * FROM users WHERE id = ?', [userId]);
}

function getPublicUserById(userId) {
  return adapter.queryOne('SELECT id, email, name, created_at FROM users WHERE id = ?', [userId]);
}

function getUserByEmail(email) {
  return adapter.queryOne('SELECT * FROM users WHERE email = ?', [email]);
}

function createUser({ email, passwordHash, name }) {
  const id = uuidv4();
  adapter.execute(`
    INSERT INTO users (id, email, password_hash, name)
    VALUES (?, ?, ?, ?)
  `, [id, email, passwordHash, name]);
  return getUserById(id);
}

function updateSeedUserCredentials({ userId, passwordHash, name }) {
  adapter.execute(`
    UPDATE users
    SET password_hash = ?, name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [passwordHash, name, userId]);
}

function updateUserPassword(userId, passwordHash) {
  adapter.execute(
    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, userId]
  );
}

function updateUserName(userId, name) {
  adapter.execute(
    'UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, userId]
  );
}

function getUserPasswordHash(userId) {
  const row = adapter.queryOne('SELECT password_hash FROM users WHERE id = ?', [userId]);
  return row?.password_hash || null;
}

function deleteUser(userId) {
  adapter.execute('DELETE FROM users WHERE id = ?', [userId]);
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
