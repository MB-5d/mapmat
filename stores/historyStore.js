const adapter = require('./dbAdapter');

function listHistoryByUserAsync(userId, { limit, offset }) {
  return adapter.queryAllAsync(`
    SELECT * FROM scan_history
    WHERE user_id = ?
    ORDER BY scanned_at DESC
    LIMIT ? OFFSET ?
  `, [userId, limit, offset]);
}

async function countHistoryByUserAsync(userId) {
  return (await adapter.queryOneAsync('SELECT COUNT(*) as count FROM scan_history WHERE user_id = ?', [userId]))?.count || 0;
}

function createHistoryAsync({
  id,
  userId,
  url,
  hostname,
  title,
  pageCount,
  rootData,
  orphansData,
  connectionsData,
  colors,
  connectionColors,
  scanOptions,
  scanDepth,
  mapId,
}) {
  return adapter.executeAsync(`
    INSERT INTO scan_history (
      id, user_id, url, hostname, title, page_count, root_data,
      orphans_data, connections_data, colors, connection_colors,
      scan_options, scan_depth, map_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId,
    url,
    hostname,
    title,
    pageCount,
    rootData,
    orphansData,
    connectionsData,
    colors,
    connectionColors,
    scanOptions,
    scanDepth,
    mapId,
  ]);
}

async function trimHistoryByUserAsync(userId, keep = 50) {
  return (await adapter.executeAsync(`
    DELETE FROM scan_history
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM scan_history
      WHERE user_id = ?
      ORDER BY scanned_at DESC
      LIMIT ?
    )
  `, [userId, userId, keep])).changes || 0;
}

function getHistoryItemForUserAsync(historyId, userId) {
  return adapter.queryOneAsync('SELECT * FROM scan_history WHERE id = ? AND user_id = ?', [historyId, userId]);
}

function updateHistoryMapIdAsync(historyId, mapId) {
  return adapter.executeAsync(`
    UPDATE scan_history SET map_id = ?, scanned_at = scanned_at
    WHERE id = ?
  `, [mapId || null, historyId]);
}

async function deleteHistoryByIdsForUserAsync(ids, userId) {
  if (!ids || ids.length === 0) return 0;
  const placeholders = adapter.placeholders(ids.length);
  return (await adapter.executeAsync(`
    DELETE FROM scan_history
    WHERE id IN (${placeholders}) AND user_id = ?
  `, [...ids, userId])).changes || 0;
}

module.exports = {
  listHistoryByUserAsync,
  countHistoryByUserAsync,
  createHistoryAsync,
  trimHistoryByUserAsync,
  getHistoryItemForUserAsync,
  updateHistoryMapIdAsync,
  deleteHistoryByIdsForUserAsync,
};
