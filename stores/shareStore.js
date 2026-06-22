const adapter = require('./dbAdapter');
let ensureShareSchemaPromise = null;
const COMPACT_SHARE_ID_LENGTH = 6;

async function ensureColumnAsync(table, column, type) {
  let rows = [];
  if (adapter.runtime?.activeProvider === 'postgres') {
    rows = await adapter.queryAllAsync(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ?
    `, [table]);
  } else {
    rows = await adapter.queryAllAsync(`PRAGMA table_info(${table})`);
  }

  const columns = rows.map((row) => row.column_name || row.name).filter(Boolean);
  if (!columns.includes(column)) {
    await adapter.executeAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

async function ensureShareSchemaAsync() {
  if (ensureShareSchemaPromise) return ensureShareSchemaPromise;
  ensureShareSchemaPromise = (async () => {
    await ensureColumnAsync('shares', 'project_id', 'TEXT');
    await ensureColumnAsync('shares', 'access_level', 'TEXT');
    await ensureColumnAsync('shares', 'orientation', 'TEXT');
  })();
  try {
    await ensureShareSchemaPromise;
  } catch (error) {
    ensureShareSchemaPromise = null;
    throw error;
  }
}

async function createShareAsync({
  id,
  mapId,
  projectId,
  userId,
  rootData,
  orphansData,
  connectionsData,
  colors,
  connectionColors,
  accessLevel,
  orientation,
  expiresAt,
}) {
  await ensureShareSchemaAsync();
  return adapter.executeAsync(`
    INSERT INTO shares (
      id, map_id, user_id, root_data, orphans_data, connections_data,
      colors, connection_colors, project_id, access_level, orientation, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    mapId || null,
    userId,
    rootData,
    orphansData,
    connectionsData,
    colors,
    connectionColors,
    projectId || null,
    accessLevel || null,
    orientation || null,
    expiresAt,
  ]);
}

async function updateShareSnapshotAsync(shareId, {
  rootData,
  orphansData,
  connectionsData,
  colors,
  connectionColors,
  accessLevel,
  orientation,
  expiresAt,
}) {
  await ensureShareSchemaAsync();
  return adapter.executeAsync(`
    UPDATE shares
    SET root_data = ?,
      orphans_data = ?,
      connections_data = ?,
      colors = ?,
      connection_colors = ?,
      access_level = ?,
      orientation = ?,
      expires_at = ?
    WHERE id = ?
  `, [
    rootData,
    orphansData,
    connectionsData,
    colors,
    connectionColors,
    accessLevel || null,
    orientation || null,
    expiresAt,
    shareId,
  ]);
}

async function getShareWithUserByIdAsync(shareId) {
  await ensureShareSchemaAsync();
  return adapter.queryOneAsync(`
    SELECT s.*, u.name as shared_by_name
    FROM shares s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `, [shareId]);
}

async function getFirstMapShareForUserAsync({ mapId, projectId, userId }) {
  await ensureShareSchemaAsync();
  return adapter.queryOneAsync(`
    SELECT *
    FROM shares
    WHERE map_id = ?
      AND user_id = ?
      AND LENGTH(id) = ?
      AND (
        (? IS NULL AND project_id IS NULL)
        OR project_id = ?
      )
    ORDER BY created_at ASC
    LIMIT 1
  `, [mapId, userId, COMPACT_SHARE_ID_LENGTH, projectId || null, projectId || null]);
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
  updateShareSnapshotAsync,
  getShareWithUserByIdAsync,
  getFirstMapShareForUserAsync,
  incrementShareViewCountAsync,
  getShareForUserAsync,
  deleteShareAsync,
  listSharesByUserAsync,
  countSharesByUserAsync,
};
