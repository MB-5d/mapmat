#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const {
  replayOperations,
  getLiveDocumentAsync,
  listCommittedOperationsAsync,
} = require('../utils/coeditingSyncEngine');
const {
  clampInt,
  createClients,
  shouldSkipPersistedHarness,
  createPersistedLoadContextAsync,
  cleanupPersistedLoadContextAsync,
  runPersistedLoadRoundAsync,
} = require('./lib/coeditingLoadHarness');

const CLIENT_COUNT = clampInt(process.env.COEDITING_RECOVERY_CLIENTS, 5, { min: 3, max: 24 });
const ROUND1_OPS = clampInt(process.env.COEDITING_RECOVERY_ROUND1_OPS, 18, { min: 5, max: 5000 });
const ROUND2_OPS = clampInt(process.env.COEDITING_RECOVERY_ROUND2_OPS, 42, { min: 5, max: 5000 });
const REPLAY_INTERVAL = clampInt(process.env.COEDITING_RECOVERY_REPLAY_INTERVAL, 12, { min: 1, max: 500 });
const CONFLICT_INTERVAL = clampInt(process.env.COEDITING_RECOVERY_CONFLICT_INTERVAL, 10, { min: 2, max: 500 });
const FALLBACK_LIMIT = clampInt(process.env.COEDITING_RECOVERY_FALLBACK_LIMIT, 15, { min: 1, max: 500 });

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertRecoveredDocument(actual, expected) {
  assert.strictEqual(actual.name, expected.name);
  assert.strictEqual(actual.notes, expected.notes);
  assert.deepStrictEqual(actual.root, expected.root);
  assert.deepStrictEqual(actual.orphans, expected.orphans);
  assert.deepStrictEqual(actual.connections, expected.connections);
  assert.deepStrictEqual(actual.colors, expected.colors);
  assert.deepStrictEqual(actual.connectionColors, expected.connectionColors);
}

async function main() {
  if (shouldSkipPersistedHarness()) {
    console.log('[coediting-recovery] Skipped persisted recovery check without DATABASE_URL.');
    return;
  }

  assert.ok(
    FALLBACK_LIMIT < ROUND2_OPS,
    'COEDITING_RECOVERY_FALLBACK_LIMIT must be lower than COEDITING_RECOVERY_ROUND2_OPS'
  );

  const context = await createPersistedLoadContextAsync({ label: 'recovery' });
  try {
    const clients = createClients(CLIENT_COUNT, {
      sessionPrefix: 'recovery-session',
    });
    const disconnectedClient = clients[clients.length - 1];
    const activeClients = clients.slice(0, -1);

    const round1 = await runPersistedLoadRoundAsync({
      context,
      clients,
      totalOps: ROUND1_OPS,
      replayInterval: REPLAY_INTERVAL,
      conflictInterval: CONFLICT_INTERVAL,
    });
    const disconnectedSnapshot = await getLiveDocumentAsync({ mapId: context.mapId });
    const disconnectedVersion = disconnectedClient.knownVersion;

    assert.strictEqual(round1.totalCommittedOps, ROUND1_OPS);
    assert.strictEqual(disconnectedVersion, ROUND1_OPS);

    const round2 = await runPersistedLoadRoundAsync({
      context,
      clients: activeClients,
      totalOps: ROUND2_OPS,
      replayInterval: REPLAY_INTERVAL,
      conflictInterval: CONFLICT_INTERVAL,
    });
    const finalLiveDocument = await getLiveDocumentAsync({ mapId: context.mapId });
    const missedOps = finalLiveDocument.version - disconnectedVersion;

    assert.strictEqual(round2.totalCommittedOps, ROUND1_OPS + ROUND2_OPS);
    assert.strictEqual(disconnectedClient.knownVersion, disconnectedVersion);
    assert.strictEqual(missedOps, ROUND2_OPS);

    const replay = await listCommittedOperationsAsync({
      mapId: context.mapId,
      afterVersion: disconnectedVersion,
      limit: missedOps + 5,
    });
    assert.strictEqual(replay.currentVersion, finalLiveDocument.version);
    assert.strictEqual(replay.operations.length, missedOps);
    assert.strictEqual(replay.operations[0].version, disconnectedVersion + 1);
    assert.strictEqual(replay.operations[replay.operations.length - 1].version, finalLiveDocument.version);

    const replayRecoveredDocument = replayOperations(cloneJson(disconnectedSnapshot), replay.operations);
    assertRecoveredDocument(replayRecoveredDocument, finalLiveDocument);

    const limitedReplay = await listCommittedOperationsAsync({
      mapId: context.mapId,
      afterVersion: disconnectedVersion,
      limit: FALLBACK_LIMIT,
    });
    const fallbackRequired =
      limitedReplay.operations.length === FALLBACK_LIMIT
      && limitedReplay.currentVersion > disconnectedVersion + limitedReplay.operations.length;

    assert.strictEqual(limitedReplay.currentVersion, finalLiveDocument.version);
    assert.strictEqual(limitedReplay.operations.length, FALLBACK_LIMIT);
    assert.strictEqual(fallbackRequired, true);

    const partialRecoveredDocument = replayOperations(
      cloneJson(disconnectedSnapshot),
      limitedReplay.operations
    );
    const partialRootChildren = Array.isArray(partialRecoveredDocument.root?.children)
      ? partialRecoveredDocument.root.children.length
      : 0;
    const finalRootChildren = Array.isArray(finalLiveDocument.root?.children)
      ? finalLiveDocument.root.children.length
      : 0;
    assert.strictEqual(partialRootChildren, disconnectedVersion + FALLBACK_LIMIT);
    assert.ok(partialRootChildren < finalRootChildren);

    const fallbackDocument = await getLiveDocumentAsync({ mapId: context.mapId });
    assert.strictEqual(fallbackDocument.version, finalLiveDocument.version);
    assertRecoveredDocument(fallbackDocument, finalLiveDocument);

    const syncEngineModulePath = require.resolve('../utils/coeditingSyncEngine');
    delete require.cache[syncEngineModulePath];
    const reloadedSyncEngine = require(syncEngineModulePath);
    const reloadedLiveDocument = await reloadedSyncEngine.getLiveDocumentAsync({ mapId: context.mapId });
    const reloadedReplay = await reloadedSyncEngine.listCommittedOperationsAsync({
      mapId: context.mapId,
      afterVersion: disconnectedVersion,
      limit: missedOps + 5,
    });

    assert.strictEqual(reloadedLiveDocument.version, finalLiveDocument.version);
    assert.strictEqual(reloadedReplay.currentVersion, finalLiveDocument.version);
    assert.strictEqual(reloadedReplay.operations.length, replay.operations.length);
    assert.strictEqual(reloadedReplay.operations[0].opId, replay.operations[0].opId);
    assert.strictEqual(
      reloadedReplay.operations[reloadedReplay.operations.length - 1].opId,
      replay.operations[replay.operations.length - 1].opId
    );

    const reloadedRecoveredDocument = reloadedSyncEngine.replayOperations(
      cloneJson(disconnectedSnapshot),
      reloadedReplay.operations
    );
    assertRecoveredDocument(reloadedRecoveredDocument, finalLiveDocument);

    console.log('[coediting-recovery] Passed.', {
      clients: CLIENT_COUNT,
      disconnectedVersion,
      missedOps,
      fallbackLimit: FALLBACK_LIMIT,
      fullReplayOps: replay.operations.length,
      partialReplayOps: limitedReplay.operations.length,
      fallbackRequired,
      finalVersion: finalLiveDocument.version,
      rootChildren: finalRootChildren,
      runtime: round2.runtime,
    });
  } finally {
    await cleanupPersistedLoadContextAsync(context);
  }
}

main().catch((error) => {
  console.error('[coediting-recovery] Failed:', error.message);
  process.exit(1);
});
