const { v4: uuidv4 } = require('uuid');
const db = require('../db');

function findUserIdByEmail(email) {
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  return row?.id || null;
}

function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}

function getPublicUserById(userId) {
  return db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(userId) || null;
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

function createUser({ email, passwordHash, name }) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name)
    VALUES (?, ?, ?, ?)
  `).run(id, email, passwordHash, name);
  return getUserById(id);
}

function updateSeedUserCredentials({ userId, passwordHash, name }) {
  db.prepare(`
    UPDATE users
    SET password_hash = ?, name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(passwordHash, name, userId);
}

function updateUserPassword(userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(passwordHash, userId);
}

function updateUserName(userId, name) {
  db.prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(name, userId);
}

function getUserPasswordHash(userId) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  return row?.password_hash || null;
}

function deleteUser(userId) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
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
