#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const {
  applyOperationToDocument,
  replayOperations,
  CoeditingSyncError,
} = require('../utils/coeditingSyncEngine');

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

function main() {
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

  console.log('[coediting-sync-engine] Passed. Live document apply/replay behavior is consistent.');
}

main();
