const db = require('../db');

function listHistoryByUser(userId, { limit, offset }) {
  return db.prepare(`
    SELECT * FROM scan_history
    WHERE user_id = ?
    ORDER BY scanned_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

function countHistoryByUser(userId) {
  return db.prepare('SELECT COUNT(*) as count FROM scan_history WHERE user_id = ?')
    .get(userId)?.count || 0;
}

function createHistory({
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
  db.prepare(`
    INSERT INTO scan_history (
      id, user_id, url, hostname, title, page_count, root_data,
      orphans_data, connections_data, colors, connection_colors,
      scan_options, scan_depth, map_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
    mapId
  );
}

function trimHistoryByUser(userId, keep = 50) {
  return db.prepare(`
    DELETE FROM scan_history
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM scan_history
      WHERE user_id = ?
      ORDER BY scanned_at DESC
      LIMIT ?
    )
  `).run(userId, userId, keep).changes || 0;
}

function getHistoryItemForUser(historyId, userId) {
  return db.prepare('SELECT * FROM scan_history WHERE id = ? AND user_id = ?')
    .get(historyId, userId) || null;
}

function updateHistoryMapId(historyId, mapId) {
  db.prepare(`
    UPDATE scan_history SET map_id = ?, scanned_at = scanned_at
    WHERE id = ?
  `).run(mapId || null, historyId);
}

function deleteHistoryByIdsForUser(ids, userId) {
  if (!ids || ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`
    DELETE FROM scan_history
    WHERE id IN (${placeholders}) AND user_id = ?
  `).run(...ids, userId).changes || 0;
}

module.exports = {
  listHistoryByUser,
  countHistoryByUser,
  createHistory,
  trimHistoryByUser,
  getHistoryItemForUser,
  updateHistoryMapId,
  deleteHistoryByIdsForUser,
};
