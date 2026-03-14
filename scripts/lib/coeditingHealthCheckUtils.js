function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function splitCsv(value, fallback = []) {
  const parsed = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallback];
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

async function fetchJsonWithRetries(url, {
  label = 'request',
  headers = {},
  attempts = 3,
  retryMs = 250,
} = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const error = new Error(`${label} failed with status ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      const isRetriableStatus = Number(error?.status) >= 500;
      const isLastAttempt = attempt === attempts;
      if (isLastAttempt || (!isRetriableStatus && error?.status)) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }

  throw lastError || new Error(`${label} failed`);
}

function validatePublicHealthPayload(payload, {
  expectedStatuses = ['disabled', 'healthy', 'read_only'],
  requireReadOnlyFallbackInactive = false,
} = {}) {
  if (!payload || payload.ok !== true) {
    throw new Error('Coediting health payload did not report ok=true');
  }
  if (!expectedStatuses.includes(payload.status)) {
    throw new Error(`Unexpected coediting status: ${payload.status}`);
  }
  if (!payload.health || !payload.rollout) {
    throw new Error('Coediting health payload is missing health/rollout sections');
  }
  if (requireReadOnlyFallbackInactive && payload.health.readOnlyFallbackActive) {
    throw new Error('Coediting health payload reported read-only fallback active');
  }

  return {
    status: payload.status,
    readOnlyFallbackActive: !!payload.health.readOnlyFallbackActive,
    source: payload.health.source || null,
    reason: payload.reason || null,
  };
}

function validateAdminCanaryPayload(payload, {
  expectedStatuses = ['healthy'],
  requireReadOnlyFallbackInactive = true,
  requireExperimentEnabled = true,
  requireSyncEngineEnabled = true,
  requireRolloutEnabled = true,
  requireDistributedSource = true,
  maxRecentConflicts = 20,
  maxRecentReconnects = 5,
  maxRecentDropped = 5,
  maxRecentReadOnlyBlocks = 0,
  minScopedEntities = 1,
} = {}) {
  const summary = validatePublicHealthPayload(payload, {
    expectedStatuses,
    requireReadOnlyFallbackInactive,
  });
  const rollout = payload.rollout || {};
  const health = payload.health || {};
  const metrics = health.metrics || {};
  const scopedEntities = Number(rollout.scopedUsers || 0) + Number(rollout.scopedMaps || 0);

  if (requireExperimentEnabled && rollout.experimentEnabled !== true) {
    throw new Error('Coediting canary gate requires experimentEnabled=true');
  }
  if (requireSyncEngineEnabled && rollout.syncEngineEnabled !== true) {
    throw new Error('Coediting canary gate requires syncEngineEnabled=true');
  }
  if (requireRolloutEnabled && rollout.rolloutEnabled !== true) {
    throw new Error('Coediting canary gate requires rolloutEnabled=true');
  }
  if (requireDistributedSource && health.source !== 'distributed') {
    throw new Error(`Coediting canary gate requires distributed health source, received ${health.source || 'unknown'}`);
  }
  if (minScopedEntities > 0 && scopedEntities < minScopedEntities) {
    throw new Error(`Coediting canary gate requires at least ${minScopedEntities} scoped rollout entities`);
  }

  const conflictsRecent = Number(metrics.conflicts?.recent || 0);
  const reconnectsRecent = Number(metrics.reconnects?.recent || 0);
  const droppedRecent = Number(metrics.dropped?.recent || 0);
  const readOnlyBlocksRecent = Number(metrics.readOnlyBlocks?.recent || 0);

  if (conflictsRecent > maxRecentConflicts) {
    throw new Error(`Recent conflict count ${conflictsRecent} exceeded max ${maxRecentConflicts}`);
  }
  if (reconnectsRecent > maxRecentReconnects) {
    throw new Error(`Recent reconnect count ${reconnectsRecent} exceeded max ${maxRecentReconnects}`);
  }
  if (droppedRecent > maxRecentDropped) {
    throw new Error(`Recent dropped count ${droppedRecent} exceeded max ${maxRecentDropped}`);
  }
  if (readOnlyBlocksRecent > maxRecentReadOnlyBlocks) {
    throw new Error(`Recent read-only block count ${readOnlyBlocksRecent} exceeded max ${maxRecentReadOnlyBlocks}`);
  }

  return {
    ...summary,
    scopedEntities,
    conflictsRecent,
    reconnectsRecent,
    droppedRecent,
    readOnlyBlocksRecent,
    rolloutEnabled: !!rollout.rolloutEnabled,
    experimentEnabled: !!rollout.experimentEnabled,
    syncEngineEnabled: !!rollout.syncEngineEnabled,
  };
}

module.exports = {
  parseEnvBool,
  splitCsv,
  parseNonNegativeInt,
  fetchJsonWithRetries,
  validatePublicHealthPayload,
  validateAdminCanaryPayload,
};
