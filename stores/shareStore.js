const adapter = require('./dbAdapter');

function createShareAsync({
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
  return adapter.executeAsync(`
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

function getShareWithUserByIdAsync(shareId) {
  return adapter.queryOneAsync(`
    SELECT s.*, u.name as shared_by_name
    FROM shares s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `, [shareId]);
}

function incrementShareViewCountAsync(shareId) {
  return adapter.executeAsync('UPDATE shares SET view_count = view_count + 1 WHERE id = ?', [shareId]);
}

function getShareForUserAsync(shareId, userId) {
  return adapter.queryOneAsync('SELECT * FROM shares WHERE id = ? AND user_id = ?', [shareId, userId]);
}

function deleteShareAsync(shareId) {
  return adapter.executeAsync('DELETE FROM shares WHERE id = ?', [shareId]);
}

function listSharesByUserAsync(userId, { limit, offset }) {
  return adapter.queryAllAsync(`
    SELECT s.id, s.map_id, s.created_at, s.expires_at, s.view_count,
      m.name as map_name
    FROM shares s
    LEFT JOIN maps m ON s.map_id = m.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, limit, offset]);
}

async function countSharesByUserAsync(userId) {
  return (await adapter.queryOneAsync('SELECT COUNT(*) as count FROM shares WHERE user_id = ?', [userId]))?.count || 0;
}

module.exports = {
  createShareAsync,
  getShareWithUserByIdAsync,
  incrementShareViewCountAsync,
  getShareForUserAsync,
  deleteShareAsync,
  listSharesByUserAsync,
  countSharesByUserAsync,
};
