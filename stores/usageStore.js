const adapter = require('./dbAdapter');

function toSqlTimestamp(date) {
  return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

function getUsageByDaySince(sinceModifier) {
  return adapter.queryAll(`
    SELECT date(created_at) as day, event_type as eventType,
           COUNT(*) as events, SUM(quantity) as quantity
    FROM usage_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY day, eventType
    ORDER BY day DESC
  `, [sinceModifier]);
}

function getUsageByDaySinceAsync(sinceModifier) {
  return adapter.queryAllAsync(`
    SELECT date(created_at) as day, event_type as eventType,
           COUNT(*) as events, SUM(quantity) as quantity
    FROM usage_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY day, eventType
    ORDER BY day DESC
  `, [sinceModifier]);
}

function getUsageTotalsSince(sinceModifier) {
  return adapter.queryAll(`
    SELECT event_type as eventType, COUNT(*) as events, SUM(quantity) as quantity
    FROM usage_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY eventType
    ORDER BY events DESC
  `, [sinceModifier]);
}

function getUsageTotalsSinceAsync(sinceModifier) {
  return adapter.queryAllAsync(`
    SELECT event_type as eventType, COUNT(*) as events, SUM(quantity) as quantity
    FROM usage_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY eventType
    ORDER BY events DESC
  `, [sinceModifier]);
}

function insertUsageEvent({
  id,
  userId,
  apiKey,
  ipHash,
  eventType,
  quantity = 1,
  meta = null,
}) {
  adapter.execute(`
    INSERT INTO usage_events (id, user_id, api_key, ip_hash, event_type, quantity, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId || null,
    apiKey || null,
    ipHash || null,
    eventType,
    quantity,
    meta ? JSON.stringify(meta) : null,
  ]);
}

function insertUsageEventAsync({
  id,
  userId,
  apiKey,
  ipHash,
  eventType,
  quantity = 1,
  meta = null,
}) {
  return adapter.executeAsync(`
    INSERT INTO usage_events (id, user_id, api_key, ip_hash, event_type, quantity, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userId || null,
    apiKey || null,
    ipHash || null,
    eventType,
    quantity,
    meta ? JSON.stringify(meta) : null,
  ]);
}

function getUsageTotalForWindow({
  eventType,
  identityColumn,
  identityValue,
  windowHours,
}) {
  const allowedIdentityColumns = new Set(['user_id', 'api_key', 'ip_hash']);
  if (!allowedIdentityColumns.has(identityColumn)) {
    throw new Error(`Unsupported identity column: ${identityColumn}`);
  }
  const hours = Number(windowHours);
  if (!Number.isFinite(hours) || hours <= 0) return 0;

  const cutoff = toSqlTimestamp(Date.now() - (hours * 60 * 60 * 1000));
  const row = adapter.queryOne(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM usage_events
    WHERE event_type = ?
      AND ${identityColumn} = ?
      AND created_at >= ?
  `, [eventType, identityValue, cutoff]);

  return Number(row?.total || 0);
}

async function getUsageTotalForWindowAsync({
  eventType,
  identityColumn,
  identityValue,
  windowHours,
}) {
  const allowedIdentityColumns = new Set(['user_id', 'api_key', 'ip_hash']);
  if (!allowedIdentityColumns.has(identityColumn)) {
    throw new Error(`Unsupported identity column: ${identityColumn}`);
  }
  const hours = Number(windowHours);
  if (!Number.isFinite(hours) || hours <= 0) return 0;

  const cutoff = toSqlTimestamp(Date.now() - (hours * 60 * 60 * 1000));
  const row = await adapter.queryOneAsync(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM usage_events
    WHERE event_type = ?
      AND ${identityColumn} = ?
      AND created_at >= ?
  `, [eventType, identityValue, cutoff]);

  return Number(row?.total || 0);
}

module.exports = {
  getUsageByDaySince,
  getUsageByDaySinceAsync,
  getUsageTotalsSince,
  getUsageTotalsSinceAsync,
  insertUsageEvent,
  insertUsageEventAsync,
  getUsageTotalForWindow,
  getUsageTotalForWindowAsync,
};
