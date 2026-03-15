#!/usr/bin/env node

/* eslint-disable no-console */

const {
  parseEnvBool,
  fetchCoeditingCanarySampleAsync,
  validatePublicHealthPayload,
  buildComparableCoeditingRolloutPolicySummary,
  diffCoeditingRolloutPolicySummaries,
} = require('./lib/coeditingHealthCheckUtils');
const {
  createCoeditingRolloutConfigFromEnv,
  evaluateCoeditingRolloutConfig,
} = require('../utils/coeditingRollout');

const TARGET_OVERRIDE_KEYS = [
  'COEDITING_EXPERIMENT_ENABLED',
  'COEDITING_SYNC_ENGINE_ENABLED',
  'COEDITING_ROLLOUT_ENABLED',
  'COEDITING_ROLLOUT_HARDENING_ENABLED',
  'COEDITING_ROLLOUT_ALLOW_GLOBAL',
  'COEDITING_ROLLOUT_GLOBAL_APPROVED',
  'COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT',
  'COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED',
  'COEDITING_ROLLOUT_USER_IDS',
  'COEDITING_ROLLOUT_MAP_IDS',
  'COEDITING_ROLLOUT_BLOCK_USER_IDS',
  'COEDITING_ROLLOUT_BLOCK_MAP_IDS',
  'ADMIN_API_KEY',
];

const ALLOWED_DIFF_FIELDS_BY_CHANGE_TYPE = {
  scope: new Set([
    'experimentEnabled',
    'syncEngineEnabled',
    'rolloutEnabled',
    'hardeningEnabled',
    'requireInstanceAgreement',
    'scopedUsers',
    'scopedMaps',
    'blockedUsers',
    'blockedMaps',
    'distributedObservabilityEnabled',
    'adminApiKeyConfigured',
  ]),
  broad: new Set([
    'experimentEnabled',
    'syncEngineEnabled',
    'rolloutEnabled',
    'hardeningEnabled',
    'allowGlobalRollout',
    'globalRolloutApproved',
    'requireInstanceAgreement',
    'scopedUsers',
    'scopedMaps',
    'blockedUsers',
    'blockedMaps',
    'distributedObservabilityEnabled',
    'adminApiKeyConfigured',
  ]),
};

function hasOwnEnv(env, key) {
  return Object.prototype.hasOwnProperty.call(env, key);
}

function createPlaceholderCsv(prefix, count) {
  const normalizedCount = Math.max(0, Number.parseInt(count, 10) || 0);
  return Array.from(
    { length: normalizedCount },
    (_, index) => `${prefix}-${index + 1}`
  ).join(',');
}

function normalizePreflightChangeType(value) {
  const normalized = String(value || 'scope').trim().toLowerCase();
  if (['scope', 'scoped', 'canary'].includes(normalized)) return 'scope';
  if (['broad', 'global'].includes(normalized)) return 'broad';
  throw new Error(`Unsupported COEDITING_PREFLIGHT_CHANGE_TYPE: ${value}`);
}

function createRolloutPreflightConfigFromEnv(env = process.env) {
  return {
    healthUrl: env.COEDITING_HEALTH_URL || '',
    adminUrl: env.COEDITING_ADMIN_URL || '',
    adminKey: env.COEDITING_ADMIN_KEY || '',
    changeType: normalizePreflightChangeType(env.COEDITING_PREFLIGHT_CHANGE_TYPE || 'scope'),
    requireCurrentHealthy: parseEnvBool(env.COEDITING_PREFLIGHT_REQUIRE_CURRENT_HEALTHY, true),
    requireAllowedDiffOnly: parseEnvBool(env.COEDITING_PREFLIGHT_REQUIRE_ALLOWED_DIFF_ONLY, true),
  };
}

function buildBaseTargetEnvFromCurrentSummary(currentSummary) {
  return {
    COEDITING_EXPERIMENT_ENABLED: String(currentSummary.experimentEnabled),
    COEDITING_SYNC_ENGINE_ENABLED: String(currentSummary.syncEngineEnabled),
    COEDITING_ROLLOUT_ENABLED: String(currentSummary.rolloutEnabled),
    COEDITING_ROLLOUT_HARDENING_ENABLED: String(currentSummary.hardeningEnabled),
    COEDITING_ROLLOUT_ALLOW_GLOBAL: String(currentSummary.allowGlobalRollout),
    COEDITING_ROLLOUT_GLOBAL_APPROVED: String(currentSummary.globalRolloutApproved),
    COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT: String(currentSummary.requireInstanceAgreement),
    COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED: String(
      currentSummary.distributedObservabilityEnabled
    ),
    COEDITING_ROLLOUT_USER_IDS: createPlaceholderCsv('current-user', currentSummary.scopedUsers),
    COEDITING_ROLLOUT_MAP_IDS: createPlaceholderCsv('current-map', currentSummary.scopedMaps),
    COEDITING_ROLLOUT_BLOCK_USER_IDS: createPlaceholderCsv(
      'current-blocked-user',
      currentSummary.blockedUsers
    ),
    COEDITING_ROLLOUT_BLOCK_MAP_IDS: createPlaceholderCsv(
      'current-blocked-map',
      currentSummary.blockedMaps
    ),
    ADMIN_API_KEY: currentSummary.adminApiKeyConfigured ? 'configured-admin-key' : '',
  };
}

function buildTargetRolloutPreflightEnv(currentSummary, env = process.env) {
  const targetEnv = buildBaseTargetEnvFromCurrentSummary(currentSummary);
  for (const key of TARGET_OVERRIDE_KEYS) {
    if (hasOwnEnv(env, key)) {
      targetEnv[key] = env[key];
    }
  }
  if (!hasOwnEnv(env, 'ADMIN_API_KEY') && String(env.COEDITING_ADMIN_KEY || '').trim()) {
    targetEnv.ADMIN_API_KEY = String(env.COEDITING_ADMIN_KEY || '');
  }
  return targetEnv;
}

function buildPlannedTargetRolloutSummary(targetEnv) {
  const config = createCoeditingRolloutConfigFromEnv(targetEnv);
  const validation = evaluateCoeditingRolloutConfig(config);

  return buildComparableCoeditingRolloutPolicySummary({
    label: 'target',
    rollout: {
      experimentEnabled: config.experimentEnabled,
      syncEngineEnabled: config.syncEngineEnabled,
      rolloutEnabled: config.rolloutEnabled,
      hardeningEnabled: config.hardeningEnabled,
      allowGlobalRollout: config.allowGlobalRollout,
      globalRolloutApproved: config.globalRolloutApproved,
      requireInstanceAgreement: config.requireInstanceAgreement,
      configValid: validation.configValid,
      configErrors: validation.configErrors,
      scopedUsers: config.allowUserIds.size,
      scopedMaps: config.allowMapIds.size,
      blockedUsers: config.blockUserIds.size,
      blockedMaps: config.blockMapIds.size,
      distributedObservabilityEnabled: config.distributedObservabilityEnabled,
      adminApiKeyConfigured: config.adminApiKeyConfigured,
    },
  });
}

function listExplicitTargetKeys(env = process.env) {
  return TARGET_OVERRIDE_KEYS.filter((key) => hasOwnEnv(env, key));
}

function validateExplicitTargetInputs(changeType, env = process.env) {
  const explicitKeys = listExplicitTargetKeys(env);
  const hasExplicitScopedTarget = [
    'COEDITING_ROLLOUT_USER_IDS',
    'COEDITING_ROLLOUT_MAP_IDS',
    'COEDITING_ROLLOUT_BLOCK_USER_IDS',
    'COEDITING_ROLLOUT_BLOCK_MAP_IDS',
  ].some((key) => hasOwnEnv(env, key));

  if (changeType === 'scope' && !hasExplicitScopedTarget) {
    throw new Error(
      'Scoped rollout preflight requires at least one explicit target scope or block-list variable.'
    );
  }

  if (changeType === 'broad') {
    const requiredKeys = [
      'COEDITING_ROLLOUT_ALLOW_GLOBAL',
      'COEDITING_ROLLOUT_GLOBAL_APPROVED',
      'COEDITING_ROLLOUT_USER_IDS',
      'COEDITING_ROLLOUT_MAP_IDS',
    ];
    const missingKeys = requiredKeys.filter((key) => !hasOwnEnv(env, key));
    if (missingKeys.length > 0) {
      throw new Error(
        `Broad rollout preflight requires explicit target values for: ${missingKeys.join(', ')}`
      );
    }
  }

  return explicitKeys;
}

function validateCurrentPreflightState(sample, { requireCurrentHealthy = true } = {}) {
  validatePublicHealthPayload(sample?.publicPayload, {
    expectedStatuses: ['disabled', 'healthy', 'read_only'],
  });

  if (!sample?.adminPayload || sample.adminPayload.ok !== true) {
    throw new Error('Coediting admin payload did not report ok=true');
  }
  if (!sample.adminPayload.rollout || !sample.adminPayload.health) {
    throw new Error('Coediting admin payload is missing rollout/health sections');
  }
  if (sample.adminPayload.rollout.configValid === false) {
    throw new Error(
      `Current rollout policy is already invalid${
        Array.isArray(sample.adminPayload.rollout.configErrors)
          && sample.adminPayload.rollout.configErrors.length > 0
          ? ` (${sample.adminPayload.rollout.configErrors.join(', ')})`
          : ''
      }`
    );
  }
  if (requireCurrentHealthy && sample.adminPayload.health.readOnlyFallbackActive) {
    throw new Error('Current coediting health is already in read-only fallback');
  }
}

function validateTargetRolloutSummary(targetSummary, changeType) {
  const scopedEntities = targetSummary.scopedUsers + targetSummary.scopedMaps;

  if (!targetSummary.configValid) {
    throw new Error(
      `Planned rollout policy is invalid${
        targetSummary.configErrors.length > 0
          ? ` (${targetSummary.configErrors.join(', ')})`
          : ''
      }`
    );
  }
  if (!targetSummary.experimentEnabled) {
    throw new Error('Planned rollout policy requires COEDITING_EXPERIMENT_ENABLED=true');
  }
  if (!targetSummary.syncEngineEnabled) {
    throw new Error('Planned rollout policy requires COEDITING_SYNC_ENGINE_ENABLED=true');
  }
  if (!targetSummary.rolloutEnabled) {
    throw new Error('Planned rollout policy requires COEDITING_ROLLOUT_ENABLED=true');
  }
  if (!targetSummary.hardeningEnabled) {
    throw new Error('Planned rollout policy requires COEDITING_ROLLOUT_HARDENING_ENABLED=true');
  }
  if (!targetSummary.requireInstanceAgreement) {
    throw new Error(
      'Planned rollout policy requires COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT=true'
    );
  }
  if (!targetSummary.distributedObservabilityEnabled) {
    throw new Error(
      'Planned rollout policy requires COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED=true'
    );
  }
  if (!targetSummary.adminApiKeyConfigured) {
    throw new Error('Planned rollout policy requires ADMIN_API_KEY to be configured');
  }

  if (changeType === 'scope') {
    if (targetSummary.allowGlobalRollout) {
      throw new Error('Scoped rollout preflight requires COEDITING_ROLLOUT_ALLOW_GLOBAL=false');
    }
    if (targetSummary.globalRolloutApproved) {
      throw new Error(
        'Scoped rollout preflight requires COEDITING_ROLLOUT_GLOBAL_APPROVED=false'
      );
    }
    if (scopedEntities < 1) {
      throw new Error('Scoped rollout preflight requires at least one scoped user or map');
    }
  }

  if (changeType === 'broad') {
    if (!targetSummary.allowGlobalRollout) {
      throw new Error('Broad rollout preflight requires COEDITING_ROLLOUT_ALLOW_GLOBAL=true');
    }
    if (!targetSummary.globalRolloutApproved) {
      throw new Error(
        'Broad rollout preflight requires COEDITING_ROLLOUT_GLOBAL_APPROVED=true'
      );
    }
    if (scopedEntities !== 0) {
      throw new Error('Broad rollout preflight requires scoped rollout lists to be cleared');
    }
  }
}

function validateRolloutPreflightPlan({
  currentSummary,
  targetSummary,
  changeType,
  requireAllowedDiffOnly = true,
} = {}) {
  validateTargetRolloutSummary(targetSummary, changeType);

  const differences = diffCoeditingRolloutPolicySummaries(currentSummary, targetSummary);
  const allowedFields = ALLOWED_DIFF_FIELDS_BY_CHANGE_TYPE[changeType];
  const unexpectedDifferences = differences.filter(
    (difference) => !allowedFields.has(difference.field)
  );

  if (requireAllowedDiffOnly && unexpectedDifferences.length > 0) {
    throw new Error(
      `Unexpected rollout policy delta(s) for ${changeType}: ${unexpectedDifferences
        .map((difference) => difference.field)
        .join(', ')}`
    );
  }

  return {
    differences,
    unexpectedDifferences,
  };
}

async function runCoeditingRolloutPreflightAsync(
  config = createRolloutPreflightConfigFromEnv(),
  env = process.env
) {
  const explicitTargetKeys = validateExplicitTargetInputs(config.changeType, env);
  const sample = await fetchCoeditingCanarySampleAsync({
    healthUrl: config.healthUrl,
    adminUrl: config.adminUrl,
    adminKey: config.adminKey,
  });

  validateCurrentPreflightState(sample, {
    requireCurrentHealthy: config.requireCurrentHealthy,
  });

  const currentSummary = buildComparableCoeditingRolloutPolicySummary({
    label: 'current',
    rollout: sample.adminPayload.rollout,
  });
  const targetEnv = buildTargetRolloutPreflightEnv(currentSummary, env);
  const targetSummary = buildPlannedTargetRolloutSummary(targetEnv);
  const validation = validateRolloutPreflightPlan({
    currentSummary,
    targetSummary,
    changeType: config.changeType,
    requireAllowedDiffOnly: config.requireAllowedDiffOnly,
  });

  return {
    config,
    currentSummary,
    targetSummary,
    explicitTargetKeys,
    differences: validation.differences,
    unexpectedDifferences: validation.unexpectedDifferences,
  };
}

async function main() {
  const result = await runCoeditingRolloutPreflightAsync();

  console.log('[coediting-rollout-preflight] Current.', result.currentSummary);
  console.log('[coediting-rollout-preflight] Target.', result.targetSummary);
  console.log('[coediting-rollout-preflight] Planned changes.', {
    changeType: result.config.changeType,
    explicitTargetKeys: result.explicitTargetKeys,
    deltaCount: result.differences.length,
  });

  if (result.differences.length > 0) {
    console.log('[coediting-rollout-preflight] Deltas.', result.differences);
  } else {
    console.log(
      '[coediting-rollout-preflight] No coarse rollout-policy deltas detected. Exact scope identity changes remain intentionally hidden from admin health output.'
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[coediting-rollout-preflight] Failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  createRolloutPreflightConfigFromEnv,
  buildTargetRolloutPreflightEnv,
  buildPlannedTargetRolloutSummary,
  validateRolloutPreflightPlan,
  runCoeditingRolloutPreflightAsync,
};
