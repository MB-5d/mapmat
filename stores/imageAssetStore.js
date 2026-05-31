const adapter = require('./dbAdapter');

let ensureImageAssetSchemaPromise = null;

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

module.exports = {
  ensureImageAssetSchemaAsync,
  buildImageAssetId,
  upsertImageAssetAsync,
  upsertImageAssetsAsync,
  listImageAssetsByMapAsync,
  listSavedImageAssetsByMapAsync,
  markImageAssetsMissingAsync,
  markImageAssetsStaleByNodeIdsAsync,
};
