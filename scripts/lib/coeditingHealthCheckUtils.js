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

function createCanaryGateConfigFromEnv(env = process.env) {
  return {
    healthUrl: env.COEDITING_HEALTH_URL || 'http://localhost:4002/health/coediting',
    adminUrl: env.COEDITING_ADMIN_URL || '',
    adminKey: env.COEDITING_ADMIN_KEY || '',
    expectedPublicStatuses: splitCsv(env.COEDITING_EXPECT_PUBLIC_STATUSES, ['healthy']),
    expectedAdminStatuses: splitCsv(env.COEDITING_EXPECT_ADMIN_STATUSES, ['healthy']),
    requireReadOnlyFallbackInactive: parseEnvBool(
      env.COEDITING_REQUIRE_READ_ONLY_FALLBACK_INACTIVE,
      true
    ),
    requireExperimentEnabled: parseEnvBool(env.COEDITING_REQUIRE_EXPERIMENT_ENABLED, true),
    requireSyncEngineEnabled: parseEnvBool(env.COEDITING_REQUIRE_SYNC_ENGINE_ENABLED, true),
    requireRolloutEnabled: parseEnvBool(env.COEDITING_REQUIRE_ROLLOUT_ENABLED, true),
    requireDistributedSource: parseEnvBool(env.COEDITING_REQUIRE_DISTRIBUTED_SOURCE, true),
    requireConfigValid: parseEnvBool(env.COEDITING_REQUIRE_CONFIG_VALID, true),
    requireInstanceAgreement: parseEnvBool(env.COEDITING_REQUIRE_INSTANCE_AGREEMENT, true),
    requireAllowGlobalRolloutFalse: parseEnvBool(
      env.COEDITING_REQUIRE_ALLOW_GLOBAL_ROLLOUT_FALSE,
      true
    ),
    maxRecentConflicts: parseNonNegativeInt(env.COEDITING_MAX_RECENT_CONFLICTS, 20),
    maxRecentReconnects: parseNonNegativeInt(env.COEDITING_MAX_RECENT_RECONNECTS, 5),
    maxRecentDropped: parseNonNegativeInt(env.COEDITING_MAX_RECENT_DROPPED, 5),
    maxRecentReadOnlyBlocks: parseNonNegativeInt(env.COEDITING_MAX_RECENT_READ_ONLY_BLOCKS, 0),
    minScopedEntities: parseNonNegativeInt(env.COEDITING_MIN_SCOPED_ENTITIES, 1),
  };
}

function createCanaryWindowConfigFromEnv(env = process.env) {
  return {
    windowSec: Math.max(1, parseNonNegativeInt(env.COEDITING_CANARY_WINDOW_SEC, 300)),
    pollIntervalSec: Math.max(1, parseNonNegativeInt(env.COEDITING_CANARY_POLL_INTERVAL_SEC, 30)),
    minSamples: Math.max(1, parseNonNegativeInt(env.COEDITING_CANARY_MIN_SAMPLES, 3)),
    requireStableScopeCount: parseEnvBool(env.COEDITING_CANARY_REQUIRE_STABLE_SCOPE_COUNT, true),
  };
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
    instanceAgreementStatus: payload.rollout.instanceAgreementStatus || null,
  };
}

function validateAdminCanaryPayload(payload, {
  expectedStatuses = ['healthy'],
  requireReadOnlyFallbackInactive = true,
  requireExperimentEnabled = true,
  requireSyncEngineEnabled = true,
  requireRolloutEnabled = true,
  requireDistributedSource = true,
  requireConfigValid = true,
  requireInstanceAgreement = true,
  requireAllowGlobalRolloutFalse = true,
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
  if (requireAllowGlobalRolloutFalse && rollout.allowGlobalRollout === true) {
    throw new Error('Coediting canary gate requires allowGlobalRollout=false');
  }
  if (requireConfigValid && rollout.configValid === false) {
    throw new Error(
      `Coediting canary gate requires configValid=true${Array.isArray(rollout.configErrors) && rollout.configErrors.length > 0
        ? ` (${rollout.configErrors.join(', ')})`
        : ''}`
    );
  }
  if (requireDistributedSource && health.source !== 'distributed') {
    throw new Error(`Coediting canary gate requires distributed health source, received ${health.source || 'unknown'}`);
  }
  if (requireInstanceAgreement && rollout.instanceAgreementStatus !== 'consistent') {
    throw new Error(
      `Coediting canary gate requires instanceAgreementStatus=consistent, received ${rollout.instanceAgreementStatus}`
    );
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
    configValid: rollout.configValid !== false,
    instanceAgreementStatus: rollout.instanceAgreementStatus || null,
  };
}

async function fetchCoeditingCanarySampleAsync({
  healthUrl,
  adminUrl,
  adminKey,
} = {}) {
  if (!healthUrl) {
    throw new Error('COEDITING_HEALTH_URL is required');
  }
  if (!adminUrl) {
    throw new Error('COEDITING_ADMIN_URL is required');
  }
  if (!adminKey) {
    throw new Error('COEDITING_ADMIN_KEY is required');
  }

  const [publicPayload, adminPayload] = await Promise.all([
    fetchJsonWithRetries(healthUrl, {
      label: 'coediting health request',
    }),
    fetchJsonWithRetries(adminUrl, {
      label: 'coediting admin request',
      headers: {
        'x-admin-key': adminKey,
      },
    }),
  ]);

  return {
    publicPayload,
    adminPayload,
  };
}

function validateCoeditingCanarySample({
  publicPayload,
  adminPayload,
} = {}, gateConfig = {}) {
  const publicSummary = validatePublicHealthPayload(publicPayload, {
    expectedStatuses: gateConfig.expectedPublicStatuses,
    requireReadOnlyFallbackInactive: gateConfig.requireReadOnlyFallbackInactive,
  });
  const adminSummary = validateAdminCanaryPayload(adminPayload, {
    expectedStatuses: gateConfig.expectedAdminStatuses,
    requireReadOnlyFallbackInactive: gateConfig.requireReadOnlyFallbackInactive,
    requireExperimentEnabled: gateConfig.requireExperimentEnabled,
    requireSyncEngineEnabled: gateConfig.requireSyncEngineEnabled,
    requireRolloutEnabled: gateConfig.requireRolloutEnabled,
    requireDistributedSource: gateConfig.requireDistributedSource,
    requireConfigValid: gateConfig.requireConfigValid,
    requireInstanceAgreement: gateConfig.requireInstanceAgreement,
    requireAllowGlobalRolloutFalse: gateConfig.requireAllowGlobalRolloutFalse,
    maxRecentConflicts: gateConfig.maxRecentConflicts,
    maxRecentReconnects: gateConfig.maxRecentReconnects,
    maxRecentDropped: gateConfig.maxRecentDropped,
    maxRecentReadOnlyBlocks: gateConfig.maxRecentReadOnlyBlocks,
    minScopedEntities: gateConfig.minScopedEntities,
  });

  return {
    publicSummary,
    adminSummary,
  };
}

function sleepAsync(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCoeditingCanaryWindowCheckAsync({
  fetchSampleAsync,
  gateConfig = {},
  windowMs,
  pollIntervalMs,
  minSamples = 1,
  requireStableScopeCount = true,
  onSample = null,
} = {}) {
  if (typeof fetchSampleAsync !== 'function') {
    throw new Error('fetchSampleAsync is required');
  }

  const normalizedWindowMs = Math.max(0, Number.parseInt(windowMs, 10) || 0);
  const normalizedPollIntervalMs = Math.max(0, Number.parseInt(pollIntervalMs, 10) || 0);
  const normalizedMinSamples = Math.max(1, Number.parseInt(minSamples, 10) || 1);
  const startedAt = Date.now();
  const samples = [];
  let baseline = null;

  while (true) {
    const rawSample = await fetchSampleAsync();
    const validated = validateCoeditingCanarySample(rawSample, gateConfig);
    const sample = {
      index: samples.length + 1,
      observedAt: new Date().toISOString(),
      publicSummary: validated.publicSummary,
      adminSummary: validated.adminSummary,
    };

    if (!baseline) {
      baseline = {
        publicStatus: sample.publicSummary.status,
        adminStatus: sample.adminSummary.status,
        source: sample.adminSummary.source,
        scopedEntities: sample.adminSummary.scopedEntities,
        instanceAgreementStatus: sample.adminSummary.instanceAgreementStatus,
      };
    } else {
      if (sample.publicSummary.status !== baseline.publicStatus) {
        throw new Error(
          `Public canary status drifted from ${baseline.publicStatus} to ${sample.publicSummary.status}`
        );
      }
      if (sample.adminSummary.status !== baseline.adminStatus) {
        throw new Error(
          `Admin canary status drifted from ${baseline.adminStatus} to ${sample.adminSummary.status}`
        );
      }
      if (sample.adminSummary.source !== baseline.source) {
        throw new Error(
          `Coediting canary source drifted from ${baseline.source} to ${sample.adminSummary.source}`
        );
      }
      if (
        gateConfig.requireInstanceAgreement
        && sample.adminSummary.instanceAgreementStatus !== baseline.instanceAgreementStatus
      ) {
        throw new Error(
          `Coediting canary instance agreement drifted from ${baseline.instanceAgreementStatus} to ${sample.adminSummary.instanceAgreementStatus}`
        );
      }
      if (
        requireStableScopeCount
        && sample.adminSummary.scopedEntities !== baseline.scopedEntities
      ) {
        throw new Error(
          `Coediting canary scoped rollout entity count drifted from ${baseline.scopedEntities} to ${sample.adminSummary.scopedEntities}`
        );
      }
    }

    samples.push(sample);
    if (typeof onSample === 'function') {
      onSample(sample);
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingWindowMs = normalizedWindowMs - elapsedMs;
    if (samples.length >= normalizedMinSamples && remainingWindowMs <= 0) {
      break;
    }

    const sleepMs = samples.length >= normalizedMinSamples
      ? Math.max(0, Math.min(normalizedPollIntervalMs, remainingWindowMs))
      : normalizedPollIntervalMs;
    if (sleepMs > 0) {
      await sleepAsync(sleepMs);
    }
  }

  return {
    sampleCount: samples.length,
    durationMs: Date.now() - startedAt,
    baseline,
    maxConflictsRecent: Math.max(...samples.map((sample) => sample.adminSummary.conflictsRecent)),
    maxReconnectsRecent: Math.max(...samples.map((sample) => sample.adminSummary.reconnectsRecent)),
    maxDroppedRecent: Math.max(...samples.map((sample) => sample.adminSummary.droppedRecent)),
    maxReadOnlyBlocksRecent: Math.max(
      ...samples.map((sample) => sample.adminSummary.readOnlyBlocksRecent)
    ),
    samples,
  };
}

module.exports = {
  parseEnvBool,
  splitCsv,
  parseNonNegativeInt,
  createCanaryGateConfigFromEnv,
  createCanaryWindowConfigFromEnv,
  fetchJsonWithRetries,
  fetchCoeditingCanarySampleAsync,
  validatePublicHealthPayload,
  validateAdminCanaryPayload,
  validateCoeditingCanarySample,
  runCoeditingCanaryWindowCheckAsync,
};
