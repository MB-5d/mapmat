const adapter = require('./dbAdapter');

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
  adapter.execute(`
    INSERT INTO shares (
      id, map_id, user_id, root_data, orphans_data, connections_data,
      colors, connection_colors, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    mapId || null,
    userId,
    rootData,
    orphansData,
    connectionsData,
    colors,
    connectionColors,
    expiresAt,
  ]);
}

function getShareWithUserById(shareId) {
  return adapter.queryOne(`
    SELECT s.*, u.name as shared_by_name
    FROM shares s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `, [shareId]);
}

function incrementShareViewCount(shareId) {
  adapter.execute('UPDATE shares SET view_count = view_count + 1 WHERE id = ?', [shareId]);
}

function getShareForUser(shareId, userId) {
  return adapter.queryOne('SELECT * FROM shares WHERE id = ? AND user_id = ?', [shareId, userId]);
}

function deleteShare(shareId) {
  adapter.execute('DELETE FROM shares WHERE id = ?', [shareId]);
}

function listSharesByUser(userId, { limit, offset }) {
  return adapter.queryAll(`
    SELECT s.id, s.map_id, s.created_at, s.expires_at, s.view_count,
      m.name as map_name
    FROM shares s
    LEFT JOIN maps m ON s.map_id = m.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, limit, offset]);
}

function countSharesByUser(userId) {
  return adapter.queryOne('SELECT COUNT(*) as count FROM shares WHERE user_id = ?', [userId])?.count || 0;
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
