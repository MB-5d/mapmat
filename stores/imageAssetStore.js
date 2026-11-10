const adapter = require('./dbAdapter');

let ensureImageAssetSchemaPromise = null;

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

async function ensureImageAssetSchemaAsync() {
  if (ensureImageAssetSchemaPromise) return ensureImageAssetSchemaPromise;
  ensureImageAssetSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_image_assets (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        asset_field TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        storage_key TEXT,
        url TEXT,
        provider TEXT,
        width INTEGER,
        height INTEGER,
        size_bytes INTEGER,
        content_type TEXT,
        status TEXT NOT NULL,
        error TEXT,
        captured_at TIMESTAMP,
        verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (map_id, node_id, asset_field)
      )
    `);
    await adapter.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_map_image_assets_map
      ON map_image_assets (map_id, status)
    `);
    // Immutable binding survives recapture and map versions; it carries no login state.
    await adapter.executeAsync(`CREATE TABLE IF NOT EXISTS private_image_objects (
      storage_key TEXT PRIMARY KEY, map_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_private_image_map ON private_image_objects (map_id)');
    await adapter.executeAsync(`CREATE TABLE IF NOT EXISTS private_image_references (
      storage_key TEXT NOT NULL, map_id TEXT NOT NULL,
      PRIMARY KEY (storage_key, map_id)
    )`);
    await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_private_image_reference_map ON private_image_references (map_id)');
    // Upgrade existing captures without changing their encryption scope.
    await adapter.executeAsync(`INSERT INTO private_image_references (storage_key, map_id)
      SELECT p.storage_key, p.map_id FROM private_image_objects p JOIN maps m ON m.id = p.map_id
      WHERE 1 = 1 ON CONFLICT (storage_key, map_id) DO NOTHING`);
    await ensureColumnAsync('map_image_assets', 'retention_expires_at', 'TIMESTAMP');
    await ensureColumnAsync('map_image_assets', 'purge_after', 'TIMESTAMP');
  })();
  try {
    await ensureImageAssetSchemaPromise;
  } catch (error) {
    ensureImageAssetSchemaPromise = null;
    throw error;
  }
}

function buildImageAssetId({ mapId, nodeId, assetField }) {
  return [
    String(mapId || '').trim(),
    String(nodeId || '').trim(),
    String(assetField || '').trim(),
  ].join(':');
}

function normalizeAssetEntry(entry = {}) {
  const mapId = String(entry.mapId || entry.map_id || '').trim();
  const nodeId = String(entry.nodeId || entry.node_id || '').trim();
  const assetField = String(entry.assetField || entry.asset_field || '').trim();
  if (!mapId || !nodeId || !assetField) return null;
  return {
    id: String(entry.id || buildImageAssetId({ mapId, nodeId, assetField })),
    mapId,
    nodeId,
    assetField,
    assetType: String(entry.assetType || entry.asset_type || assetField).trim(),
    storageKey: entry.storageKey || entry.storage_key || null,
    url: entry.url || null,
    provider: entry.provider || null,
    width: Number.isFinite(Number(entry.width)) ? Number(entry.width) : null,
    height: Number.isFinite(Number(entry.height)) ? Number(entry.height) : null,
    sizeBytes: Number.isFinite(Number(entry.sizeBytes || entry.size_bytes))
      ? Number(entry.sizeBytes || entry.size_bytes)
      : null,
    contentType: entry.contentType || entry.content_type || null,
    status: String(entry.status || 'saved').trim(),
    error: entry.error || null,
    capturedAt: entry.capturedAt || entry.captured_at || null,
    verifiedAt: entry.verifiedAt || entry.verified_at || null,
  };
}

const upsertImageAssetsAsync = adapter.transactionAsync(async (entries) => {
  await ensureImageAssetSchemaAsync();
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map(normalizeAssetEntry)
    .filter(Boolean);
  if (normalizedEntries.length === 0) return 0;

  for (const entry of normalizedEntries) {
    await adapter.executeAsync(`
      INSERT INTO map_image_assets (
        id, map_id, node_id, asset_field, asset_type, storage_key, url,
        provider, width, height, size_bytes, content_type, status, error,
        captured_at, verified_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        map_id = excluded.map_id,
        node_id = excluded.node_id,
        asset_field = excluded.asset_field,
        asset_type = excluded.asset_type,
        storage_key = excluded.storage_key,
        url = excluded.url,
        provider = excluded.provider,
        width = excluded.width,
        height = excluded.height,
        size_bytes = excluded.size_bytes,
        content_type = excluded.content_type,
        status = excluded.status,
        error = excluded.error,
        captured_at = excluded.captured_at,
        verified_at = excluded.verified_at,
        updated_at = CURRENT_TIMESTAMP
    `, [
      entry.id,
      entry.mapId,
      entry.nodeId,
      entry.assetField,
      entry.assetType,
      entry.storageKey,
      entry.url,
      entry.provider,
      entry.width,
      entry.height,
      entry.sizeBytes,
      entry.contentType,
      entry.status,
      entry.error,
      entry.capturedAt,
      entry.verifiedAt,
    ]);
  }
  return normalizedEntries.length;
});

async function upsertImageAssetAsync(entry) {
  return upsertImageAssetsAsync([entry]);
}

async function listImageAssetsByMapAsync(mapId) {
  await ensureImageAssetSchemaAsync();
  return adapter.queryAllAsync(`
    SELECT *
    FROM map_image_assets
    WHERE map_id = ?
    ORDER BY node_id ASC, asset_field ASC
  `, [mapId]);
}

async function listSavedImageAssetsByMapAsync(mapId) {
  await ensureImageAssetSchemaAsync();
  return adapter.queryAllAsync(`
    SELECT *
    FROM map_image_assets
    WHERE map_id = ? AND status = 'saved' AND url IS NOT NULL
    ORDER BY node_id ASC, asset_field ASC
  `, [mapId]);
}

async function listSavedImageAssetsByMapNodeAsync(mapId, nodeId) {
  await ensureImageAssetSchemaAsync();
  return adapter.queryAllAsync(`
    SELECT *
    FROM map_image_assets
    WHERE map_id = ?
      AND node_id = ?
      AND status = 'saved'
      AND url IS NOT NULL
    ORDER BY asset_field ASC
  `, [mapId, nodeId]);
}

async function listSavedImageAssetStorageKeysAsync() {
  await ensureImageAssetSchemaAsync();
  return adapter.queryAllAsync(`
    SELECT storage_key, url
    FROM map_image_assets
    WHERE status = 'saved'
      AND (storage_key IS NOT NULL OR url IS NOT NULL)
    ORDER BY updated_at DESC
  `);
}

async function markImageAssetsMissingAsync(entries) {
  await ensureImageAssetSchemaAsync();
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map(normalizeAssetEntry)
    .filter(Boolean)
    .map((entry) => ({
      ...entry,
      status: 'missing',
      error: entry.error || 'Missing saved asset',
      verifiedAt: new Date().toISOString(),
    }));
  return upsertImageAssetsAsync(normalizedEntries);
}

async function markImageAssetsStaleByNodeIdsAsync({ mapId, nodeIds, error = 'Stale after URL change' }) {
  await ensureImageAssetSchemaAsync();
  const safeMapId = String(mapId || '').trim();
  const safeNodeIds = Array.from(new Set(
    (Array.isArray(nodeIds) ? nodeIds : [])
      .map((nodeId) => String(nodeId || '').trim())
      .filter(Boolean)
  ));
  if (!safeMapId || safeNodeIds.length === 0) return 0;

  const placeholders = adapter.placeholders(safeNodeIds.length);
  const result = await adapter.executeAsync(`
    UPDATE map_image_assets
    SET status = 'stale',
        error = ?,
        verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE map_id = ?
      AND node_id IN (${placeholders})
      AND status = 'saved'
  `, [error, safeMapId, ...safeNodeIds]);
  return result?.changes || 0;
}

async function registerPrivateImageAsync({ storageKey, mapId, ownerUserId }) {
  await ensureImageAssetSchemaAsync();
  await adapter.executeAsync('INSERT INTO private_image_objects (storage_key, map_id, owner_user_id) VALUES (?, ?, ?)', [storageKey, mapId, ownerUserId]);
  await adapter.executeAsync('INSERT INTO private_image_references (storage_key, map_id) VALUES (?, ?)', [storageKey, mapId]);
}
async function getPrivateImageBindingAsync(storageKey, mapId = null) {
  await ensureImageAssetSchemaAsync();
  return adapter.queryOneAsync(`SELECT p.* FROM private_image_objects p
    WHERE p.storage_key = ? AND EXISTS (
      SELECT 1 FROM private_image_references r JOIN maps m ON m.id = r.map_id
      WHERE r.storage_key = p.storage_key ${mapId ? 'AND r.map_id = ?' : ''}
    )`, mapId ? [storageKey, mapId] : [storageKey]);
}
async function listPrivateImageAccessAsync(storageKeys, userId) {
  if (!storageKeys.length) return [];
  await ensureImageAssetSchemaAsync();
  await require('./collaborationStore').ensureCollaborationSchemaAsync();
  const rows = [];
  for (let offset = 0; offset < storageKeys.length; offset += 200) {
    const keys = storageKeys.slice(offset, offset + 200);
    rows.push(...await adapter.queryAllAsync(`SELECT p.*, m.user_id AS map_owner_id, mm.role AS membership_role
      FROM private_image_objects p
      JOIN private_image_references r ON r.storage_key = p.storage_key
      JOIN maps m ON m.id = r.map_id
      LEFT JOIN map_memberships mm ON mm.map_id = m.id AND mm.user_id = ?
      WHERE p.storage_key IN (${keys.map(() => '?').join(',')})
        AND (m.user_id = ? OR mm.id IS NOT NULL)`, [userId, ...keys, userId]));
  }
  return rows;
}
// Caller has verified all source-image and destination-map permissions.
// Bind references and save together so a failed save cannot grant image access.
const saveWithPrivateImageReferencesAsync = adapter.transactionAsync(async ({ storageKeys, mapId, save }) => {
  const result = await save();
  for (let offset = 0; offset < storageKeys.length; offset += 200) {
    const keys = storageKeys.slice(offset, offset + 200);
    await adapter.executeAsync(`INSERT INTO private_image_references (storage_key, map_id)
      VALUES ${keys.map(() => '(?, ?)').join(',')}
      ON CONFLICT (storage_key, map_id) DO NOTHING`, keys.flatMap(key => [key, mapId]));
  }
  return result;
});

module.exports = {
  listPrivateImageAccessAsync,
  saveWithPrivateImageReferencesAsync,
  registerPrivateImageAsync,
  getPrivateImageBindingAsync,
  ensureImageAssetSchemaAsync,
  buildImageAssetId,
  upsertImageAssetAsync,
  upsertImageAssetsAsync,
  listImageAssetsByMapAsync,
  listSavedImageAssetsByMapAsync,
  listSavedImageAssetsByMapNodeAsync,
  listSavedImageAssetStorageKeysAsync,
  markImageAssetsMissingAsync,
  markImageAssetsStaleByNodeIdsAsync,
};
