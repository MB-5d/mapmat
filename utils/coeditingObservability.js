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

function getCoeditingHealthSnapshot(env = process.env) {
  const config = createCoeditingObservabilityConfigFromEnv(env);
  const now = Date.now();
  const windowStart = now - (config.windowSec * 1000);

  metricState.commitLatencies = pruneEntries(metricState.commitLatencies, windowStart);
  metricState.conflicts = pruneEntries(metricState.conflicts, windowStart);
  metricState.reconnects = pruneEntries(metricState.reconnects, windowStart);
  metricState.dropped = pruneEntries(metricState.dropped, windowStart);
  metricState.readOnlyBlocks = pruneEntries(metricState.readOnlyBlocks, windowStart);

  const recentConflicts = metricState.conflicts.length;
  const recentReconnects = metricState.reconnects.length;
  const recentDropped = metricState.dropped.length;
  const latency = getLatencySummary(metricState.commitLatencies);

  const reasons = [];
  if (config.forceReadOnly) reasons.push('force_read_only');
  if (config.conflictLimit > 0 && recentConflicts >= config.conflictLimit) reasons.push('conflict_limit');
  if (config.reconnectLimit > 0 && recentReconnects >= config.reconnectLimit) reasons.push('reconnect_limit');
  if (config.droppedLimit > 0 && recentDropped >= config.droppedLimit) reasons.push('dropped_limit');

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
      commitLatencyMs: latency,
      conflicts: {
        recent: recentConflicts,
        total: metricState.totals.conflicts,
      },
      reconnects: {
        recent: recentReconnects,
        total: metricState.totals.reconnects,
      },
      dropped: {
        recent: recentDropped,
        total: metricState.totals.dropped,
        reasons: summarizeReasonCounts(metricState.dropped),
      },
      readOnlyBlocks: {
        recent: metricState.readOnlyBlocks.length,
        total: metricState.totals.readOnlyBlocks,
      },
      committedOps: {
        total: metricState.totals.commitLatencyCount,
      },
    },
    observedAt: new Date(now).toISOString(),
  };
}

module.exports = {
  createCoeditingObservabilityConfigFromEnv,
  recordCommitLatency,
  recordVersionConflict,
  recordReconnectEvent,
  recordDroppedEvent,
  recordReadOnlyBlock,
  getCoeditingHealthSnapshot,
};
