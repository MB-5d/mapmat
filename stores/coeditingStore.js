const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

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

async function ensureCoeditingSchemaAsync() {
  if (ensureSchemaPromise) {
    return ensureSchemaPromise;
  }

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_live_snapshots (
        map_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        notes TEXT,
        root_data TEXT NOT NULL,
        orphans_data TEXT,
        connections_data TEXT,
        colors TEXT,
        connection_colors TEXT,
        map_updated_at TEXT,
        last_op_id TEXT,
        last_actor_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      )
    `);

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_live_ops (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      base_version INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      committed_at TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
      )
    `);

    await adapter.executeAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_map_live_ops_map_version ON map_live_ops(map_id, version)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_live_ops_map_committed ON map_live_ops(map_id, committed_at)'
    );

    await ensureColumnAsync(
      'map_live_ops',
      'timestamp',
      "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
    );
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

function getLiveSnapshotByMapIdAsync(mapId) {
  return adapter.queryOneAsync(
    'SELECT * FROM map_live_snapshots WHERE map_id = ?',
    [mapId]
  );
}

async function createLiveSnapshotAsync({
  mapId,
  version,
  name,
  notes,
  rootData,
  orphansData,
  connectionsData,
  colors,
  connectionColors,
  mapUpdatedAt,
  lastOpId = null,
  lastActorId = null,
}) {
  await adapter.executeAsync(`
    INSERT INTO map_live_snapshots (
      map_id,
      version,
      name,
      notes,
      root_data,
      orphans_data,
      connections_data,
      colors,
      connection_colors,
      map_updated_at,
      last_op_id,
      last_actor_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    mapId,
    version,
    name || null,
    notes || null,
    rootData,
    orphansData || null,
    connectionsData || null,
    colors || null,
    connectionColors || null,
    mapUpdatedAt || null,
    lastOpId || null,
    lastActorId || null,
  ]);

  return getLiveSnapshotByMapIdAsync(mapId);
}

async function updateLiveSnapshotAsync({
  mapId,
  version,
  name,
  notes,
  rootData,
  orphansData,
  connectionsData,
  colors,
  connectionColors,
  mapUpdatedAt,
  lastOpId = null,
  lastActorId = null,
}) {
  await adapter.executeAsync(`
    UPDATE map_live_snapshots
    SET version = ?,
      name = ?,
      notes = ?,
      root_data = ?,
      orphans_data = ?,
      connections_data = ?,
      colors = ?,
      connection_colors = ?,
      map_updated_at = ?,
      last_op_id = ?,
      last_actor_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE map_id = ?
  `, [
    version,
    name || null,
    notes || null,
    rootData,
    orphansData || null,
    connectionsData || null,
    colors || null,
    connectionColors || null,
    mapUpdatedAt || null,
    lastOpId || null,
    lastActorId || null,
    mapId,
  ]);

  return getLiveSnapshotByMapIdAsync(mapId);
}

function getLiveOpByIdAsync(opId) {
  return adapter.queryOneAsync(
    'SELECT * FROM map_live_ops WHERE id = ?',
    [opId]
  );
}

async function createLiveOpAsync({
  id,
  mapId,
  version,
  sessionId,
  actorId,
  baseVersion,
  timestamp,
  type,
  payload,
  committedAt,
}) {
  await adapter.executeAsync(`
    INSERT INTO map_live_ops (
      id,
      map_id,
      version,
      session_id,
      actor_id,
      base_version,
      timestamp,
      type,
      payload,
      committed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    mapId,
    version,
    sessionId,
    actorId,
    baseVersion,
    timestamp,
    type,
    payload,
    committedAt,
  ]);

  return getLiveOpByIdAsync(id);
}

function listLiveOpsByMapIdAfterVersionAsync(mapId, afterVersion, limit) {
  return adapter.queryAllAsync(`
    SELECT *
    FROM map_live_ops
    WHERE map_id = ? AND version > ?
    ORDER BY version ASC
    LIMIT ?
  `, [mapId, afterVersion, limit]);
}

module.exports = {
  ensureCoeditingSchemaAsync,
  getLiveSnapshotByMapIdAsync,
  createLiveSnapshotAsync,
  updateLiveSnapshotAsync,
  getLiveOpByIdAsync,
  createLiveOpAsync,
  listLiveOpsByMapIdAfterVersionAsync,
};
