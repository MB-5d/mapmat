const assert = require('assert');
const { performance } = require('perf_hooks');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const authStore = require('../../stores/authStore');
const mapStore = require('../../stores/mapStore');
const coeditingStore = require('../../stores/coeditingStore');
const { normalizeOperationEnvelope } = require('../../utils/coeditingContract');
const {
  CoeditingSyncError,
  applyOperationAsync,
  getLiveDocumentAsync,
  listCommittedOperationsAsync,
} = require('../../utils/coeditingSyncEngine');

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

function normalizeLabel(label) {
  return String(label || 'load')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'load';
}

function createClient(index, { sessionPrefix = 'load-session' } = {}) {
  return {
    actorId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    sessionId: `${sessionPrefix}-${index + 1}`,
    knownVersion: 0,
    knownReplayVersion: 0,
    nodeIds: [],
  };
}

function createClients(count, options = {}) {
  return Array.from({ length: count }, (_, index) => createClient(index, options));
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

function shouldSkipPersistedHarness() {
  return db.runtime?.activeProvider === 'postgres' && !process.env.DATABASE_URL;
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
  return replay;
}

async function createPersistedLoadContextAsync({ label = 'load' } = {}) {
  const safeLabel = normalizeLabel(label);
  const seed = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const userEmail = `coediting-${safeLabel}-${seed}@example.com`;

  await coeditingStore.ensureCoeditingSchemaAsync();
  const user = await authStore.createUserAsync({
    email: userEmail,
    passwordHash: 'not-used',
    name: `Coediting ${safeLabel} Check`,
  });

  const mapId = uuidv4();
  await mapStore.createMapAsync({
    id: mapId,
    userId: user.id,
    projectId: null,
    name: `Coediting ${safeLabel} Check`,
    notes: null,
    url: 'https://example.com',
    rootData: JSON.stringify(baseDocumentRoot()),
    orphansData: JSON.stringify([]),
    connectionsData: JSON.stringify([]),
    colors: JSON.stringify(['#111111']),
    connectionColors: JSON.stringify({ crossLinks: '#222222' }),
  });

  return {
    label: safeLabel,
    userId: user.id,
    mapId,
    baseTimeMs: Date.now(),
    totalCommittedOps: 0,
    nextOpIndex: 1,
  };
}

async function cleanupPersistedLoadContextAsync(context) {
  if (!context) return;
  if (context.userId) {
    await authStore.deleteUserAsync(context.userId);
    return;
  }
  if (context.mapId) {
    await mapStore.deleteMapByIdAsync(context.mapId);
  }
}

async function runPersistedLoadRoundAsync({
  context,
  clients,
  totalOps,
  replayInterval,
  conflictInterval,
  maxP95Ms = 0,
  maxTotalMs = 0,
} = {}) {
  assert(context?.mapId, 'context.mapId is required');
  assert(Array.isArray(clients) && clients.length > 0, 'clients are required');
  assert(Number.isInteger(totalOps) && totalOps > 0, 'totalOps must be a positive integer');
  assert(Number.isInteger(replayInterval) && replayInterval > 0, 'replayInterval must be a positive integer');
  assert(Number.isInteger(conflictInterval) && conflictInterval > 1, 'conflictInterval must be greater than 1');

  const latencies = [];
  const replayStats = {
    requests: 0,
    operations: 0,
    maxBatch: 0,
  };
  let roundCommittedOps = 0;
  let conflictCount = 0;
  let expectedConflictCount = 0;
  const startedAt = performance.now();

  for (let index = 0; index < totalOps; index += 1) {
    const currentVersion = context.totalCommittedOps + roundCommittedOps;
    const globalOpIndex = context.nextOpIndex;
    const client = clients[(globalOpIndex - 1) % clients.length];
    const shouldConflict = currentVersion > 0 && globalOpIndex % conflictInterval === 0;

    if (!shouldConflict && client.knownReplayVersion < currentVersion) {
      await replayClientAsync({
        mapId: context.mapId,
        client,
        replayStats,
      });
    }

    const baseVersion = shouldConflict
      ? Math.max(0, currentVersion - 1)
      : client.knownVersion;
    const operation = buildOperation({
      mapId: context.mapId,
      client,
      baseVersion,
      opIndex: globalOpIndex,
      baseTimeMs: context.baseTimeMs,
    });

    const opStartedAt = performance.now();
    try {
      const committed = await applyOperationAsync({
        mapId: context.mapId,
        operation,
      });
      if (shouldConflict) {
        throw new Error(`Expected version conflict at op ${globalOpIndex}`);
      }
      latencies.push(Math.round(performance.now() - opStartedAt));
      roundCommittedOps += 1;
      client.knownVersion = committed.liveDocument.version;
      client.knownReplayVersion = committed.liveDocument.version;
      client.nodeIds.push(operation.payload.nodeId);
    } catch (error) {
      if (!(error instanceof CoeditingSyncError) || error.code !== 'COEDITING_VERSION_CONFLICT') {
        throw error;
      }
      if (!shouldConflict) {
        throw new Error(`Unexpected version conflict at op ${globalOpIndex}`);
      }

      expectedConflictCount += 1;
      conflictCount += 1;
      await replayClientAsync({
        mapId: context.mapId,
        client,
        replayStats,
      });

      const retried = buildOperation({
        mapId: context.mapId,
        client,
        baseVersion: client.knownVersion,
        opIndex: globalOpIndex,
        baseTimeMs: context.baseTimeMs,
      });
      const retryStartedAt = performance.now();
      const committed = await applyOperationAsync({
        mapId: context.mapId,
        operation: retried,
      });
      latencies.push(Math.round(performance.now() - retryStartedAt));
      roundCommittedOps += 1;
      client.knownVersion = committed.liveDocument.version;
      client.knownReplayVersion = committed.liveDocument.version;
      client.nodeIds.push(retried.payload.nodeId);
    }

    context.nextOpIndex += 1;

    if (globalOpIndex % replayInterval === 0) {
      const replayClient = clients[globalOpIndex % clients.length];
      await replayClientAsync({
        mapId: context.mapId,
        client: replayClient,
        replayStats,
      });
    }
  }

  const expectedCommittedOps = context.totalCommittedOps + roundCommittedOps;
  for (const client of clients) {
    if (client.knownReplayVersion < expectedCommittedOps) {
      await replayClientAsync({
        mapId: context.mapId,
        client,
        replayStats,
      });
    }
  }

  const totalMs = Math.round(performance.now() - startedAt);
  const p95Ms = percentile(latencies, 0.95);
  const avgMs = average(latencies);
  const liveDocument = await getLiveDocumentAsync({ mapId: context.mapId });
  const replay = await listCommittedOperationsAsync({
    mapId: context.mapId,
    afterVersion: Math.max(0, liveDocument.version - 25),
    limit: 25,
  });

  assert.strictEqual(conflictCount, expectedConflictCount);
  assert.strictEqual(liveDocument.version, expectedCommittedOps);
  assert.strictEqual(replay.currentVersion, liveDocument.version);
  assert.ok(replay.operations.length > 0);
  assert.strictEqual(clients.every((client) => client.knownVersion === expectedCommittedOps), true);

  const rootChildren = Array.isArray(liveDocument.root?.children) ? liveDocument.root.children : [];
  assert.strictEqual(rootChildren.length, expectedCommittedOps);
  assert.strictEqual(replayStats.requests > 0, true);
  assert.strictEqual(replayStats.maxBatch <= expectedCommittedOps, true);

  if (maxP95Ms > 0) {
    assert.ok(
      p95Ms <= maxP95Ms,
      `Expected p95 commit latency <= ${maxP95Ms}ms, received ${p95Ms}ms`
    );
  }
  if (maxTotalMs > 0) {
    assert.ok(
      totalMs <= maxTotalMs,
      `Expected round runtime <= ${maxTotalMs}ms, received ${totalMs}ms`
    );
  }

  context.totalCommittedOps = expectedCommittedOps;

  return {
    roundCommittedOps,
    totalCommittedOps: expectedCommittedOps,
    conflicts: conflictCount,
    replayRequests: replayStats.requests,
    replayOperations: replayStats.operations,
    replayMaxBatch: replayStats.maxBatch,
    avgCommitMs: avgMs,
    p95CommitMs: p95Ms,
    totalMs,
    runtime: db.runtime?.activeProvider || 'sqlite',
  };
}

async function runPersistedLoadScenarioAsync({
  label = 'load',
  clientCount,
  totalOps,
  replayInterval,
  conflictInterval,
  maxP95Ms = 0,
  maxTotalMs = 0,
} = {}) {
  const context = await createPersistedLoadContextAsync({ label });
  try {
    const clients = createClients(clientCount, {
      sessionPrefix: `${normalizeLabel(label)}-session`,
    });
    return await runPersistedLoadRoundAsync({
      context,
      clients,
      totalOps,
      replayInterval,
      conflictInterval,
      maxP95Ms,
      maxTotalMs,
    });
  } finally {
    await cleanupPersistedLoadContextAsync(context);
  }
}

module.exports = {
  clampInt,
  average,
  percentile,
  createClients,
  shouldSkipPersistedHarness,
  createPersistedLoadContextAsync,
  cleanupPersistedLoadContextAsync,
  runPersistedLoadRoundAsync,
  runPersistedLoadScenarioAsync,
};
