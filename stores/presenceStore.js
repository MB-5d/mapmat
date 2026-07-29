const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

function normalizeSessionId(sessionId) {
  return String(sessionId || '').trim();
}

function normalizeAccessMode(accessMode) {
  const normalized = String(accessMode || '').trim().toLowerCase();
  if (['view', 'comment', 'edit'].includes(normalized)) return normalized;
  return 'view';
}

async function ensurePresenceSchemaAsync() {
  if (ensureSchemaPromise) {
    return ensureSchemaPromise;
  }

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_presence_sessions (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        display_name TEXT,
        user_email TEXT,
        access_mode TEXT NOT NULL DEFAULT 'view',
        client_name TEXT,
        metadata TEXT,
        last_seen_at TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (map_id, user_id, session_id),
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_presence_map_seen ON map_presence_sessions(map_id, last_seen_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_presence_map_session ON map_presence_sessions(map_id, session_id)'
    );
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

function listActivePresenceByMapAsync(mapId, cutoffIso) {
  return adapter.queryAllAsync(`
    SELECT *
    FROM map_presence_sessions
    WHERE map_id = ? AND last_seen_at >= ?
    ORDER BY last_seen_at DESC
  `, [mapId, cutoffIso]);
}

async function pruneExpiredPresenceByMapAsync(mapId, cutoffIso) {
  return (await adapter.executeAsync(
    'DELETE FROM map_presence_sessions WHERE map_id = ? AND last_seen_at < ?',
    [mapId, cutoffIso]
  )).changes || 0;
}

function getPresenceSessionByKeyAsync(mapId, userId, sessionId) {
  return adapter.queryOneAsync(`
    SELECT *
    FROM map_presence_sessions
    WHERE map_id = ? AND user_id = ? AND session_id = ?
  `, [mapId, userId, normalizeSessionId(sessionId)]);
}

async function upsertPresenceSessionAsync({
  mapId,
  userId,
  sessionId,
  displayName,
  userEmail,
  accessMode,
  clientName,
  metadata,
  lastSeenAt,
}) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const normalizedAccessMode = normalizeAccessMode(accessMode);
  const existing = await getPresenceSessionByKeyAsync(mapId, userId, normalizedSessionId);

  if (existing) {
    await adapter.executeAsync(`
      UPDATE map_presence_sessions
      SET display_name = ?,
        user_email = ?,
        access_mode = ?,
        client_name = ?,
        metadata = ?,
        last_seen_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE map_id = ? AND user_id = ? AND session_id = ?
    `, [
      displayName || null,
      userEmail || null,
      normalizedAccessMode,
      clientName || null,
      metadata || null,
      lastSeenAt,
      mapId,
      userId,
      normalizedSessionId,
    ]);
  } else {
    await adapter.executeAsync(`
      INSERT INTO map_presence_sessions (
        id,
        map_id,
        user_id,
        session_id,
        display_name,
        user_email,
        access_mode,
        client_name,
        metadata,
        last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      mapId,
      userId,
      normalizedSessionId,
      displayName || null,
      userEmail || null,
      normalizedAccessMode,
      clientName || null,
      metadata || null,
      lastSeenAt,
    ]);
  }

  return getPresenceSessionByKeyAsync(mapId, userId, normalizedSessionId);
}

async function deletePresenceByMapUserSessionAsync(mapId, userId, sessionId) {
  return (await adapter.executeAsync(
    'DELETE FROM map_presence_sessions WHERE map_id = ? AND user_id = ? AND session_id = ?',
    [mapId, userId, normalizeSessionId(sessionId)]
  )).changes || 0;
}

async function deletePresenceByMapSessionAsync(mapId, sessionId) {
  return (await adapter.executeAsync(
    'DELETE FROM map_presence_sessions WHERE map_id = ? AND session_id = ?',
    [mapId, normalizeSessionId(sessionId)]
  )).changes || 0;
}

module.exports = {
  ensurePresenceSchemaAsync,
  listActivePresenceByMapAsync,
  pruneExpiredPresenceByMapAsync,
  getPresenceSessionByKeyAsync,
  upsertPresenceSessionAsync,
  deletePresenceByMapUserSessionAsync,
  deletePresenceByMapSessionAsync,
};
