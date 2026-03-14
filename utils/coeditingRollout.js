const crypto = require('crypto');
const os = require('os');
const permissionPolicy = require('../policies/permissionPolicy');
const coeditingStore = require('../stores/coeditingStore');
const {
  createCoeditingObservabilityConfigFromEnv,
  getCoeditingHealthSnapshot,
  getCoeditingHealthSnapshotAsync,
} = require('./coeditingObservability');

const ROLLOUT_OBSERVATION_ERROR_THROTTLE_MS = 60000;
const ROLLOUT_OBSERVATION_INTERVAL_MS = 30000;

const rolloutObservationState = new Map();
const rolloutLoggedErrors = new Map();

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseCsvIdSet(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function normalizeId(value) {
  return String(value || '').trim();
}

function sortIdSet(values) {
  return Array.from(values || []).map((value) => normalizeId(value)).filter(Boolean).sort();
}

function logRolloutObservationError(kind, error) {
  const now = Date.now();
  const lastLoggedAt = rolloutLoggedErrors.get(kind) || 0;
  if (now - lastLoggedAt < ROLLOUT_OBSERVATION_ERROR_THROTTLE_MS) return;
  rolloutLoggedErrors.set(kind, now);
  console.error(`Coediting rollout observation ${kind} error:`, error);
}

function createCoeditingRolloutConfigFromEnv(env = process.env) {
  return {
    experimentEnabled: parseEnvBool(env.COEDITING_EXPERIMENT_ENABLED, false),
    syncEngineEnabled: parseEnvBool(env.COEDITING_SYNC_ENGINE_ENABLED, false),
    rolloutEnabled: parseEnvBool(env.COEDITING_ROLLOUT_ENABLED, false),
    hardeningEnabled: parseEnvBool(env.COEDITING_ROLLOUT_HARDENING_ENABLED, false),
    allowGlobalRollout: parseEnvBool(env.COEDITING_ROLLOUT_ALLOW_GLOBAL, false),
    globalRolloutApproved: parseEnvBool(env.COEDITING_ROLLOUT_GLOBAL_APPROVED, false),
    requireInstanceAgreement: parseEnvBool(
      env.COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT,
      false
    ),
    distributedObservabilityEnabled: parseEnvBool(
      env.COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED,
      false
    ),
    adminApiKeyConfigured: Boolean(String(env.ADMIN_API_KEY || '').trim()),
    observationGroup:
      normalizeId(env.COEDITING_ROLLOUT_OBSERVATION_GROUP)
      || normalizeId(env.RAILWAY_ENVIRONMENT_NAME)
      || normalizeId(env.NODE_ENV)
      || 'default',
    instanceId:
      normalizeId(env.COEDITING_INSTANCE_ID)
      || normalizeId(env.RAILWAY_REPLICA_ID)
      || `${os.hostname()}:${process.pid}`,
    allowUserIds: parseCsvIdSet(env.COEDITING_ROLLOUT_USER_IDS),
    allowMapIds: parseCsvIdSet(env.COEDITING_ROLLOUT_MAP_IDS),
    blockUserIds: parseCsvIdSet(env.COEDITING_ROLLOUT_BLOCK_USER_IDS),
    blockMapIds: parseCsvIdSet(env.COEDITING_ROLLOUT_BLOCK_MAP_IDS),
  };
}

function evaluateCoeditingRolloutConfig(config) {
  const hasScope = config.allowUserIds.size > 0 || config.allowMapIds.size > 0;
  const configErrors = [];

  if (config.hardeningEnabled && config.rolloutEnabled) {
    if (!hasScope && !config.allowGlobalRollout) {
      configErrors.push('scope_required');
    }
    if (hasScope && config.allowGlobalRollout) {
      configErrors.push('global_scope_conflict');
    }
    if (!hasScope && config.allowGlobalRollout && !config.globalRolloutApproved) {
      configErrors.push('global_approval_required');
    }
    if (!config.distributedObservabilityEnabled) {
      configErrors.push('distributed_observability_required');
    }
    if (!config.adminApiKeyConfigured) {
      configErrors.push('admin_api_key_required');
    }
  }

  return {
    hasScope,
    configValid: configErrors.length === 0,
    configErrors,
  };
}

function createRolloutAgreementSummary(config, {
  status = null,
  observedInstanceCount = 0,
  observedFingerprintCount = 0,
  observedInvalidInstances = 0,
  observedAt = null,
} = {}) {
  if (!config.distributedObservabilityEnabled) {
    return {
      status: 'local_only',
      observedInstanceCount: 0,
      observedFingerprintCount: 0,
      observedInvalidInstances: 0,
      observedAt,
    };
  }

  return {
    status: status || 'unknown',
    observedInstanceCount,
    observedFingerprintCount,
    observedInvalidInstances,
    observedAt,
  };
}

function createRolloutFingerprint(config, validation) {
  const payload = {
    experimentEnabled: config.experimentEnabled,
    syncEngineEnabled: config.syncEngineEnabled,
    rolloutEnabled: config.rolloutEnabled,
    hardeningEnabled: config.hardeningEnabled,
    allowGlobalRollout: config.allowGlobalRollout,
    globalRolloutApproved: config.globalRolloutApproved,
    requireInstanceAgreement: config.requireInstanceAgreement,
    distributedObservabilityEnabled: config.distributedObservabilityEnabled,
    adminApiKeyConfigured: config.adminApiKeyConfigured,
    configValid: validation.configValid,
    allowUserIds: sortIdSet(config.allowUserIds),
    allowMapIds: sortIdSet(config.allowMapIds),
    blockUserIds: sortIdSet(config.blockUserIds),
    blockMapIds: sortIdSet(config.blockMapIds),
  };

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

async function maybeRecordRolloutObservationAsync({
  env = process.env,
  config,
  validation,
  now = Date.now(),
} = {}) {
  if (!config.distributedObservabilityEnabled) return null;

  const fingerprint = createRolloutFingerprint(config, validation);
  const stateKey = `${config.observationGroup}:${config.instanceId}`;
  const lastObservation = rolloutObservationState.get(stateKey) || null;
  if (
    lastObservation
    && lastObservation.fingerprint === fingerprint
    && (now - lastObservation.observedAt) < ROLLOUT_OBSERVATION_INTERVAL_MS
  ) {
    return fingerprint;
  }

  try {
    await coeditingStore.ensureCoeditingSchemaAsync();
    await coeditingStore.upsertRolloutObservationAsync({
      deploymentKey: config.observationGroup,
      instanceId: config.instanceId,
      fingerprint,
      configValid: validation.configValid,
      observedAt: new Date(now).toISOString(),
    });
    rolloutObservationState.set(stateKey, {
      fingerprint,
      observedAt: now,
    });
    return fingerprint;
  } catch (error) {
    logRolloutObservationError('persist', error);
    return null;
  }
}

async function getCoeditingRolloutAgreementAsync(env = process.env, {
  config = null,
  validation = null,
  now = Date.now(),
} = {}) {
  const effectiveConfig = config || createCoeditingRolloutConfigFromEnv(env);
  const effectiveValidation = validation || evaluateCoeditingRolloutConfig(effectiveConfig);
  if (!effectiveConfig.distributedObservabilityEnabled) {
    return createRolloutAgreementSummary(effectiveConfig, {
      observedAt: new Date(now).toISOString(),
    });
  }

  try {
    await maybeRecordRolloutObservationAsync({
      env,
      config: effectiveConfig,
      validation: effectiveValidation,
      now,
    });

    const observabilityConfig = createCoeditingObservabilityConfigFromEnv(env);
    const observedSince = new Date(now - (observabilityConfig.windowSec * 1000)).toISOString();
    const rows = await coeditingStore.listRecentRolloutObservationsAsync({
      deploymentKey: effectiveConfig.observationGroup,
      observedSince,
    });

    const fingerprints = new Set();
    const instanceIds = new Set();
    let observedInvalidInstances = 0;
    let observedAt = null;

    for (const row of rows) {
      const instanceId = normalizeId(row.instance_id);
      const fingerprint = normalizeId(row.fingerprint);
      if (instanceId) instanceIds.add(instanceId);
      if (fingerprint) fingerprints.add(fingerprint);
      if (Number(row.config_valid || 0) === 0) {
        observedInvalidInstances += 1;
      }
      if (!observedAt || String(row.observed_at || '') > observedAt) {
        observedAt = String(row.observed_at || '') || observedAt;
      }
    }

    return createRolloutAgreementSummary(effectiveConfig, {
      status: rows.length === 0
        ? 'unknown'
        : fingerprints.size > 1
          ? 'drift_detected'
          : 'consistent',
      observedInstanceCount: instanceIds.size,
      observedFingerprintCount: fingerprints.size,
      observedInvalidInstances,
      observedAt: observedAt || new Date(now).toISOString(),
    });
  } catch (error) {
    logRolloutObservationError('read', error);
    return createRolloutAgreementSummary(effectiveConfig, {
      status: 'unknown',
      observedAt: new Date(now).toISOString(),
    });
  }
}

function applyAgreementToValidation(config, validation, agreement) {
  const configErrors = [...validation.configErrors];
  const agreementStatus = agreement?.status
    || (config.distributedObservabilityEnabled ? 'unknown' : 'local_only');

  if (
    config.hardeningEnabled
    && config.rolloutEnabled
    && config.requireInstanceAgreement
    && agreementStatus !== 'consistent'
  ) {
    configErrors.push('instance_agreement_required');
  }

  return {
    hasScope: validation.hasScope,
    configValid: configErrors.length === 0,
    configErrors,
    instanceAgreementStatus: agreementStatus,
    observedInstanceCount: Number(agreement?.observedInstanceCount || 0),
    observedFingerprintCount: Number(agreement?.observedFingerprintCount || 0),
    observedInvalidInstances: Number(agreement?.observedInvalidInstances || 0),
    observedAt: agreement?.observedAt || null,
  };
}

function buildRolloutSummary(config, validation, {
  includeConfigErrors = true,
  includeSensitive = true,
} = {}) {
  return {
    experimentEnabled: config.experimentEnabled,
    syncEngineEnabled: config.syncEngineEnabled,
    rolloutEnabled: config.rolloutEnabled,
    hardeningEnabled: config.hardeningEnabled,
    allowGlobalRollout: config.allowGlobalRollout,
    globalRolloutApproved: config.globalRolloutApproved,
    requireInstanceAgreement: config.requireInstanceAgreement,
    instanceAgreementStatus: validation.instanceAgreementStatus
      || (config.distributedObservabilityEnabled ? 'unknown' : 'local_only'),
    configValid: validation.configValid,
    scopedUsers: config.allowUserIds.size,
    scopedMaps: config.allowMapIds.size,
    blockedUsers: config.blockUserIds.size,
    blockedMaps: config.blockMapIds.size,
    ...(includeSensitive
      ? {
        distributedObservabilityEnabled: config.distributedObservabilityEnabled,
        adminApiKeyConfigured: config.adminApiKeyConfigured,
        observedInstanceCount: validation.observedInstanceCount || 0,
        observedFingerprintCount: validation.observedFingerprintCount || 0,
        observedInvalidInstances: validation.observedInvalidInstances || 0,
        observedAt: validation.observedAt || null,
      }
      : {}),
    ...(includeConfigErrors ? { configErrors: validation.configErrors } : {}),
  };
}

function summarizeCoeditingRolloutConfig(
  env = process.env,
  { includeConfigErrors = true, includeSensitive = true } = {}
) {
  const config = createCoeditingRolloutConfigFromEnv(env);
  const baseValidation = evaluateCoeditingRolloutConfig(config);
  const validation = applyAgreementToValidation(
    config,
    baseValidation,
    createRolloutAgreementSummary(config)
  );
  return buildRolloutSummary(config, validation, {
    includeConfigErrors,
    includeSensitive,
  });
}

async function summarizeCoeditingRolloutConfigAsync(
  env = process.env,
  { includeConfigErrors = true, includeSensitive = true } = {}
) {
  const config = createCoeditingRolloutConfigFromEnv(env);
  const baseValidation = evaluateCoeditingRolloutConfig(config);
  const agreement = await getCoeditingRolloutAgreementAsync(env, {
    config,
    validation: baseValidation,
  });
  const validation = applyAgreementToValidation(config, baseValidation, agreement);
  return buildRolloutSummary(config, validation, {
    includeConfigErrors,
    includeSensitive,
  });
}

function resolveCoeditingRollout({
  mapId,
  actorId,
  role,
  env = process.env,
  healthSnapshot = null,
  config = null,
  validation = null,
} = {}) {
  const effectiveConfig = config || createCoeditingRolloutConfigFromEnv(env);
  const effectiveValidation = validation || applyAgreementToValidation(
    effectiveConfig,
    evaluateCoeditingRolloutConfig(effectiveConfig),
    createRolloutAgreementSummary(effectiveConfig)
  );
  const normalizedRole = permissionPolicy.normalizeRole(role);
  const normalizedMapId = normalizeId(mapId);
  const normalizedActorId = normalizeId(actorId);
  const effectiveHealth = healthSnapshot || getCoeditingHealthSnapshot(env);
  const reasons = [];

  const hasReadAccess = permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, normalizedRole);
  const hasWriteAccess = permissionPolicy.can(permissionPolicy.ACTIONS.MAP_UPDATE, normalizedRole);

  const hasUserScope = effectiveConfig.allowUserIds.size > 0;
  const hasMapScope = effectiveConfig.allowMapIds.size > 0;
  const matchesUserScope = hasUserScope
    && normalizedActorId
    && effectiveConfig.allowUserIds.has(normalizedActorId);
  const matchesMapScope = hasMapScope
    && normalizedMapId
    && effectiveConfig.allowMapIds.has(normalizedMapId);
  const blockedUser = normalizedActorId && effectiveConfig.blockUserIds.has(normalizedActorId);
  const blockedMap = normalizedMapId && effectiveConfig.blockMapIds.has(normalizedMapId);
  const scopeAllowed = (!hasUserScope && !hasMapScope) || matchesUserScope || matchesMapScope;

  let mode = 'disabled';
  let reason = 'experiment_disabled';

  if (!effectiveConfig.experimentEnabled) {
    reason = 'experiment_disabled';
    reasons.push(reason);
  } else if (!effectiveConfig.syncEngineEnabled) {
    reason = 'sync_engine_disabled';
    reasons.push(reason);
  } else if (!effectiveConfig.rolloutEnabled) {
    reason = 'rollout_disabled';
    reasons.push(reason);
  } else if (!effectiveValidation.configValid) {
    reason = 'config_invalid';
    reasons.push(reason);
  } else if (!hasReadAccess) {
    reason = 'map_access_denied';
    reasons.push(reason);
  } else if (blockedUser || blockedMap) {
    reason = 'scope_blocked';
    reasons.push(reason);
  } else if (!scopeAllowed) {
    reason = 'scope_not_enabled';
    reasons.push(reason);
  } else if (effectiveHealth.readOnlyFallbackActive) {
    mode = 'read_only';
    reason = 'health_degraded';
    reasons.push(reason, ...effectiveHealth.reasons);
  } else if (!hasWriteAccess) {
    mode = 'read_only';
    reason = 'role_read_only';
    reasons.push(reason);
  } else {
    mode = 'enabled';
    reason = 'enabled';
  }

  const uniqueReasons = Array.from(new Set(reasons));

  return {
    mode,
    reason,
    reasons: uniqueReasons,
    features: {
      coeditingLive: mode === 'enabled',
      coeditingReadOnly: mode === 'read_only',
    },
    health: {
      status: effectiveHealth.status,
      readOnlyFallbackActive: effectiveHealth.readOnlyFallbackActive,
      reasons: effectiveHealth.reasons,
      windowSec: effectiveHealth.windowSec,
    },
    scope: {
      rolloutEnabled: effectiveConfig.rolloutEnabled,
      hardeningEnabled: effectiveConfig.hardeningEnabled,
      allowGlobalRollout: effectiveConfig.allowGlobalRollout,
      globalRolloutApproved: effectiveConfig.globalRolloutApproved,
      requireInstanceAgreement: effectiveConfig.requireInstanceAgreement,
      instanceAgreementStatus: effectiveValidation.instanceAgreementStatus,
      configValid: effectiveValidation.configValid,
      scopedUsers: effectiveConfig.allowUserIds.size,
      scopedMaps: effectiveConfig.allowMapIds.size,
      blockedUsers: effectiveConfig.blockUserIds.size,
      blockedMaps: effectiveConfig.blockMapIds.size,
      matchesUserScope,
      matchesMapScope,
      blockedUser: !!blockedUser,
      blockedMap: !!blockedMap,
      hasScope: effectiveValidation.hasScope,
    },
  };
}

async function resolveCoeditingRolloutAsync({
  mapId,
  actorId,
  role,
  env = process.env,
  healthSnapshot = null,
} = {}) {
  const config = createCoeditingRolloutConfigFromEnv(env);
  const baseValidation = evaluateCoeditingRolloutConfig(config);
  const [effectiveHealth, agreement] = await Promise.all([
    healthSnapshot || getCoeditingHealthSnapshotAsync(env),
    getCoeditingRolloutAgreementAsync(env, {
      config,
      validation: baseValidation,
    }),
  ]);
  const validation = applyAgreementToValidation(config, baseValidation, agreement);
  return resolveCoeditingRollout({
    mapId,
    actorId,
    role,
    env,
    healthSnapshot: effectiveHealth,
    config,
    validation,
  });
}

function resolveCoeditingSystemStatus({
  env = process.env,
  healthSnapshot = null,
  config = null,
  validation = null,
} = {}) {
  const effectiveConfig = config || createCoeditingRolloutConfigFromEnv(env);
  const effectiveValidation = validation || applyAgreementToValidation(
    effectiveConfig,
    evaluateCoeditingRolloutConfig(effectiveConfig),
    createRolloutAgreementSummary(effectiveConfig)
  );
  const effectiveHealth = healthSnapshot || getCoeditingHealthSnapshot(env);
  const reasons = [];
  let status = 'disabled';
  let reason = 'experiment_disabled';

  if (!effectiveConfig.experimentEnabled) {
    reasons.push('experiment_disabled');
  } else if (!effectiveConfig.syncEngineEnabled) {
    reason = 'sync_engine_disabled';
    reasons.push(reason);
  } else if (!effectiveConfig.rolloutEnabled) {
    reason = 'rollout_disabled';
    reasons.push(reason);
  } else if (!effectiveValidation.configValid) {
    reason = 'config_invalid';
    reasons.push(reason);
  } else if (effectiveHealth.readOnlyFallbackActive) {
    status = 'read_only';
    reason = 'health_degraded';
    reasons.push(reason, ...effectiveHealth.reasons);
  } else {
    status = 'healthy';
    reason = 'healthy';
    reasons.push(reason);
  }

  return {
    status,
    reason,
    reasons: Array.from(new Set(reasons)),
  };
}

async function resolveCoeditingSystemStatusAsync({
  env = process.env,
  healthSnapshot = null,
} = {}) {
  const config = createCoeditingRolloutConfigFromEnv(env);
  const baseValidation = evaluateCoeditingRolloutConfig(config);
  const [effectiveHealth, agreement] = await Promise.all([
    healthSnapshot || getCoeditingHealthSnapshotAsync(env),
    getCoeditingRolloutAgreementAsync(env, {
      config,
      validation: baseValidation,
    }),
  ]);
  const validation = applyAgreementToValidation(config, baseValidation, agreement);
  return resolveCoeditingSystemStatus({
    env,
    healthSnapshot: effectiveHealth,
    config,
    validation,
  });
}

module.exports = {
  createCoeditingRolloutConfigFromEnv,
  evaluateCoeditingRolloutConfig,
  summarizeCoeditingRolloutConfig,
  summarizeCoeditingRolloutConfigAsync,
  getCoeditingRolloutAgreementAsync,
  resolveCoeditingRollout,
  resolveCoeditingRolloutAsync,
  resolveCoeditingSystemStatus,
  resolveCoeditingSystemStatusAsync,
};
