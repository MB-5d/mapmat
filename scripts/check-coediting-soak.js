#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const { performance } = require('perf_hooks');
const {
  clampInt,
  average,
  createClients,
  shouldSkipPersistedHarness,
  createPersistedLoadContextAsync,
  cleanupPersistedLoadContextAsync,
  runPersistedLoadRoundAsync,
} = require('./lib/coeditingLoadHarness');

const CLIENT_COUNT = clampInt(process.env.COEDITING_SOAK_CLIENTS, 6, { min: 2, max: 24 });
const ROUND_COUNT = clampInt(process.env.COEDITING_SOAK_ROUNDS, 5, { min: 2, max: 50 });
const OPS_PER_ROUND = clampInt(process.env.COEDITING_SOAK_OPS_PER_ROUND, 240, { min: 20, max: 5000 });
const REPLAY_INTERVAL = clampInt(process.env.COEDITING_SOAK_REPLAY_INTERVAL, 18, { min: 1, max: 500 });
const CONFLICT_INTERVAL = clampInt(process.env.COEDITING_SOAK_CONFLICT_INTERVAL, 14, { min: 2, max: 500 });
const MAX_ROUND_P95_MS = clampInt(process.env.COEDITING_SOAK_MAX_ROUND_P95_MS, 0, { min: 0, max: 60000 });
const MAX_TOTAL_MS = clampInt(process.env.COEDITING_SOAK_MAX_TOTAL_MS, 0, { min: 0, max: 600000 });
const MAX_P95_DRIFT_MS = clampInt(process.env.COEDITING_SOAK_MAX_P95_DRIFT_MS, 0, { min: 0, max: 60000 });

async function main() {
  if (shouldSkipPersistedHarness()) {
    console.log('[coediting-soak] Skipped persisted soak check without DATABASE_URL.');
    return;
  }

  const context = await createPersistedLoadContextAsync({ label: 'soak' });
  try {
    const clients = createClients(CLIENT_COUNT, {
      sessionPrefix: 'soak-session',
    });
    const roundResults = [];
    const startedAt = performance.now();

    for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
      const result = await runPersistedLoadRoundAsync({
        context,
        clients,
        totalOps: OPS_PER_ROUND,
        replayInterval: REPLAY_INTERVAL,
        conflictInterval: CONFLICT_INTERVAL,
        maxP95Ms: MAX_ROUND_P95_MS,
      });
      roundResults.push({
        round: roundIndex + 1,
        ...result,
      });
    }

    const totalMs = Math.round(performance.now() - startedAt);
    const totalCommittedOps = ROUND_COUNT * OPS_PER_ROUND;
    const roundP95s = roundResults.map((result) => result.p95CommitMs);
    const maxRoundP95Ms = Math.max(...roundP95s);
    const minRoundP95Ms = Math.min(...roundP95s);
    const p95DriftMs = maxRoundP95Ms - minRoundP95Ms;
    const avgRoundP95Ms = average(roundP95s);
    const finalResult = roundResults[roundResults.length - 1];

    assert.strictEqual(finalResult.totalCommittedOps, totalCommittedOps);
    assert.strictEqual(
      roundResults.every((result, index) => result.totalCommittedOps === (index + 1) * OPS_PER_ROUND),
      true
    );
    assert.strictEqual(roundResults.every((result) => result.replayRequests > 0), true);
    assert.strictEqual(maxRoundP95Ms >= minRoundP95Ms, true);

    if (MAX_TOTAL_MS > 0) {
      assert.ok(
        totalMs <= MAX_TOTAL_MS,
        `Expected soak runtime <= ${MAX_TOTAL_MS}ms, received ${totalMs}ms`
      );
    }
    if (MAX_P95_DRIFT_MS > 0) {
      assert.ok(
        p95DriftMs <= MAX_P95_DRIFT_MS,
        `Expected round p95 drift <= ${MAX_P95_DRIFT_MS}ms, received ${p95DriftMs}ms`
      );
    }

    console.log('[coediting-soak] Passed.', {
      rounds: ROUND_COUNT,
      clients: CLIENT_COUNT,
      opsPerRound: OPS_PER_ROUND,
      totalCommittedOps,
      finalVersion: finalResult.totalCommittedOps,
      maxRoundP95Ms,
      avgRoundP95Ms,
      p95DriftMs,
      totalMs,
      runtime: finalResult.runtime,
    });
  } finally {
    await cleanupPersistedLoadContextAsync(context);
  }
}

main().catch((error) => {
  console.error('[coediting-soak] Failed:', error.message);
  process.exit(1);
});
