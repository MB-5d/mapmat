#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const adapter = require('../stores/dbAdapter');
const {
  applyOperationToDocument,
  replayOperations,
  applyOperationAsync,
  getLiveDocumentAsync,
  listCommittedOperationsAsync,
  CoeditingSyncError,
} = require('../utils/coeditingSyncEngine');
const { normalizeOperationEnvelope } = require('../utils/coeditingContract');
const {
  createPersistedLoadContextAsync,
  cleanupPersistedLoadContextAsync,
} = require('./lib/coeditingLoadHarness');

function expectSyncError(fn, expectedCode) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof CoeditingSyncError, 'Expected CoeditingSyncError');
  assert.strictEqual(thrown.code, expectedCode);
}

async function assertSavedMapDriftRefreshesLiveSnapshot() {
  const context = await createPersistedLoadContextAsync({ label: 'stale-snapshot' });
  try {
    const baseDocument = await getLiveDocumentAsync({ mapId: context.mapId });
    assert.strictEqual(baseDocument.version, 0);

    const operation = normalizeOperationEnvelope({
      opId: 'stale-snapshot-op-1',
      mapId: context.mapId,
      sessionId: 'stale-snapshot-session',
      actorId: context.userId,
      baseVersion: baseDocument.version,
      timestamp: new Date().toISOString(),
      type: 'metadata.update',
      payload: {
        changes: {
          name: 'Live Edited Name',
        },
      },
    }, {
      expectedMapId: context.mapId,
      expectedActorId: context.userId,
    });

    const committed = await applyOperationAsync({
      mapId: context.mapId,
      operation,
    });
    assert.strictEqual(committed.liveDocument.version, 1);

    const savedMapUpdatedAt = new Date(Date.now() + 10000).toISOString();
    await adapter.executeAsync(
      'UPDATE maps SET name = ?, updated_at = ? WHERE id = ?',
      ['Saved Outside Live Editing', savedMapUpdatedAt, context.mapId]
    );

    const refreshed = await getLiveDocumentAsync({ mapId: context.mapId });
    assert.strictEqual(refreshed.name, 'Saved Outside Live Editing');
    assert.ok(refreshed.version > committed.liveDocument.version);
    assert.strictEqual(refreshed.mapUpdatedAt, savedMapUpdatedAt);

    const replay = await listCommittedOperationsAsync({
      mapId: context.mapId,
      afterVersion: committed.liveDocument.version,
    });
    assert.strictEqual(replay.currentVersion, refreshed.version);
    assert.deepStrictEqual(replay.operations, []);
  } finally {
    await cleanupPersistedLoadContextAsync(context);
  }
}

async function main() {
  const baseDocument = {
    mapId: 'map-1',
    version: 0,
    name: 'Initial Map',
    notes: null,
    root: {
      id: 'root',
      title: 'Home',
      url: 'https://example.com',
      children: [],
    },
    orphans: [],
    connections: [],
    colors: ['#111111'],
    connectionColors: { crossLinks: '#222222' },
    mapUpdatedAt: '2026-03-13T00:00:00.000Z',
    lastOpId: null,
    lastActorId: null,
  };

  const operations = [
    {
      type: 'metadata.update',
      payload: {
        changes: {
          name: 'Live Map',
          notes: 'sync enabled',
        },
      },
    },
    {
      type: 'node.add',
      payload: {
        nodeId: 'node-a',
        parentId: 'root',
        afterNodeId: null,
        node: {
          title: 'Child A',
          url: 'https://example.com/a',
          children: [],
        },
      },
    },
    {
      type: 'node.update',
      payload: {
        nodeId: 'node-a',
        changes: {
          title: 'Child A Updated',
        },
      },
    },
    {
      type: 'link.add',
      payload: {
        linkId: 'link-a',
        sourceId: 'root',
        targetId: 'node-a',
        link: {
          type: 'userflow',
        },
      },
    },
  ];

  const sequential = operations.reduce(
    (document, operation) => applyOperationToDocument(document, operation),
    baseDocument
  );
  const replayed = replayOperations(baseDocument, operations);

  assert.deepStrictEqual(replayed, sequential);
  assert.strictEqual(replayed.name, 'Live Map');
  assert.strictEqual(replayed.notes, 'sync enabled');
  assert.strictEqual(replayed.root.children.length, 1);
  assert.strictEqual(replayed.root.children[0].title, 'Child A Updated');
  assert.strictEqual(replayed.connections.length, 1);
  assert.strictEqual(replayed.connections[0].id, 'link-a');
  assert.strictEqual(replayed.connections[0].sourceNodeId, 'root');
  assert.strictEqual(replayed.connections[0].targetNodeId, 'node-a');

  const afterDelete = applyOperationToDocument(replayed, {
    type: 'node.delete',
    payload: {
      nodeId: 'node-a',
    },
  });
  assert.strictEqual(afterDelete.root.children.length, 0);
  assert.strictEqual(afterDelete.connections.length, 0);

  expectSyncError(() => applyOperationToDocument(baseDocument, {
    type: 'metadata.update',
    payload: {
      changes: { url: 'https://invalid.example' },
    },
  }), 'COEDITING_UNSUPPORTED_METADATA_FIELD');

  expectSyncError(() => applyOperationToDocument(baseDocument, {
    type: 'node.delete',
    payload: {
      nodeId: 'root',
    },
  }), 'COEDITING_ROOT_DELETE_FORBIDDEN');

  await assertSavedMapDriftRefreshesLiveSnapshot();

  console.log('[coediting-sync-engine] Passed. Live document apply/replay/resync behavior is consistent.');
}

main().catch((error) => {
  console.error('[coediting-sync-engine] Failed:', error.message);
  process.exit(1);
});
