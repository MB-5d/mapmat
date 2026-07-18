const adapter = require('./dbAdapter');
const collaborationStore = require('./collaborationStore');
const emailDeliveryStore = require('./emailDeliveryStore');
const imageAssetStore = require('./imageAssetStore');
const mapCommentStore = require('./mapCommentStore');
const { countMapNodes } = require('../utils/mapScene');

function toSqlTimestamp(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeDateRange({ days = 30, since, until } = {}) {
  const safeUntil = until ? new Date(until) : new Date();
  const untilDate = Number.isNaN(safeUntil.getTime()) ? new Date() : safeUntil;
  const parsedDays = Number.parseInt(days, 10);
  const safeDays = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 365) : 30;
  const safeSince = since ? new Date(since) : new Date(untilDate.getTime() - safeDays * 24 * 60 * 60 * 1000);
  const sinceDate = Number.isNaN(safeSince.getTime())
    ? new Date(untilDate.getTime() - safeDays * 24 * 60 * 60 * 1000)
    : safeSince;
  return {
    days: Math.max(1, Math.ceil((untilDate.getTime() - sinceDate.getTime()) / (24 * 60 * 60 * 1000))),
    since: toSqlTimestamp(sinceDate),
    until: toSqlTimestamp(untilDate),
  };
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function countStoredMapPages(row) {
  const root = safeJsonParse(row.root_data, null);
  const orphans = safeJsonParse(row.orphans_data, []);
  return countMapNodes(root, orphans);
}

function buildRangeClause(column, range, params) {
  params.push(range.since, range.until);
  return `${column} >= ? AND ${column} <= ?`;
}

function addOptionalUserFilter(clauses, params, column, userId) {
  if (!userId) return;
  clauses.push(`${column} = ?`);
  params.push(userId);
}

function addOptionalMapFilter(clauses, params, column, mapId) {
  if (!mapId) return;
  clauses.push(`${column} = ?`);
  params.push(mapId);
}

function rowCount(row) {
  return Number(row?.count || 0);
}

async function ensureOptionalUsageSchemasAsync() {
  await Promise.all([
    imageAssetStore.ensureImageAssetSchemaAsync(),
    mapCommentStore.ensureMapCommentSchemaAsync(),
    collaborationStore.ensureCollaborationSchemaAsync(),
    emailDeliveryStore.ensureEmailDeliverySchemaAsync(),
  ]);
}

async function listUsageEventsAsync({ range, userId = '', mapId = '' }) {
  const clauses = [buildRangeClause('created_at', range, [])];
  const params = [range.since, range.until];
  addOptionalUserFilter(clauses, params, 'user_id', userId);
  const rows = await adapter.queryAllAsync(`
    SELECT id, user_id, event_type, quantity, meta, created_at
    FROM usage_events
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC
  `, params);

  return rows
    .map((row) => ({
      ...row,
      quantity: Number(row.quantity || 0),
      meta: safeJsonParse(row.meta, {}),
    }))
    .filter((row) => !mapId || String(row.meta?.mapId || '') === String(mapId));
}

async function getScanSummaryAsync({ range, userId = '', mapId = '' }) {
  const clauses = [buildRangeClause('scanned_at', range, [])];
  const params = [range.since, range.until];
  addOptionalUserFilter(clauses, params, 'user_id', userId);
  addOptionalMapFilter(clauses, params, 'map_id', mapId);
  const row = await adapter.queryOneAsync(`
    SELECT COUNT(*) AS scans,
      COALESCE(SUM(page_count), 0) AS pages,
      COALESCE(MAX(page_count), 0) AS max_pages
    FROM scan_history
    WHERE ${clauses.join(' AND ')}
  `, params);
  return {
    scans: rowCount({ count: row?.scans }),
    pages: Number(row?.pages || 0),
    maxPages: Number(row?.max_pages || 0),
  };
}

async function getMapInventoryAsync({ userId = '', mapId = '' }) {
  const projectClauses = [];
  const projectParams = [];
  addOptionalUserFilter(projectClauses, projectParams, 'user_id', userId);
  const projectWhere = projectClauses.length ? `WHERE ${projectClauses.join(' AND ')}` : '';
  const projects = rowCount(await adapter.queryOneAsync(
    `SELECT COUNT(*) AS count FROM projects ${projectWhere}`,
    projectParams
  ));

  const mapClauses = [];
  const mapParams = [];
  addOptionalUserFilter(mapClauses, mapParams, 'user_id', userId);
  addOptionalMapFilter(mapClauses, mapParams, 'id', mapId);
  const mapWhere = mapClauses.length ? `WHERE ${mapClauses.join(' AND ')}` : '';
  const maps = await adapter.queryAllAsync(`
    SELECT id, user_id, name, root_data, orphans_data, updated_at
    FROM maps
    ${mapWhere}
    ORDER BY updated_at DESC
  `, mapParams);

  return {
    projects,
    maps: maps.length,
    mapPages: maps.reduce((total, row) => total + countStoredMapPages(row), 0),
  };
}

async function getImageStorageSummaryAsync({ userId = '', mapId = '' }) {
  const clauses = [];
  const params = [];
  addOptionalMapFilter(clauses, params, 'ia.map_id', mapId);
  addOptionalUserFilter(clauses, params, 'm.user_id', userId);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await adapter.queryAllAsync(`
    SELECT ia.asset_field AS assetField,
      ia.status AS status,
      ia.provider AS provider,
      COUNT(*) AS assets,
      COALESCE(SUM(ia.size_bytes), 0) AS bytes
    FROM map_image_assets ia
    LEFT JOIN maps m ON m.id = ia.map_id
    ${where}
    GROUP BY ia.asset_field, ia.status, ia.provider
    ORDER BY assets DESC
  `, params);
  const totals = rows.reduce((acc, row) => {
    const assets = Number(row.assets || 0);
    const bytes = Number(row.bytes || 0);
    acc.assets += assets;
    acc.bytes += bytes;
    if (String(row.assetField || '').toLowerCase().includes('full')) {
      acc.full += assets;
      acc.fullBytes += bytes;
    } else {
      acc.thumbnails += assets;
      acc.thumbnailBytes += bytes;
    }
    return acc;
  }, {
    assets: 0,
    bytes: 0,
    full: 0,
    fullBytes: 0,
    thumbnails: 0,
    thumbnailBytes: 0,
  });
  return { ...totals, breakdown: rows };
}

async function getCountInRangeAsync({ table, timeColumn = 'created_at', userColumn = '', mapColumn = '', range, userId = '', mapId = '' }) {
  const clauses = [buildRangeClause(timeColumn, range, [])];
  const params = [range.since, range.until];
  if (userColumn) addOptionalUserFilter(clauses, params, userColumn, userId);
  if (mapColumn) addOptionalMapFilter(clauses, params, mapColumn, mapId);
  return rowCount(await adapter.queryOneAsync(`
    SELECT COUNT(*) AS count
    FROM ${table}
    WHERE ${clauses.join(' AND ')}
  `, params));
}

async function getCollaborationSummaryAsync({ range, userId = '', mapId = '' }) {
  const comments = await getCountInRangeAsync({
    table: 'map_comments c LEFT JOIN maps m ON m.id = c.map_id',
    userColumn: 'c.author_user_id',
    mapColumn: 'c.map_id',
    timeColumn: 'c.created_at',
    range,
    userId,
    mapId,
  });
  const shares = await getCountInRangeAsync({
    table: 'shares',
    userColumn: 'user_id',
    mapColumn: 'map_id',
    range,
    userId,
    mapId,
  });
  const shareRow = await adapter.queryOneAsync(`
    SELECT COALESCE(SUM(view_count), 0) AS views
    FROM shares
    WHERE (? = '' OR user_id = ?)
      AND (? = '' OR map_id = ?)
  `, [userId, userId, mapId, mapId]);
  const invites = await getCountInRangeAsync({
    table: 'map_invites',
    userColumn: 'inviter_user_id',
    mapColumn: 'map_id',
    range,
    userId,
    mapId,
  });
  const memberships = await getCountInRangeAsync({
    table: 'map_memberships mm LEFT JOIN maps m ON m.id = mm.map_id',
    userColumn: 'm.user_id',
    mapColumn: 'mm.map_id',
    timeColumn: 'mm.created_at',
    range,
    userId,
    mapId,
  });
  const additionalUsers = rowCount(await adapter.queryOneAsync(`
    SELECT COUNT(DISTINCT mm.user_id) AS count
    FROM map_memberships mm
    LEFT JOIN maps m ON m.id = mm.map_id
    WHERE (? = '' OR m.user_id = ?)
      AND (? = '' OR mm.map_id = ?)
  `, [userId, userId, mapId, mapId]));
  return {
    comments,
    shares,
    shareViews: Number(shareRow?.views || 0),
    invites,
    memberships,
    additionalUsers,
  };
}

async function getEmailSummaryAsync({ range, userId = '', mapId = '' }) {
  const clauses = [buildRangeClause('ed.created_at', range, [])];
  const params = [range.since, range.until];
  addOptionalMapFilter(clauses, params, 'ed.map_id', mapId);
  if (userId) {
    clauses.push('(m.user_id = ? OR i.inviter_user_id = ?)');
    params.push(userId, userId);
  }
  const rows = await adapter.queryAllAsync(`
    SELECT ed.provider AS provider,
      ed.status AS status,
      COUNT(*) AS count
    FROM email_deliveries ed
    LEFT JOIN maps m ON m.id = ed.map_id
    LEFT JOIN map_invites i ON i.id = ed.invite_id
    WHERE ${clauses.join(' AND ')}
    GROUP BY ed.provider, ed.status
    ORDER BY count DESC
  `, params);
  return {
    emails: rows.reduce((total, row) => total + Number(row.count || 0), 0),
    breakdown: rows,
  };
}

async function getJobSummaryAsync({ range, userId = '', mapId = '' }) {
  const clauses = [buildRangeClause('created_at', range, [])];
  const params = [range.since, range.until];
  addOptionalUserFilter(clauses, params, 'user_id', userId);
  if (mapId) {
    clauses.push('payload LIKE ?');
    params.push(`%"mapId":"${String(mapId).replace(/"/g, '')}"%`);
  }
  const rows = await adapter.queryAllAsync(`
    SELECT type, status, COUNT(*) AS count
    FROM jobs
    WHERE ${clauses.join(' AND ')}
    GROUP BY type, status
  `, params);
  return {
    breakdown: rows,
    failed: rows
      .filter((row) => String(row.status || '') === 'failed')
      .reduce((total, row) => total + Number(row.count || 0), 0),
  };
}

async function getTopUsersAsync({ range, limit = 10 }) {
  return adapter.queryAllAsync(`
    SELECT u.id,
      u.email,
      u.name,
      COUNT(ue.id) AS events,
      COALESCE(SUM(ue.quantity), 0) AS quantity
    FROM usage_events ue
    LEFT JOIN users u ON u.id = ue.user_id
    WHERE ue.created_at >= ? AND ue.created_at <= ?
    GROUP BY u.id, u.email, u.name
    ORDER BY quantity DESC, events DESC
    LIMIT ?
  `, [range.since, range.until, limit]);
}

function summarizeUsageEvents(events) {
  const byType = {};
  const byDay = {};
  let imageDownloadFileCount = 0;
  let imageDownloadBytes = 0;

  events.forEach((event) => {
    const eventType = event.event_type || event.eventType;
    if (!byType[eventType]) {
      byType[eventType] = { eventType, events: 0, quantity: 0 };
    }
    byType[eventType].events += 1;
    byType[eventType].quantity += Number(event.quantity || 0);

    const day = String(event.created_at || '').slice(0, 10);
    const dayKey = day || 'unknown';
    if (!byDay[dayKey]) byDay[dayKey] = { day: dayKey, events: 0, quantity: 0 };
    byDay[dayKey].events += 1;
    byDay[dayKey].quantity += Number(event.quantity || 0);

    if (eventType === 'download_images') {
      imageDownloadFileCount += Number(event.meta?.fileCount || 0);
      imageDownloadBytes += Number(event.meta?.bytes || 0);
    }
  });

  return {
    byType,
    byDay: Object.values(byDay).sort((a, b) => b.day.localeCompare(a.day)),
    imageDownloadFileCount,
    imageDownloadBytes,
  };
}

async function buildAdminUsageSummaryAsync({ days = 30, since, until, userId = '', mapId = '' } = {}) {
  await ensureOptionalUsageSchemasAsync();
  const range = normalizeDateRange({ days, since, until });
  const [
    usageEvents,
    scanSummary,
    mapInventory,
    imageStorage,
    collaborationSummary,
    emailSummary,
    jobSummary,
    topUsers,
  ] = await Promise.all([
    listUsageEventsAsync({ range, userId, mapId }),
    getScanSummaryAsync({ range, userId, mapId }),
    getMapInventoryAsync({ userId, mapId }),
    getImageStorageSummaryAsync({ userId, mapId }),
    getCollaborationSummaryAsync({ range, userId, mapId }),
    getEmailSummaryAsync({ range, userId, mapId }),
    getJobSummaryAsync({ range, userId, mapId }),
    getTopUsersAsync({ range }),
  ]);

  const eventSummary = summarizeUsageEvents(usageEvents);
  const summary = {
    events: usageEvents.length,
    scanPages: scanSummary.pages,
    scanRuns: scanSummary.scans,
    scanMaxPages: scanSummary.maxPages,
    projects: mapInventory.projects,
    maps: mapInventory.maps,
    mapPages: mapInventory.mapPages,
    imageAssets: imageStorage.assets,
    imageStorageBytes: imageStorage.bytes,
    thumbnailScreenshots: imageStorage.thumbnails,
    fullPageScreenshots: imageStorage.full,
    imageDownloadFileCount: eventSummary.imageDownloadFileCount,
    imageDownloadBytes: eventSummary.imageDownloadBytes,
    emails: emailSummary.emails,
    jobFailures: jobSummary.failed,
    ...collaborationSummary,
  };

  return {
    range,
    filters: {
      userId: userId || null,
      mapId: mapId || null,
    },
    summary,
    events: {
      byType: Object.values(eventSummary.byType).sort((a, b) => b.quantity - a.quantity),
      byDay: eventSummary.byDay,
    },
    imageStorage,
    email: emailSummary,
    jobs: jobSummary,
    topUsers,
  };
}

module.exports = {
  buildAdminUsageSummaryAsync,
  normalizeDateRange,
};
