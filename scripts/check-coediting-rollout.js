#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const { resolveCoeditingRollout, resolveCoeditingSystemStatus } = require('../utils/coeditingRollout');
const { recordVersionConflict, recordReconnectEvent, recordDroppedEvent, getCoeditingHealthSnapshot } = require('../utils/coeditingObservability');
const permissionPolicy = require('../policies/permissionPolicy');

function main() {
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

  console.log('[coediting-rollout] Passed. Rollout scope + degraded read-only resolution is consistent.');
}

main();
