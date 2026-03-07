const db = require('../db');

function createShare({
  id,
  mapId,
  userId,
  rootData,
  orphansData,
  connectionsData,
  colors,
  connectionColors,
  expiresAt,
}) {
  db.prepare(`
    INSERT INTO shares (
      id, map_id, user_id, root_data, orphans_data, connections_data,
      colors, connection_colors, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    mapId || null,
    userId,
    rootData,
    orphansData,
    connectionsData,
    colors,
    connectionColors,
    expiresAt
  );
}

function getShareWithUserById(shareId) {
  return db.prepare(`
    SELECT s.*, u.name as shared_by_name
    FROM shares s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(shareId) || null;
}

function incrementShareViewCount(shareId) {
  db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?').run(shareId);
}

function getShareForUser(shareId, userId) {
  return db.prepare('SELECT * FROM shares WHERE id = ? AND user_id = ?')
    .get(shareId, userId) || null;
}

function deleteShare(shareId) {
  db.prepare('DELETE FROM shares WHERE id = ?').run(shareId);
}

function listSharesByUser(userId, { limit, offset }) {
  return db.prepare(`
    SELECT s.id, s.map_id, s.created_at, s.expires_at, s.view_count,
      m.name as map_name
    FROM shares s
    LEFT JOIN maps m ON s.map_id = m.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

function countSharesByUser(userId) {
  return db.prepare('SELECT COUNT(*) as count FROM shares WHERE user_id = ?')
    .get(userId)?.count || 0;
}

module.exports = {
  createShare,
  getShareWithUserById,
  incrementShareViewCount,
  getShareForUser,
  deleteShare,
  listSharesByUser,
  countSharesByUser,
};
