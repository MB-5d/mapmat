const permissionPolicy = require('../policies/permissionPolicy');
const { getCoeditingHealthSnapshot } = require('./coeditingObservability');

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

function createCoeditingRolloutConfigFromEnv(env = process.env) {
  return {
    experimentEnabled: parseEnvBool(env.COEDITING_EXPERIMENT_ENABLED, false),
    syncEngineEnabled: parseEnvBool(env.COEDITING_SYNC_ENGINE_ENABLED, false),
    rolloutEnabled: parseEnvBool(env.COEDITING_ROLLOUT_ENABLED, false),
    allowUserIds: parseCsvIdSet(env.COEDITING_ROLLOUT_USER_IDS),
    allowMapIds: parseCsvIdSet(env.COEDITING_ROLLOUT_MAP_IDS),
    blockUserIds: parseCsvIdSet(env.COEDITING_ROLLOUT_BLOCK_USER_IDS),
    blockMapIds: parseCsvIdSet(env.COEDITING_ROLLOUT_BLOCK_MAP_IDS),
  };
}

function summarizeCoeditingRolloutConfig(env = process.env) {
  const config = createCoeditingRolloutConfigFromEnv(env);
  return {
    experimentEnabled: config.experimentEnabled,
    syncEngineEnabled: config.syncEngineEnabled,
    rolloutEnabled: config.rolloutEnabled,
    scopedUsers: config.allowUserIds.size,
    scopedMaps: config.allowMapIds.size,
    blockedUsers: config.blockUserIds.size,
    blockedMaps: config.blockMapIds.size,
  };
}

function resolveCoeditingRollout({
  mapId,
  actorId,
  role,
  env = process.env,
  healthSnapshot = null,
} = {}) {
  const config = createCoeditingRolloutConfigFromEnv(env);
  const normalizedRole = permissionPolicy.normalizeRole(role);
  const normalizedMapId = normalizeId(mapId);
  const normalizedActorId = normalizeId(actorId);
  const effectiveHealth = healthSnapshot || getCoeditingHealthSnapshot(env);
  const reasons = [];

  const hasReadAccess = permissionPolicy.can(permissionPolicy.ACTIONS.MAP_READ, normalizedRole);
  const hasWriteAccess = permissionPolicy.can(permissionPolicy.ACTIONS.MAP_UPDATE, normalizedRole);

  const hasUserScope = config.allowUserIds.size > 0;
  const hasMapScope = config.allowMapIds.size > 0;
  const matchesUserScope = hasUserScope && normalizedActorId && config.allowUserIds.has(normalizedActorId);
  const matchesMapScope = hasMapScope && normalizedMapId && config.allowMapIds.has(normalizedMapId);
  const blockedUser = normalizedActorId && config.blockUserIds.has(normalizedActorId);
  const blockedMap = normalizedMapId && config.blockMapIds.has(normalizedMapId);
  const scopeAllowed = (!hasUserScope && !hasMapScope) || matchesUserScope || matchesMapScope;

  let mode = 'disabled';
  let reason = 'experiment_disabled';

  if (!config.experimentEnabled) {
    reason = 'experiment_disabled';
    reasons.push(reason);
  } else if (!config.syncEngineEnabled) {
    reason = 'sync_engine_disabled';
    reasons.push(reason);
  } else if (!config.rolloutEnabled) {
    reason = 'rollout_disabled';
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
      rolloutEnabled: config.rolloutEnabled,
      scopedUsers: config.allowUserIds.size,
      scopedMaps: config.allowMapIds.size,
      blockedUsers: config.blockUserIds.size,
      blockedMaps: config.blockMapIds.size,
      matchesUserScope,
      matchesMapScope,
      blockedUser: !!blockedUser,
      blockedMap: !!blockedMap,
    },
  };
}

function resolveCoeditingSystemStatus({
  env = process.env,
  healthSnapshot = null,
} = {}) {
  const config = createCoeditingRolloutConfigFromEnv(env);
  const effectiveHealth = healthSnapshot || getCoeditingHealthSnapshot(env);
  const reasons = [];
  let status = 'disabled';
  let reason = 'experiment_disabled';

  if (!config.experimentEnabled) {
    reasons.push('experiment_disabled');
  } else if (!config.rolloutEnabled) {
    reason = 'rollout_disabled';
    reasons.push(reason);
  } else if (!config.syncEngineEnabled) {
    reason = 'sync_engine_disabled';
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

module.exports = {
  createCoeditingRolloutConfigFromEnv,
  summarizeCoeditingRolloutConfig,
  resolveCoeditingRollout,
  resolveCoeditingSystemStatus,
};
