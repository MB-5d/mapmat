#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const db = require('../db');
const permissionPolicy = require('../policies/permissionPolicy');
const {
  getCoeditingHealthSnapshotAsync,
  recordCommitLatencyAsync,
  recordVersionConflictAsync,
  recordReconnectEventAsync,
  recordDroppedEventAsync,
  recordReadOnlyBlockAsync,
} = require('../utils/coeditingObservability');
const { resolveCoeditingRolloutAsync } = require('../utils/coeditingRollout');

async function main() {
  if (db.runtime?.activeProvider === 'postgres' && !process.env.DATABASE_URL) {
    console.log('[coediting-observability] Skipped distributed DB check without DATABASE_URL.');
    return;
  }

  const env = {
    COEDITING_EXPERIMENT_ENABLED: 'true',
    COEDITING_SYNC_ENGINE_ENABLED: 'true',
    COEDITING_ROLLOUT_ENABLED: 'true',
    COEDITING_ROLLOUT_USER_IDS: 'user-1',
    COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED: 'true',
    COEDITING_METRICS_WINDOW_SEC: '300',
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_RECONNECTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_DROPPED_PER_WINDOW: '0',
    COEDITING_FORCE_READ_ONLY: 'false',
  };

  const before = await getCoeditingHealthSnapshotAsync(env);
  assert.strictEqual(before.source, 'distributed');

  const now = Date.now();
  const droppedReason = `observability-check-${now}`;
  await recordCommitLatencyAsync(42, now, { env });
  await recordVersionConflictAsync(now + 1, { env });
  await recordReconnectEventAsync(now + 2, { env });
  await recordDroppedEventAsync(droppedReason, now + 3, { env });
  await recordReadOnlyBlockAsync(now + 4, { env });

  const after = await getCoeditingHealthSnapshotAsync(env);
  assert.strictEqual(after.source, 'distributed');
  assert.ok(after.metrics.commitLatencyMs.count >= before.metrics.commitLatencyMs.count + 1);
  assert.ok(after.metrics.committedOps.total >= before.metrics.committedOps.total + 1);
  assert.ok(after.metrics.conflicts.recent >= before.metrics.conflicts.recent + 1);
  assert.ok(after.metrics.reconnects.recent >= before.metrics.reconnects.recent + 1);
  assert.ok(after.metrics.dropped.recent >= before.metrics.dropped.recent + 1);
  assert.ok(after.metrics.readOnlyBlocks.recent >= before.metrics.readOnlyBlocks.recent + 1);
  assert.ok(after.metrics.dropped.reasons[droppedReason] >= 1);

  const degradedEnv = {
    ...env,
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: String(after.metrics.conflicts.recent),
  };
  const degradedHealth = await getCoeditingHealthSnapshotAsync(degradedEnv);
  assert.strictEqual(degradedHealth.readOnlyFallbackActive, true);
  assert.ok(degradedHealth.reasons.includes('conflict_limit'));

  const rollout = await resolveCoeditingRolloutAsync({
    mapId: 'map-1',
    actorId: 'user-1',
    role: permissionPolicy.ROLES.EDITOR,
    env: degradedEnv,
    healthSnapshot: degradedHealth,
  });
  assert.strictEqual(rollout.mode, 'read_only');
  assert.strictEqual(rollout.reason, 'health_degraded');

  console.log('[coediting-observability] Passed. Distributed health counters aggregate deterministically.');
}

main().catch((error) => {
  console.error('[coediting-observability] Failed:', error.message);
  process.exit(1);
});
