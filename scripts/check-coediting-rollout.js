#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const db = require('../db');
const {
  resolveCoeditingRollout,
  resolveCoeditingRolloutAsync,
  resolveCoeditingSystemStatus,
  resolveCoeditingSystemStatusAsync,
  summarizeCoeditingRolloutConfigAsync,
} = require('../utils/coeditingRollout');
const { recordVersionConflict, recordReconnectEvent, recordDroppedEvent, getCoeditingHealthSnapshot } = require('../utils/coeditingObservability');
const permissionPolicy = require('../policies/permissionPolicy');
const {
  validateAdminCanaryPayload,
  buildComparableCoeditingRolloutPolicySummary,
  buildCoeditingRolloutStateSummary,
  diffCoeditingRolloutStateSummaries,
  runCoeditingCanaryWindowCheckAsync,
} = require('./lib/coeditingHealthCheckUtils');
const {
  buildTargetRolloutPreflightEnv,
  buildPlannedTargetRolloutSummary,
  validateRolloutPreflightPlan,
} = require('./check-coediting-rollout-preflight');

function buildCanaryPayload({
  status = 'healthy',
  readOnlyFallbackActive = false,
  source = 'distributed',
  hardeningEnabled = true,
  configValid = true,
  configErrors = [],
  allowGlobalRollout = false,
  globalRolloutApproved = false,
  requireInstanceAgreement = true,
  distributedObservabilityEnabled = true,
  adminApiKeyConfigured = true,
  instanceAgreementStatus = 'consistent',
  scopedUsers = 1,
  scopedMaps = 0,
  conflictsRecent = 0,
  reconnectsRecent = 0,
  droppedRecent = 0,
  readOnlyBlocksRecent = 0,
} = {}) {
  return {
    ok: true,
    status,
    reason: status === 'healthy' ? 'healthy' : 'health_degraded',
    rollout: {
      experimentEnabled: true,
      syncEngineEnabled: true,
      rolloutEnabled: true,
      hardeningEnabled,
      allowGlobalRollout,
      globalRolloutApproved,
      requireInstanceAgreement,
      configValid,
      configErrors,
      instanceAgreementStatus,
      scopedUsers,
      scopedMaps,
      blockedUsers: 0,
      blockedMaps: 0,
      distributedObservabilityEnabled,
      adminApiKeyConfigured,
    },
    health: {
      status,
      readOnlyFallbackActive,
      reasons: readOnlyFallbackActive ? ['health_degraded'] : [],
      source,
      metrics: {
        conflicts: { recent: conflictsRecent, total: conflictsRecent + 10 },
        reconnects: { recent: reconnectsRecent, total: reconnectsRecent + 5 },
        dropped: {
          recent: droppedRecent,
          total: droppedRecent + 5,
          reasons: droppedRecent > 0 ? { rate_limit: droppedRecent } : {},
        },
        readOnlyBlocks: {
          recent: readOnlyBlocksRecent,
          total: readOnlyBlocksRecent,
        },
      },
    },
  };
}

async function main() {
  const baseEnv = {
    COEDITING_EXPERIMENT_ENABLED: 'true',
    COEDITING_SYNC_ENGINE_ENABLED: 'true',
    COEDITING_ROLLOUT_ENABLED: 'true',
    COEDITING_ROLLOUT_USER_IDS: 'user-1',
    COEDITING_METRICS_WINDOW_SEC: '300',
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_RECONNECTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_DROPPED_PER_WINDOW: '0',
    COEDITING_FORCE_READ_ONLY: 'false',
  };

  const enabled = resolveCoeditingRollout({
    mapId: 'map-1',
    actorId: 'user-1',
    role: permissionPolicy.ROLES.EDITOR,
    env: baseEnv,
    healthSnapshot: getCoeditingHealthSnapshot(baseEnv),
  });
  assert.strictEqual(enabled.mode, 'enabled');
  assert.strictEqual(enabled.features.coeditingLive, true);

  const roleReadOnly = resolveCoeditingRollout({
    mapId: 'map-1',
    actorId: 'user-1',
    role: permissionPolicy.ROLES.VIEWER,
    env: baseEnv,
    healthSnapshot: getCoeditingHealthSnapshot(baseEnv),
  });
  assert.strictEqual(roleReadOnly.mode, 'read_only');
  assert.strictEqual(roleReadOnly.reason, 'role_read_only');

  const blocked = resolveCoeditingRollout({
    mapId: 'map-1',
    actorId: 'user-2',
    role: permissionPolicy.ROLES.EDITOR,
    env: baseEnv,
    healthSnapshot: getCoeditingHealthSnapshot(baseEnv),
  });
  assert.strictEqual(blocked.mode, 'disabled');
  assert.strictEqual(blocked.reason, 'scope_not_enabled');

  const hardenedInvalidEnv = {
    ...baseEnv,
    COEDITING_ROLLOUT_HARDENING_ENABLED: 'true',
  };
  const hardenedInvalid = resolveCoeditingRollout({
    mapId: 'map-1',
    actorId: 'user-1',
    role: permissionPolicy.ROLES.EDITOR,
    env: hardenedInvalidEnv,
    healthSnapshot: getCoeditingHealthSnapshot(hardenedInvalidEnv),
  });
  assert.strictEqual(hardenedInvalid.mode, 'disabled');
  assert.strictEqual(hardenedInvalid.reason, 'config_invalid');
  assert.strictEqual(hardenedInvalid.scope.configValid, false);

  const hardenedScopedEnv = {
    ...baseEnv,
    ADMIN_API_KEY: 'admin-key',
    COEDITING_ROLLOUT_HARDENING_ENABLED: 'true',
    COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED: 'true',
  };
  const hardenedScoped = resolveCoeditingRollout({
    mapId: 'map-1',
    actorId: 'user-1',
    role: permissionPolicy.ROLES.EDITOR,
    env: hardenedScopedEnv,
    healthSnapshot: getCoeditingHealthSnapshot(hardenedScopedEnv),
  });
  assert.strictEqual(hardenedScoped.mode, 'enabled');
  assert.strictEqual(hardenedScoped.scope.configValid, true);

  const hardenedGlobalEnv = {
    ...baseEnv,
    ADMIN_API_KEY: 'admin-key',
    COEDITING_ROLLOUT_HARDENING_ENABLED: 'true',
    COEDITING_ROLLOUT_ALLOW_GLOBAL: 'true',
    COEDITING_ROLLOUT_GLOBAL_APPROVED: 'true',
    COEDITING_ROLLOUT_USER_IDS: '',
    COEDITING_ROLLOUT_MAP_IDS: '',
    COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED: 'true',
  };
  const hardenedGlobal = resolveCoeditingRollout({
    mapId: 'map-2',
    actorId: 'user-2',
    role: permissionPolicy.ROLES.EDITOR,
    env: hardenedGlobalEnv,
    healthSnapshot: getCoeditingHealthSnapshot(hardenedGlobalEnv),
  });
  assert.strictEqual(hardenedGlobal.mode, 'enabled');
  assert.strictEqual(hardenedGlobal.scope.allowGlobalRollout, true);
  assert.strictEqual(hardenedGlobal.scope.globalRolloutApproved, true);

  const hardenedConflictEnv = {
    ...baseEnv,
    ADMIN_API_KEY: 'admin-key',
    COEDITING_ROLLOUT_HARDENING_ENABLED: 'true',
    COEDITING_ROLLOUT_ALLOW_GLOBAL: 'true',
    COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED: 'true',
  };
  const hardenedConflict = resolveCoeditingRollout({
    mapId: 'map-1',
    actorId: 'user-1',
    role: permissionPolicy.ROLES.EDITOR,
    env: hardenedConflictEnv,
    healthSnapshot: getCoeditingHealthSnapshot(hardenedConflictEnv),
  });
  assert.strictEqual(hardenedConflict.mode, 'disabled');
  assert.strictEqual(hardenedConflict.reason, 'config_invalid');
  assert.ok(hardenedConflict.scope.configValid === false);

  const hardenedGlobalApprovalMissingEnv = {
    ...baseEnv,
    ADMIN_API_KEY: 'admin-key',
    COEDITING_ROLLOUT_HARDENING_ENABLED: 'true',
    COEDITING_ROLLOUT_ALLOW_GLOBAL: 'true',
    COEDITING_ROLLOUT_USER_IDS: '',
    COEDITING_ROLLOUT_MAP_IDS: '',
    COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED: 'true',
  };
  const hardenedGlobalApprovalMissing = resolveCoeditingRollout({
    mapId: 'map-2',
    actorId: 'user-2',
    role: permissionPolicy.ROLES.EDITOR,
    env: hardenedGlobalApprovalMissingEnv,
    healthSnapshot: getCoeditingHealthSnapshot(hardenedGlobalApprovalMissingEnv),
  });
  assert.strictEqual(hardenedGlobalApprovalMissing.mode, 'disabled');
  assert.strictEqual(hardenedGlobalApprovalMissing.reason, 'config_invalid');

  const degradedEnv = {
    ...baseEnv,
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '1',
  };
  recordVersionConflict();
  const degraded = resolveCoeditingRollout({
    mapId: 'map-1',
    actorId: 'user-1',
    role: permissionPolicy.ROLES.EDITOR,
    env: degradedEnv,
    healthSnapshot: getCoeditingHealthSnapshot(degradedEnv),
  });
  assert.strictEqual(degraded.mode, 'read_only');
  assert.ok(degraded.health.readOnlyFallbackActive);

  recordReconnectEvent();
  recordDroppedEvent('rate_limit');
  const snapshot = getCoeditingHealthSnapshot({
    ...baseEnv,
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_RECONNECTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_DROPPED_PER_WINDOW: '0',
  });
  assert.ok(snapshot.metrics.reconnects.total >= 1);
  assert.ok(snapshot.metrics.dropped.total >= 1);

  const forcedReadOnlyStatus = resolveCoeditingSystemStatus({
    env: {
      ...baseEnv,
      COEDITING_FORCE_READ_ONLY: 'true',
    },
    healthSnapshot: getCoeditingHealthSnapshot({
      ...baseEnv,
      COEDITING_FORCE_READ_ONLY: 'true',
    }),
  });
  assert.strictEqual(forcedReadOnlyStatus.status, 'read_only');

  const hardenedStatus = resolveCoeditingSystemStatus({
    env: hardenedInvalidEnv,
    healthSnapshot: getCoeditingHealthSnapshot(hardenedInvalidEnv),
  });
  assert.strictEqual(hardenedStatus.status, 'disabled');
  assert.strictEqual(hardenedStatus.reason, 'config_invalid');

  const canCheckDistributedAgreement = !(
    db.runtime?.activeProvider === 'postgres' && !process.env.DATABASE_URL
  );
  if (canCheckDistributedAgreement) {
    const agreementEnvBase = {
      ...baseEnv,
      ADMIN_API_KEY: 'admin-key',
      COEDITING_ROLLOUT_HARDENING_ENABLED: 'true',
      COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED: 'true',
      COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT: 'true',
      COEDITING_ROLLOUT_OBSERVATION_GROUP: 'check-rollout-agreement',
    };
    const agreementEnvA = {
      ...agreementEnvBase,
      COEDITING_INSTANCE_ID: 'instance-a',
    };
    const agreementEnvB = {
      ...agreementEnvBase,
      COEDITING_INSTANCE_ID: 'instance-b',
    };

    await summarizeCoeditingRolloutConfigAsync(agreementEnvA, {
      includeConfigErrors: true,
      includeSensitive: true,
    });
    await summarizeCoeditingRolloutConfigAsync(agreementEnvB, {
      includeConfigErrors: true,
      includeSensitive: true,
    });

    const agreementSummary = await summarizeCoeditingRolloutConfigAsync(agreementEnvA, {
      includeConfigErrors: true,
      includeSensitive: true,
    });
    assert.strictEqual(agreementSummary.instanceAgreementStatus, 'consistent');
    assert.strictEqual(agreementSummary.configValid, true);
    assert.ok(agreementSummary.observedInstanceCount >= 2);

    const agreementEnabled = await resolveCoeditingRolloutAsync({
      mapId: 'map-1',
      actorId: 'user-1',
      role: permissionPolicy.ROLES.EDITOR,
      env: agreementEnvA,
      healthSnapshot: getCoeditingHealthSnapshot(agreementEnvA),
    });
    assert.strictEqual(agreementEnabled.mode, 'enabled');
    assert.strictEqual(agreementEnabled.scope.instanceAgreementStatus, 'consistent');

    const driftEnvB = {
      ...agreementEnvB,
      COEDITING_ROLLOUT_USER_IDS: 'user-2',
    };
    await summarizeCoeditingRolloutConfigAsync(driftEnvB, {
      includeConfigErrors: true,
      includeSensitive: true,
    });

    const driftSummary = await summarizeCoeditingRolloutConfigAsync(agreementEnvA, {
      includeConfigErrors: true,
      includeSensitive: true,
    });
    assert.strictEqual(driftSummary.instanceAgreementStatus, 'drift_detected');
    assert.strictEqual(driftSummary.configValid, false);
    assert.ok(driftSummary.configErrors.includes('instance_agreement_required'));

    const driftedRollout = await resolveCoeditingRolloutAsync({
      mapId: 'map-1',
      actorId: 'user-1',
      role: permissionPolicy.ROLES.EDITOR,
      env: agreementEnvA,
      healthSnapshot: getCoeditingHealthSnapshot(agreementEnvA),
    });
    assert.strictEqual(driftedRollout.mode, 'disabled');
    assert.strictEqual(driftedRollout.reason, 'config_invalid');

    const driftedStatus = await resolveCoeditingSystemStatusAsync({
      env: agreementEnvA,
      healthSnapshot: getCoeditingHealthSnapshot(agreementEnvA),
    });
    assert.strictEqual(driftedStatus.status, 'disabled');
    assert.strictEqual(driftedStatus.reason, 'config_invalid');
  } else {
    console.log('[coediting-rollout] Skipped distributed agreement assertions without DATABASE_URL.');
  }

  const canarySummary = validateAdminCanaryPayload({
    ok: true,
    status: 'healthy',
    rollout: {
      experimentEnabled: true,
      syncEngineEnabled: true,
      rolloutEnabled: true,
      configValid: true,
      instanceAgreementStatus: 'consistent',
      scopedUsers: 1,
      scopedMaps: 0,
      blockedUsers: 0,
      blockedMaps: 0,
    },
    health: {
      source: 'distributed',
      readOnlyFallbackActive: false,
      metrics: {
        conflicts: { recent: 2, total: 10 },
        reconnects: { recent: 1, total: 3 },
        dropped: { recent: 1, total: 4, reasons: { heartbeat_timeout: 1 } },
        readOnlyBlocks: { recent: 0, total: 0 },
      },
    },
  });
  assert.strictEqual(canarySummary.status, 'healthy');
  assert.strictEqual(canarySummary.scopedEntities, 1);

  assert.throws(() => validateAdminCanaryPayload({
    ok: true,
    status: 'read_only',
    rollout: {
      experimentEnabled: true,
      syncEngineEnabled: true,
      rolloutEnabled: true,
      configValid: true,
      instanceAgreementStatus: 'consistent',
      scopedUsers: 1,
      scopedMaps: 0,
    },
    health: {
      source: 'distributed',
      readOnlyFallbackActive: true,
      metrics: {
        conflicts: { recent: 0, total: 0 },
        reconnects: { recent: 0, total: 0 },
        dropped: { recent: 0, total: 0, reasons: {} },
        readOnlyBlocks: { recent: 1, total: 1 },
      },
    },
  }), /Unexpected coediting status|read-only fallback active/);

  assert.throws(() => validateAdminCanaryPayload({
    ok: true,
    status: 'healthy',
    rollout: {
      experimentEnabled: true,
      syncEngineEnabled: true,
      rolloutEnabled: true,
      configValid: false,
      configErrors: ['scope_required'],
      instanceAgreementStatus: 'consistent',
      scopedUsers: 0,
      scopedMaps: 0,
    },
    health: {
      source: 'local_fallback',
      readOnlyFallbackActive: false,
      metrics: {
        conflicts: { recent: 25, total: 25 },
        reconnects: { recent: 0, total: 0 },
        dropped: { recent: 0, total: 0, reasons: {} },
        readOnlyBlocks: { recent: 0, total: 0 },
      },
    },
  }), /configValid=true|distributed health source|scoped rollout entities|Recent conflict count/);

  assert.throws(() => validateAdminCanaryPayload(buildCanaryPayload({
    instanceAgreementStatus: 'drift_detected',
  })), /instanceAgreementStatus=consistent/);

  assert.throws(() => validateAdminCanaryPayload(buildCanaryPayload({
    allowGlobalRollout: true,
  })), /allowGlobalRollout=false/);

  assert.throws(() => validateAdminCanaryPayload(buildCanaryPayload({
    globalRolloutApproved: true,
  })), /globalRolloutApproved=false/);

  const broadSummary = validateAdminCanaryPayload(buildCanaryPayload({
    allowGlobalRollout: true,
    globalRolloutApproved: true,
    scopedUsers: 0,
    scopedMaps: 0,
  }), {
    requireAllowGlobalRolloutFalse: false,
    requireGlobalRolloutApprovedFalse: false,
    expectedAllowGlobalRollout: true,
    expectedGlobalRolloutApproved: true,
    minScopedEntities: 0,
    maxScopedEntities: 0,
  });
  assert.strictEqual(broadSummary.allowGlobalRollout, true);
  assert.strictEqual(broadSummary.globalRolloutApproved, true);
  assert.strictEqual(broadSummary.scopedEntities, 0);

  assert.throws(() => validateAdminCanaryPayload(buildCanaryPayload({
    allowGlobalRollout: true,
    globalRolloutApproved: true,
    scopedUsers: 1,
  }), {
    requireAllowGlobalRolloutFalse: false,
    requireGlobalRolloutApprovedFalse: false,
    expectedAllowGlobalRollout: true,
    expectedGlobalRolloutApproved: true,
    minScopedEntities: 0,
    maxScopedEntities: 0,
  }), /at most 0 scoped rollout entities/);

  const stagingState = buildCoeditingRolloutStateSummary({
    label: 'staging',
    publicPayload: buildCanaryPayload({
      allowGlobalRollout: false,
      globalRolloutApproved: false,
      scopedUsers: 1,
      scopedMaps: 1,
    }),
    adminPayload: buildCanaryPayload({
      allowGlobalRollout: false,
      globalRolloutApproved: false,
      scopedUsers: 1,
      scopedMaps: 1,
    }),
  });
  const productionState = buildCoeditingRolloutStateSummary({
    label: 'production',
    publicPayload: buildCanaryPayload({
      allowGlobalRollout: true,
      globalRolloutApproved: true,
      scopedUsers: 0,
      scopedMaps: 0,
    }),
    adminPayload: buildCanaryPayload({
      allowGlobalRollout: true,
      globalRolloutApproved: true,
      scopedUsers: 0,
      scopedMaps: 0,
    }),
  });
  const policyDiff = diffCoeditingRolloutStateSummaries(stagingState, productionState);
  assert.ok(policyDiff.some((entry) => entry.field === 'allowGlobalRollout'));
  assert.ok(policyDiff.some((entry) => entry.field === 'globalRolloutApproved'));
  assert.ok(policyDiff.some((entry) => entry.field === 'scopedUsers'));

  const currentPolicySummary = buildComparableCoeditingRolloutPolicySummary({
    label: 'current',
    rollout: stagingState,
  });
  const scopeTargetEnv = buildTargetRolloutPreflightEnv(currentPolicySummary, {
    COEDITING_ROLLOUT_USER_IDS: 'user-1,user-2,user-3',
    COEDITING_ROLLOUT_MAP_IDS: 'map-1',
    COEDITING_ROLLOUT_BLOCK_USER_IDS: 'blocked-user-1',
  });
  const scopeTargetSummary = buildPlannedTargetRolloutSummary(scopeTargetEnv);
  const scopePreflight = validateRolloutPreflightPlan({
    currentSummary: currentPolicySummary,
    targetSummary: scopeTargetSummary,
    changeType: 'scope',
  });
  assert.ok(scopePreflight.differences.some((entry) => entry.field === 'scopedUsers'));
  assert.ok(scopePreflight.differences.some((entry) => entry.field === 'blockedUsers'));
  assert.strictEqual(scopePreflight.unexpectedDifferences.length, 0);

  const broadTargetEnv = buildTargetRolloutPreflightEnv(currentPolicySummary, {
    COEDITING_ROLLOUT_ALLOW_GLOBAL: 'true',
    COEDITING_ROLLOUT_GLOBAL_APPROVED: 'true',
    COEDITING_ROLLOUT_USER_IDS: '',
    COEDITING_ROLLOUT_MAP_IDS: '',
  });
  const broadTargetSummary = buildPlannedTargetRolloutSummary(broadTargetEnv);
  const broadPreflight = validateRolloutPreflightPlan({
    currentSummary: currentPolicySummary,
    targetSummary: broadTargetSummary,
    changeType: 'broad',
  });
  assert.ok(broadPreflight.differences.some((entry) => entry.field === 'allowGlobalRollout'));
  assert.ok(broadPreflight.differences.some((entry) => entry.field === 'globalRolloutApproved'));
  assert.ok(broadPreflight.differences.some((entry) => entry.field === 'scopedUsers'));
  assert.strictEqual(broadPreflight.unexpectedDifferences.length, 0);

  const invalidScopeTargetEnv = buildTargetRolloutPreflightEnv(currentPolicySummary, {
    COEDITING_ROLLOUT_ALLOW_GLOBAL: 'true',
    COEDITING_ROLLOUT_USER_IDS: 'user-1',
  });
  const invalidScopeTargetSummary = buildPlannedTargetRolloutSummary(invalidScopeTargetEnv);
  assert.throws(() => validateRolloutPreflightPlan({
    currentSummary: currentPolicySummary,
    targetSummary: invalidScopeTargetSummary,
    changeType: 'scope',
  }), /Scoped rollout preflight requires COEDITING_ROLLOUT_ALLOW_GLOBAL=false|Planned rollout policy is invalid/);

  const healthySamples = [
    {
      publicPayload: buildCanaryPayload({ conflictsRecent: 1, reconnectsRecent: 0, droppedRecent: 1 }),
      adminPayload: buildCanaryPayload({ conflictsRecent: 1, reconnectsRecent: 0, droppedRecent: 1 }),
    },
    {
      publicPayload: buildCanaryPayload({ conflictsRecent: 2, reconnectsRecent: 1, droppedRecent: 1 }),
      adminPayload: buildCanaryPayload({ conflictsRecent: 2, reconnectsRecent: 1, droppedRecent: 1 }),
    },
    {
      publicPayload: buildCanaryPayload({ conflictsRecent: 3, reconnectsRecent: 1, droppedRecent: 2 }),
      adminPayload: buildCanaryPayload({ conflictsRecent: 3, reconnectsRecent: 1, droppedRecent: 2 }),
    },
  ];
  let sampleIndex = 0;
  const windowResult = await runCoeditingCanaryWindowCheckAsync({
    fetchSampleAsync: async () => healthySamples[sampleIndex++],
    gateConfig: {
      expectedPublicStatuses: ['healthy'],
      expectedAdminStatuses: ['healthy'],
      requireReadOnlyFallbackInactive: true,
      requireExperimentEnabled: true,
      requireSyncEngineEnabled: true,
      requireRolloutEnabled: true,
      requireDistributedSource: true,
      requireConfigValid: true,
      maxRecentConflicts: 20,
      maxRecentReconnects: 5,
      maxRecentDropped: 5,
      maxRecentReadOnlyBlocks: 0,
      minScopedEntities: 1,
    },
    windowMs: 0,
    pollIntervalMs: 0,
    minSamples: 3,
    requireStableScopeCount: true,
  });
  assert.strictEqual(windowResult.sampleCount, 3);
  assert.strictEqual(windowResult.baseline.scopedEntities, 1);
  assert.strictEqual(windowResult.maxConflictsRecent, 3);
  assert.strictEqual(windowResult.maxDroppedRecent, 2);

  const driftSamples = [
    {
      publicPayload: buildCanaryPayload({ scopedUsers: 1 }),
      adminPayload: buildCanaryPayload({ scopedUsers: 1 }),
    },
    {
      publicPayload: buildCanaryPayload({ scopedUsers: 2 }),
      adminPayload: buildCanaryPayload({ scopedUsers: 2 }),
    },
  ];
  let driftIndex = 0;
  await assert.rejects(async () => runCoeditingCanaryWindowCheckAsync({
    fetchSampleAsync: async () => driftSamples[driftIndex++],
    gateConfig: {
      expectedPublicStatuses: ['healthy'],
      expectedAdminStatuses: ['healthy'],
      requireReadOnlyFallbackInactive: true,
      requireExperimentEnabled: true,
      requireSyncEngineEnabled: true,
      requireRolloutEnabled: true,
      requireDistributedSource: true,
      requireConfigValid: true,
      maxRecentConflicts: 20,
      maxRecentReconnects: 5,
      maxRecentDropped: 5,
      maxRecentReadOnlyBlocks: 0,
      minScopedEntities: 1,
    },
    windowMs: 0,
    pollIntervalMs: 0,
    minSamples: 2,
    requireStableScopeCount: true,
  }), /scoped rollout entity count drifted/);

  const invalidConfigSamples = [
    {
      publicPayload: buildCanaryPayload({ configValid: true }),
      adminPayload: buildCanaryPayload({ configValid: true }),
    },
    {
      publicPayload: buildCanaryPayload({ configValid: false, configErrors: ['scope_required'] }),
      adminPayload: buildCanaryPayload({ configValid: false, configErrors: ['scope_required'] }),
    },
  ];
  let invalidConfigIndex = 0;
  await assert.rejects(async () => runCoeditingCanaryWindowCheckAsync({
    fetchSampleAsync: async () => invalidConfigSamples[invalidConfigIndex++],
    gateConfig: {
      expectedPublicStatuses: ['healthy'],
      expectedAdminStatuses: ['healthy'],
      requireReadOnlyFallbackInactive: true,
      requireExperimentEnabled: true,
      requireSyncEngineEnabled: true,
      requireRolloutEnabled: true,
      requireDistributedSource: true,
      requireConfigValid: true,
      maxRecentConflicts: 20,
      maxRecentReconnects: 5,
      maxRecentDropped: 5,
      maxRecentReadOnlyBlocks: 0,
      minScopedEntities: 1,
    },
    windowMs: 0,
    pollIntervalMs: 0,
    minSamples: 2,
    requireStableScopeCount: true,
  }), /configValid=true/);

  console.log('[coediting-rollout] Passed. Rollout scope + degraded read-only resolution is consistent.');
}

main().catch((error) => {
  console.error('[coediting-rollout] Failed:', error.message);
  process.exit(1);
});
