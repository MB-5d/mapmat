#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const {
  clampInt,
  runPersistedLoadScenarioAsync,
  shouldSkipPersistedHarness,
} = require('./lib/coeditingLoadHarness');

const CLIENT_COUNT = clampInt(process.env.COEDITING_LOAD_CLIENTS, 6, { min: 2, max: 24 });
const TOTAL_OPS = clampInt(process.env.COEDITING_LOAD_OPS, 180, { min: 20, max: 5000 });
const REPLAY_INTERVAL = clampInt(process.env.COEDITING_LOAD_REPLAY_INTERVAL, 15, { min: 1, max: 500 });
const CONFLICT_INTERVAL = clampInt(process.env.COEDITING_LOAD_CONFLICT_INTERVAL, 12, { min: 2, max: 500 });
const MAX_P95_MS = clampInt(process.env.COEDITING_LOAD_MAX_P95_MS, 0, { min: 0, max: 60000 });
const MAX_TOTAL_MS = clampInt(process.env.COEDITING_LOAD_MAX_TOTAL_MS, 0, { min: 0, max: 600000 });

async function main() {
  if (shouldSkipPersistedHarness()) {
    console.log('[coediting-load] Skipped persisted load check without DATABASE_URL.');
    return;
  }

  const result = await runPersistedLoadScenarioAsync({
    label: 'load',
    clientCount: CLIENT_COUNT,
    totalOps: TOTAL_OPS,
    replayInterval: REPLAY_INTERVAL,
    conflictInterval: CONFLICT_INTERVAL,
    maxP95Ms: MAX_P95_MS,
    maxTotalMs: MAX_TOTAL_MS,
  });

  assert.strictEqual(result.roundCommittedOps, TOTAL_OPS);
  console.log('[coediting-load] Passed.', {
    clients: CLIENT_COUNT,
    committedOps: result.roundCommittedOps,
    conflicts: result.conflicts,
    replayRequests: result.replayRequests,
    replayOperations: result.replayOperations,
    replayMaxBatch: result.replayMaxBatch,
    avgCommitMs: result.avgCommitMs,
    p95CommitMs: result.p95CommitMs,
    totalMs: result.totalMs,
    runtime: result.runtime,
  });
}

main().catch((error) => {
  console.error('[coediting-load] Failed:', error.message);
  process.exit(1);
});
