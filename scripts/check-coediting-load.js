#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const { performance } = require('perf_hooks');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const authStore = require('../stores/authStore');
const mapStore = require('../stores/mapStore');
const coeditingStore = require('../stores/coeditingStore');
const { normalizeOperationEnvelope } = require('../utils/coeditingContract');
const {
  CoeditingSyncError,
  applyOperationAsync,
  getLiveDocumentAsync,
  listCommittedOperationsAsync,
} = require('../utils/coeditingSyncEngine');

const CLIENT_COUNT = clampInt(process.env.COEDITING_LOAD_CLIENTS, 6, { min: 2, max: 24 });
const TOTAL_OPS = clampInt(process.env.COEDITING_LOAD_OPS, 180, { min: 20, max: 5000 });
const REPLAY_INTERVAL = clampInt(process.env.COEDITING_LOAD_REPLAY_INTERVAL, 15, { min: 1, max: 500 });
const CONFLICT_INTERVAL = clampInt(process.env.COEDITING_LOAD_CONFLICT_INTERVAL, 12, { min: 2, max: 500 });
const MAX_P95_MS = clampInt(process.env.COEDITING_LOAD_MAX_P95_MS, 0, { min: 0, max: 60000 });
const MAX_TOTAL_MS = clampInt(process.env.COEDITING_LOAD_MAX_TOTAL_MS, 0, { min: 0, max: 600000 });

function clampInt(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function percentile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isoAt(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

function baseDocumentRoot() {
  return {
    id: 'root',
    title: 'Load Test Root',
    url: 'https://example.com',
    children: [],
  };
}

function createClient(index) {
  return {
    actorId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    sessionId: `load-session-${index + 1}`,
    knownVersion: 0,
    knownReplayVersion: 0,
    nodeIds: [],
  };
}

function buildOperation({ mapId, client, baseVersion, opIndex, baseTimeMs }) {
  const nodeId = `node-${client.actorId}-${opIndex}`;
  return normalizeOperationEnvelope({
    opId: `load-op-${client.actorId}-${opIndex}`,
    mapId,
    sessionId: client.sessionId,
    actorId: client.actorId,
    baseVersion,
    timestamp: isoAt(baseTimeMs, opIndex * 10),
    type: 'node.add',
    payload: {
      nodeId,
      parentId: 'root',
      afterNodeId: client.nodeIds.at(-1) || null,
      node: {
        id: nodeId,
        title: `Node ${opIndex}`,
        url: `https://example.com/${client.actorId}/${opIndex}`,
        children: [],
      },
    },
  });
}

async function replayClientAsync({ mapId, client, replayStats }) {
  const replay = await listCommittedOperationsAsync({
    mapId,
    afterVersion: client.knownReplayVersion,
    limit: 500,
  });

  replayStats.requests += 1;
  replayStats.operations += replay.operations.length;
  replayStats.maxBatch = Math.max(replayStats.maxBatch, replay.operations.length);
  client.knownVersion = replay.currentVersion;
  client.knownReplayVersion = replay.currentVersion;
}

async function main() {
  if (db.runtime?.activeProvider === 'postgres' && !process.env.DATABASE_URL) {
    console.log('[coediting-load] Skipped persisted load check without DATABASE_URL.');
    return;
  }

  const seed = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const userEmail = `coediting-load-${seed}@example.com`;
  let userId = null;
  let mapId = uuidv4();

  try {
    await coeditingStore.ensureCoeditingSchemaAsync();
    const user = await authStore.createUserAsync({
      email: userEmail,
      passwordHash: 'not-used',
      name: 'Coediting Load Check',
    });
    userId = user.id;

    await mapStore.createMapAsync({
      id: mapId,
      userId,
      projectId: null,
      name: 'Coediting Load Check',
      notes: null,
      url: 'https://example.com',
      rootData: JSON.stringify(baseDocumentRoot()),
      orphansData: JSON.stringify([]),
      connectionsData: JSON.stringify([]),
      colors: JSON.stringify(['#111111']),
      connectionColors: JSON.stringify({ crossLinks: '#222222' }),
    });

    const clients = Array.from({ length: CLIENT_COUNT }, (_, index) => createClient(index));
    const latencies = [];
    const replayStats = {
      requests: 0,
      operations: 0,
      maxBatch: 0,
    };
    let committedOps = 0;
    let conflictCount = 0;
    const startedAt = performance.now();
    const baseTimeMs = Date.now();

    for (let index = 0; index < TOTAL_OPS; index += 1) {
      const client = clients[index % clients.length];
      const shouldConflict = index > 0 && index % CONFLICT_INTERVAL === 0;
      const baseVersion = shouldConflict
        ? Math.max(0, client.knownVersion - 1)
        : client.knownVersion;

      const operation = buildOperation({
        mapId,
        client,
        baseVersion,
        opIndex: index + 1,
        baseTimeMs,
      });

      const opStartedAt = performance.now();
      try {
        const committed = await applyOperationAsync({ mapId, operation });
        latencies.push(Math.round(performance.now() - opStartedAt));
        committedOps += 1;
        client.knownVersion = committed.liveDocument.version;
        client.knownReplayVersion = committed.liveDocument.version;
        client.nodeIds.push(operation.payload.nodeId);
      } catch (error) {
        if (!(error instanceof CoeditingSyncError) || error.code !== 'COEDITING_VERSION_CONFLICT') {
          throw error;
        }
        conflictCount += 1;
        await replayClientAsync({ mapId, client, replayStats });
        const retried = buildOperation({
          mapId,
          client,
          baseVersion: client.knownVersion,
          opIndex: index + 1,
          baseTimeMs,
        });
        const retryStartedAt = performance.now();
        const committed = await applyOperationAsync({ mapId, operation: retried });
        latencies.push(Math.round(performance.now() - retryStartedAt));
        committedOps += 1;
        client.knownVersion = committed.liveDocument.version;
        client.knownReplayVersion = committed.liveDocument.version;
        client.nodeIds.push(retried.payload.nodeId);
      }

      if ((index + 1) % REPLAY_INTERVAL === 0) {
        const replayClient = clients[(index + 1) % clients.length];
        await replayClientAsync({ mapId, client: replayClient, replayStats });
      }
    }

    for (const client of clients) {
      if (client.knownReplayVersion < committedOps) {
        await replayClientAsync({ mapId, client, replayStats });
      }
    }

    const totalMs = Math.round(performance.now() - startedAt);
    const p95Ms = percentile(latencies, 0.95);
    const avgMs = average(latencies);
    const liveDocument = await getLiveDocumentAsync({ mapId });
    const replay = await listCommittedOperationsAsync({
      mapId,
      afterVersion: Math.max(0, liveDocument.version - 25),
      limit: 25,
    });

    assert.strictEqual(liveDocument.version, committedOps);
    assert.strictEqual(replay.currentVersion, liveDocument.version);
    assert.ok(replay.operations.length > 0);
    assert.strictEqual(clients.every((client) => client.knownVersion === committedOps), true);

    const rootChildren = Array.isArray(liveDocument.root?.children) ? liveDocument.root.children : [];
    assert.strictEqual(rootChildren.length, committedOps);
    assert.strictEqual(conflictCount >= Math.floor(TOTAL_OPS / CONFLICT_INTERVAL), true);
    assert.strictEqual(replayStats.requests > 0, true);
    assert.strictEqual(replayStats.maxBatch <= committedOps, true);

    if (MAX_P95_MS > 0) {
      assert.ok(
        p95Ms <= MAX_P95_MS,
        `Expected p95 commit latency <= ${MAX_P95_MS}ms, received ${p95Ms}ms`
      );
    }
    if (MAX_TOTAL_MS > 0) {
      assert.ok(
        totalMs <= MAX_TOTAL_MS,
        `Expected total runtime <= ${MAX_TOTAL_MS}ms, received ${totalMs}ms`
      );
    }

    console.log('[coediting-load] Passed.', {
      clients: CLIENT_COUNT,
      committedOps,
      conflicts: conflictCount,
      replayRequests: replayStats.requests,
      replayOperations: replayStats.operations,
      replayMaxBatch: replayStats.maxBatch,
      avgCommitMs: avgMs,
      p95CommitMs: p95Ms,
      totalMs,
      runtime: db.runtime?.activeProvider || 'sqlite',
    });
  } finally {
    if (userId) {
      await authStore.deleteUserAsync(userId);
    } else if (mapId) {
      await mapStore.deleteMapByIdAsync(mapId);
    }
  }
}

main().catch((error) => {
  console.error('[coediting-load] Failed:', error.message);
  process.exit(1);
});
