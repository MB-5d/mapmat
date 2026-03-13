#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const { normalizeOperationEnvelope } = require('../utils/coeditingContract');
const {
  applyOperationToDocument,
  CoeditingSyncError,
} = require('../utils/coeditingSyncEngine');

const BASE_DOCUMENT = Object.freeze({
  mapId: '11111111-1111-4111-8111-111111111111',
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
  connectionColors: {
    crossLinks: '#222222',
  },
  mapUpdatedAt: '2026-03-13T00:00:00.000Z',
  lastOpId: null,
  lastActorId: null,
});

function clone(value) {
  return structuredClone(value);
}

function isoAt(second) {
  return `2026-03-13T00:00:${String(second).padStart(2, '0')}.000Z`;
}

function createClient(actorId, sessionId) {
  return {
    actorId,
    sessionId,
    document: clone(BASE_DOCUMENT),
    knownVersion: 0,
  };
}

function createServer() {
  return {
    document: clone(BASE_DOCUMENT),
    committed: [],
  };
}

function buildOperation({
  opId,
  actorId,
  sessionId,
  baseVersion,
  timestamp,
  type,
  payload,
}) {
  return normalizeOperationEnvelope({
    opId,
    mapId: BASE_DOCUMENT.mapId,
    sessionId,
    actorId,
    baseVersion,
    timestamp,
    type,
    payload,
  });
}

function applyCommittedOperation(document, operation) {
  const nextDocument = applyOperationToDocument(document, operation);
  nextDocument.version = Number.isInteger(operation.version)
    ? operation.version
    : (document.version || 0) + 1;
  nextDocument.lastOpId = operation.opId || null;
  nextDocument.lastActorId = operation.actorId || null;
  nextDocument.mapUpdatedAt = operation.committedAt || document.mapUpdatedAt || null;
  return nextDocument;
}

function commitOperation(server, operation, committedAt) {
  if (operation.baseVersion !== server.document.version) {
    throw new CoeditingSyncError(
      'COEDITING_VERSION_CONFLICT',
      'Operation baseVersion does not match current live document version',
      409,
      {
        expectedBaseVersion: operation.baseVersion,
        currentVersion: server.document.version,
      }
    );
  }

  const version = server.document.version + 1;
  const committedOperation = {
    ...operation,
    version,
    committedAt,
  };

  server.document = applyCommittedOperation(server.document, committedOperation);
  server.committed.push(committedOperation);
  return committedOperation;
}

function replayFromVersion(server, afterVersion) {
  return server.committed.filter((operation) => operation.version > afterVersion);
}

function syncClientFromReplay(client, server) {
  const replay = replayFromVersion(server, client.knownVersion);
  for (const operation of replay) {
    client.document = applyCommittedOperation(client.document, operation);
    client.knownVersion = operation.version;
  }
  return replay;
}

function summarizeDocument(document) {
  return {
    version: document.version,
    name: document.name,
    notes: document.notes,
    root: document.root,
    orphans: document.orphans,
    connections: document.connections,
    colors: document.colors,
    connectionColors: document.connectionColors,
    lastOpId: document.lastOpId,
    lastActorId: document.lastActorId,
  };
}

function expectVersionConflict(fn) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof CoeditingSyncError, 'Expected CoeditingSyncError');
  assert.strictEqual(thrown.code, 'COEDITING_VERSION_CONFLICT');
}

function main() {
  const server = createServer();
  const clientA = createClient('22222222-2222-4222-8222-222222222222', 'session-a');
  const clientB = createClient('33333333-3333-4333-8333-333333333333', 'session-b');
  const clientC = createClient('44444444-4444-4444-8444-444444444444', 'session-c');

  const draftA1 = {
    opId: 'op-a-1',
    actorId: clientA.actorId,
    sessionId: clientA.sessionId,
    type: 'node.add',
    payload: {
      nodeId: 'node-a',
      parentId: 'root',
      afterNodeId: null,
      node: {
        title: 'Docs',
        url: 'https://example.com/docs',
        children: [],
      },
    },
  };
  const committedA1 = commitOperation(
    server,
    buildOperation({
      ...draftA1,
      baseVersion: clientA.knownVersion,
      timestamp: isoAt(1),
    }),
    isoAt(1)
  );
  clientA.document = applyCommittedOperation(clientA.document, committedA1);
  clientA.knownVersion = committedA1.version;

  const draftB1 = {
    opId: 'op-b-1',
    actorId: clientB.actorId,
    sessionId: clientB.sessionId,
    type: 'metadata.update',
    payload: {
      changes: {
        name: 'Collaborative Map',
        notes: 'rebased after replay',
      },
    },
  };
  expectVersionConflict(() => {
    commitOperation(
      server,
      buildOperation({
        ...draftB1,
        baseVersion: clientB.knownVersion,
        timestamp: isoAt(2),
      }),
      isoAt(2)
    );
  });

  const replayToB = syncClientFromReplay(clientB, server);
  assert.strictEqual(replayToB.length, 1);
  assert.strictEqual(clientB.knownVersion, 1);

  const committedB1 = commitOperation(
    server,
    buildOperation({
      ...draftB1,
      baseVersion: clientB.knownVersion,
      timestamp: isoAt(3),
    }),
    isoAt(3)
  );
  clientB.document = applyCommittedOperation(clientB.document, committedB1);
  clientB.knownVersion = committedB1.version;

  const draftA2 = {
    opId: 'op-a-2',
    actorId: clientA.actorId,
    sessionId: clientA.sessionId,
    type: 'link.add',
    payload: {
      linkId: 'link-root-node-a',
      sourceId: 'root',
      targetId: 'node-a',
      link: {
        type: 'userflow',
      },
    },
  };
  expectVersionConflict(() => {
    commitOperation(
      server,
      buildOperation({
        ...draftA2,
        baseVersion: clientA.knownVersion,
        timestamp: isoAt(4),
      }),
      isoAt(4)
    );
  });

  const replayToA = syncClientFromReplay(clientA, server);
  assert.strictEqual(replayToA.length, 1);
  assert.strictEqual(clientA.knownVersion, 2);

  const committedA2 = commitOperation(
    server,
    buildOperation({
      ...draftA2,
      baseVersion: clientA.knownVersion,
      timestamp: isoAt(5),
    }),
    isoAt(5)
  );
  clientA.document = applyCommittedOperation(clientA.document, committedA2);
  clientA.knownVersion = committedA2.version;

  let outOfOrderFailure = null;
  try {
    clientC.document = applyCommittedOperation(clientC.document, committedA2);
    clientC.knownVersion = committedA2.version;
  } catch (error) {
    outOfOrderFailure = error;
  }
  assert(outOfOrderFailure instanceof CoeditingSyncError, 'Expected out-of-order apply failure');

  const replayToC = syncClientFromReplay(clientC, server);
  assert.strictEqual(replayToC.length, 3);
  assert.strictEqual(clientC.knownVersion, 3);

  const replayToBFinal = syncClientFromReplay(clientB, server);
  assert.strictEqual(replayToBFinal.length, 1);
  assert.strictEqual(clientB.knownVersion, 3);

  assert.deepStrictEqual(summarizeDocument(clientA.document), summarizeDocument(server.document));
  assert.deepStrictEqual(summarizeDocument(clientB.document), summarizeDocument(server.document));
  assert.deepStrictEqual(summarizeDocument(clientC.document), summarizeDocument(server.document));
  assert.strictEqual(server.document.name, 'Collaborative Map');
  assert.strictEqual(server.document.notes, 'rebased after replay');
  assert.strictEqual(server.document.root.children.length, 1);
  assert.strictEqual(server.document.connections.length, 1);
  assert.strictEqual(server.document.connections[0].id, 'link-root-node-a');

  console.log('[coediting-simulation] Passed. Multi-client replay/rebase convergence is deterministic.');
}

main();
