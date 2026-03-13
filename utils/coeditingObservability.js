const coeditingStore = require('../stores/coeditingStore');

const OBSERVABILITY_BUCKET_MS = 10000;
const OBSERVABILITY_PRUNE_INTERVAL_MS = 3600000;
const ERROR_LOG_THROTTLE_MS = 60000;

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function clampInt(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function createCoeditingObservabilityConfigFromEnv(env = process.env) {
  return {
    forceReadOnly: parseEnvBool(env.COEDITING_FORCE_READ_ONLY, false),
    distributedEnabled: parseEnvBool(env.COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED, false),
    retentionDays: clampInt(
      env.COEDITING_DISTRIBUTED_OBSERVABILITY_RETENTION_DAYS,
      30,
      { min: 1, max: 365 }
    ),
    windowSec: clampInt(env.COEDITING_METRICS_WINDOW_SEC, 300, { min: 30, max: 3600 }),
    conflictLimit: clampInt(env.COEDITING_DEGRADE_CONFLICTS_PER_WINDOW, 0, { min: 0, max: 100000 }),
    reconnectLimit: clampInt(env.COEDITING_DEGRADE_RECONNECTS_PER_WINDOW, 0, { min: 0, max: 100000 }),
    droppedLimit: clampInt(env.COEDITING_DEGRADE_DROPPED_PER_WINDOW, 0, { min: 0, max: 100000 }),
  };
}

const metricState = {
  commitLatencies: [],
  conflicts: [],
  reconnects: [],
  dropped: [],
  readOnlyBlocks: [],
  totals: {
    commitLatencyCount: 0,
    commitLatencySumMs: 0,
    conflicts: 0,
    reconnects: 0,
    dropped: 0,
    readOnlyBlocks: 0,
  },
};

const loggedErrors = new Map();
let lastDistributedPruneAt = 0;

function logObservabilityError(kind, error) {
  const now = Date.now();
  const lastLoggedAt = loggedErrors.get(kind) || 0;
  if (now - lastLoggedAt < ERROR_LOG_THROTTLE_MS) return;
  loggedErrors.set(kind, now);
  console.error(`Coediting observability ${kind} error:`, error);
}

function pruneEntries(entries, windowStart, maxEntries = 2000) {
  const next = entries.filter((entry) => entry.ts >= windowStart);
  if (next.length <= maxEntries) return next;
  return next.slice(next.length - maxEntries);
}

function recordEvent(bucketName, value = null, now = Date.now()) {
  const bucket = metricState[bucketName];
  if (!Array.isArray(bucket)) return;
  bucket.push({ ts: now, value });
}

function recordCommitLatency(ms, now = Date.now()) {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0;
  metricState.totals.commitLatencyCount += 1;
  metricState.totals.commitLatencySumMs += safeMs;
  recordEvent('commitLatencies', safeMs, now);
}

function recordVersionConflict(now = Date.now()) {
  metricState.totals.conflicts += 1;
  recordEvent('conflicts', null, now);
}

function recordReconnectEvent(now = Date.now()) {
  metricState.totals.reconnects += 1;
  recordEvent('reconnects', null, now);
}

function recordDroppedEvent(reason = 'unknown', now = Date.now()) {
  metricState.totals.dropped += 1;
  recordEvent('dropped', String(reason || 'unknown'), now);
}

function recordReadOnlyBlock(now = Date.now()) {
  metricState.totals.readOnlyBlocks += 1;
  recordEvent('readOnlyBlocks', null, now);
}

function getLatencySummary(entries) {
  const values = entries
    .map((entry) => Number(entry.value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return {
      count: 0,
      avgMs: 0,
      p95Ms: 0,
    };
  }

  const sum = values.reduce((total, value) => total + value, 0);
  const percentileIndex = Math.max(0, Math.ceil(values.length * 0.95) - 1);
  return {
    count: values.length,
    avgMs: Math.round(sum / values.length),
    p95Ms: values[percentileIndex],
  };
}

function summarizeReasonCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    const reason = String(entry.value || 'unknown');
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

function buildHealthSnapshot(config, {
  commitLatencyCount,
  commitLatencyAvgMs,
  commitLatencyP95Ms,
  conflictsRecent,
  conflictsTotal,
  reconnectsRecent,
  reconnectsTotal,
  droppedRecent,
  droppedTotal,
  droppedReasons,
  readOnlyBlocksRecent,
  readOnlyBlocksTotal,
  committedOpsTotal,
  source,
  observedAt,
}) {
  const reasons = [];
  if (config.forceReadOnly) reasons.push('force_read_only');
  if (config.conflictLimit > 0 && conflictsRecent >= config.conflictLimit) reasons.push('conflict_limit');
  if (config.reconnectLimit > 0 && reconnectsRecent >= config.reconnectLimit) reasons.push('reconnect_limit');
  if (config.droppedLimit > 0 && droppedRecent >= config.droppedLimit) reasons.push('dropped_limit');

  return {
    status: reasons.length > 0 ? 'read_only' : 'healthy',
    readOnlyFallbackActive: reasons.length > 0,
    reasons,
    windowSec: config.windowSec,
    thresholds: {
      forceReadOnly: config.forceReadOnly,
      conflictLimit: config.conflictLimit,
      reconnectLimit: config.reconnectLimit,
      droppedLimit: config.droppedLimit,
    },
    metrics: {
      commitLatencyMs: {
        count: commitLatencyCount,
        avgMs: commitLatencyAvgMs,
        p95Ms: commitLatencyP95Ms,
      },
      conflicts: {
        recent: conflictsRecent,
        total: conflictsTotal,
      },
      reconnects: {
        recent: reconnectsRecent,
        total: reconnectsTotal,
      },
      dropped: {
        recent: droppedRecent,
        total: droppedTotal,
        reasons: droppedReasons,
      },
      readOnlyBlocks: {
        recent: readOnlyBlocksRecent,
        total: readOnlyBlocksTotal,
      },
      committedOps: {
        total: committedOpsTotal,
      },
    },
    source,
    observedAt,
  };
}

function getLocalMetricSummary(env = process.env) {
  const config = createCoeditingObservabilityConfigFromEnv(env);
  const now = Date.now();
  const windowStart = now - (config.windowSec * 1000);

  metricState.commitLatencies = pruneEntries(metricState.commitLatencies, windowStart);
  metricState.conflicts = pruneEntries(metricState.conflicts, windowStart);
  metricState.reconnects = pruneEntries(metricState.reconnects, windowStart);
  metricState.dropped = pruneEntries(metricState.dropped, windowStart);
  metricState.readOnlyBlocks = pruneEntries(metricState.readOnlyBlocks, windowStart);

  const latency = getLatencySummary(metricState.commitLatencies);
  return buildHealthSnapshot(config, {
    commitLatencyCount: latency.count,
    commitLatencyAvgMs: latency.avgMs,
    commitLatencyP95Ms: latency.p95Ms,
    conflictsRecent: metricState.conflicts.length,
    conflictsTotal: metricState.totals.conflicts,
    reconnectsRecent: metricState.reconnects.length,
    reconnectsTotal: metricState.totals.reconnects,
    droppedRecent: metricState.dropped.length,
    droppedTotal: metricState.totals.dropped,
    droppedReasons: summarizeReasonCounts(metricState.dropped),
    readOnlyBlocksRecent: metricState.readOnlyBlocks.length,
    readOnlyBlocksTotal: metricState.totals.readOnlyBlocks,
    committedOpsTotal: metricState.totals.commitLatencyCount,
    source: 'local',
    observedAt: new Date(now).toISOString(),
  });
}

function normalizeBucketReason(reason) {
  const normalized = String(reason || '').trim();
  return normalized || '';
}

function toBucketStart(now) {
  return new Date(Math.floor(now / OBSERVABILITY_BUCKET_MS) * OBSERVABILITY_BUCKET_MS).toISOString();
}

async function maybePruneDistributedBucketsAsync(env = process.env, now = Date.now()) {
  const config = createCoeditingObservabilityConfigFromEnv(env);
  if (!config.distributedEnabled) return false;
  if (now - lastDistributedPruneAt < OBSERVABILITY_PRUNE_INTERVAL_MS) return false;
  lastDistributedPruneAt = now;

  const retentionCutoff = new Date(now - (config.retentionDays * 86400000)).toISOString();
  try {
    await coeditingStore.deleteObservabilityBucketsBeforeAsync(retentionCutoff);
    return true;
  } catch (error) {
    logObservabilityError('prune', error);
    return false;
  }
}

async function persistDistributedMetricAsync({
  metricType,
  reason = '',
  sampleCount = 1,
  valueSum = 0,
  valueMax = 0,
  now = Date.now(),
  env = process.env,
}) {
  const config = createCoeditingObservabilityConfigFromEnv(env);
  if (!config.distributedEnabled) return false;

  try {
    await coeditingStore.ensureCoeditingSchemaAsync();
    await maybePruneDistributedBucketsAsync(env, now);
    await coeditingStore.recordObservabilityMetricAsync({
      bucketStart: toBucketStart(now),
      metricType,
      reason: normalizeBucketReason(reason),
      sampleCount,
      valueSum,
      valueMax,
    });
    return true;
  } catch (error) {
    logObservabilityError('persist', error);
    return false;
  }
}

function buildDistributedMetricSummary(rows) {
  const summary = {
    commitLatency: {
      count: 0,
      sumMs: 0,
    },
    conflicts: 0,
    reconnects: 0,
    dropped: 0,
    droppedReasons: {},
    readOnlyBlocks: 0,
  };

  for (const row of rows) {
    const metricType = String(row.metric_type || '').trim();
    const sampleCount = Number(row.sample_count || 0);
    const valueSum = Number(row.value_sum || 0);
    const reason = normalizeBucketReason(row.reason);

    if (metricType === 'commit_latency') {
      summary.commitLatency.count += sampleCount;
      summary.commitLatency.sumMs += valueSum;
      continue;
    }
    if (metricType === 'conflict') {
      summary.conflicts += sampleCount;
      continue;
    }
    if (metricType === 'reconnect') {
      summary.reconnects += sampleCount;
      continue;
    }
    if (metricType === 'dropped') {
      summary.dropped += sampleCount;
      if (reason) {
        summary.droppedReasons[reason] = (summary.droppedReasons[reason] || 0) + sampleCount;
      }
      continue;
    }
    if (metricType === 'read_only_block') {
      summary.readOnlyBlocks += sampleCount;
    }
  }

  return summary;
}

function getCoeditingHealthSnapshot(env = process.env) {
  return getLocalMetricSummary(env);
}

async function getCoeditingHealthSnapshotAsync(env = process.env) {
  const config = createCoeditingObservabilityConfigFromEnv(env);
  if (!config.distributedEnabled) {
    return getLocalMetricSummary(env);
  }

  try {
    const now = Date.now();
    const windowStart = now - (config.windowSec * 1000);
    const bucketStart = toBucketStart(windowStart);

    await coeditingStore.ensureCoeditingSchemaAsync();
    await maybePruneDistributedBucketsAsync(env, now);
    const [recentRows, totalRows] = await Promise.all([
      coeditingStore.listObservabilityBucketsAsync({ bucketStart }),
      coeditingStore.listObservabilityTotalsAsync(),
    ]);

    const recent = buildDistributedMetricSummary(recentRows);
    const totals = buildDistributedMetricSummary(totalRows);
    const commitLatencyAvgMs = recent.commitLatency.count > 0
      ? Math.round(recent.commitLatency.sumMs / recent.commitLatency.count)
      : 0;

    return buildHealthSnapshot(config, {
      commitLatencyCount: recent.commitLatency.count,
      commitLatencyAvgMs,
      commitLatencyP95Ms: recent.commitLatency.count > 0 ? null : 0,
      conflictsRecent: recent.conflicts,
      conflictsTotal: totals.conflicts,
      reconnectsRecent: recent.reconnects,
      reconnectsTotal: totals.reconnects,
      droppedRecent: recent.dropped,
      droppedTotal: totals.dropped,
      droppedReasons: recent.droppedReasons,
      readOnlyBlocksRecent: recent.readOnlyBlocks,
      readOnlyBlocksTotal: totals.readOnlyBlocks,
      committedOpsTotal: totals.commitLatency.count,
      source: 'distributed',
      observedAt: new Date(now).toISOString(),
    });
  } catch (error) {
    logObservabilityError('read', error);
    return {
      ...getLocalMetricSummary(env),
      source: 'local_fallback',
    };
  }
}

async function recordCommitLatencyAsync(ms, now = Date.now(), { env = process.env } = {}) {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0;
  recordCommitLatency(safeMs, now);
  return persistDistributedMetricAsync({
    metricType: 'commit_latency',
    sampleCount: 1,
    valueSum: safeMs,
    valueMax: safeMs,
    now,
    env,
  });
}

async function recordVersionConflictAsync(now = Date.now(), { env = process.env } = {}) {
  recordVersionConflict(now);
  return persistDistributedMetricAsync({
    metricType: 'conflict',
    sampleCount: 1,
    now,
    env,
  });
}

async function recordReconnectEventAsync(now = Date.now(), { env = process.env } = {}) {
  recordReconnectEvent(now);
  return persistDistributedMetricAsync({
    metricType: 'reconnect',
    sampleCount: 1,
    now,
    env,
  });
}

async function recordDroppedEventAsync(reason = 'unknown', now = Date.now(), { env = process.env } = {}) {
  const normalizedReason = String(reason || 'unknown').trim() || 'unknown';
  recordDroppedEvent(normalizedReason, now);
  return persistDistributedMetricAsync({
    metricType: 'dropped',
    reason: normalizedReason,
    sampleCount: 1,
    now,
    env,
  });
}

async function recordReadOnlyBlockAsync(now = Date.now(), { env = process.env } = {}) {
  recordReadOnlyBlock(now);
  return persistDistributedMetricAsync({
    metricType: 'read_only_block',
    sampleCount: 1,
    now,
    env,
  });
}

module.exports = {
  createCoeditingObservabilityConfigFromEnv,
  recordCommitLatency,
  recordVersionConflict,
  recordReconnectEvent,
  recordDroppedEvent,
  recordReadOnlyBlock,
  recordCommitLatencyAsync,
  recordVersionConflictAsync,
  recordReconnectEventAsync,
  recordDroppedEventAsync,
  recordReadOnlyBlockAsync,
  getCoeditingHealthSnapshot,
  getCoeditingHealthSnapshotAsync,
};
