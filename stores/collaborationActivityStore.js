const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

async function ensureActivitySchemaAsync() {
  if (ensureSchemaPromise) {
    return ensureSchemaPromise;
  }

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_activity_events (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        actor_user_id TEXT,
        actor_role TEXT,
        event_type TEXT NOT NULL,
        event_scope TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        summary TEXT,
        payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_activity_events_map_created ON map_activity_events(map_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_activity_events_actor_created ON map_activity_events(actor_user_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_activity_events_scope_created ON map_activity_events(map_id, event_scope, created_at)'
    );
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

function getActivityEventByIdAsync(eventId) {
  return adapter.queryOneAsync(`
    SELECT e.*,
      actor.email AS actor_email,
      actor.name AS actor_name
    FROM map_activity_events e
    LEFT JOIN users actor ON e.actor_user_id = actor.id
    WHERE e.id = ?
  `, [eventId]);
}

async function appendActivityEventAsync({
  id = null,
  mapId,
  actorUserId = null,
  actorRole = null,
  eventType,
  eventScope,
  entityType = null,
  entityId = null,
  summary = null,
  payload = null,
}) {
  const eventId = id || uuidv4();

  await adapter.executeAsync(`
    INSERT INTO map_activity_events (
      id, map_id, actor_user_id, actor_role, event_type, event_scope,
      entity_type, entity_id, summary, payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    eventId,
    mapId,
    normalizeNullableString(actorUserId),
    normalizeNullableString(actorRole),
    String(eventType || '').trim(),
    String(eventScope || '').trim(),
    normalizeNullableString(entityType),
    normalizeNullableString(entityId),
    normalizeNullableString(summary),
    payload === null || payload === undefined ? null : JSON.stringify(payload),
  ]);

  return getActivityEventByIdAsync(eventId);
}

function listActivityEventsByMapAsync(mapId, {
  eventScope = null,
  limit = 50,
  offset = 0,
} = {}) {
  const params = [mapId];
  let query = `
    SELECT e.*,
      actor.email AS actor_email,
      actor.name AS actor_name
    FROM map_activity_events e
    LEFT JOIN users actor ON e.actor_user_id = actor.id
    WHERE e.map_id = ?
  `;

  if (eventScope) {
    query += ' AND e.event_scope = ?';
    params.push(String(eventScope || '').trim());
  }

  query += ' ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return adapter.queryAllAsync(query, params);
}

async function countActivityEventsByMapAsync(mapId, { eventScope = null } = {}) {
  const params = [mapId];
  let query = 'SELECT COUNT(*) AS count FROM map_activity_events WHERE map_id = ?';
  if (eventScope) {
    query += ' AND event_scope = ?';
    params.push(String(eventScope || '').trim());
  }

  const row = await adapter.queryOneAsync(query, params);
  return Number(row?.count || 0);
}

module.exports = {
  ensureActivitySchemaAsync,
  appendActivityEventAsync,
  listActivityEventsByMapAsync,
  countActivityEventsByMapAsync,
};
