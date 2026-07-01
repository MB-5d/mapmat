#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const jwt = require('jsonwebtoken');
const { once } = require('events');
const {
  getCoeditingHealthSnapshotAsync,
  recordDroppedEventAsync,
} = require('../utils/coeditingObservability');
const { attachCoeditingTransport } = require('../utils/coeditingTransport');
const {
  createPersistedLoadContextAsync,
  cleanupPersistedLoadContextAsync,
  shouldSkipPersistedHarness,
} = require('./lib/coeditingLoadHarness');

const JWT_SECRET_EFFECTIVE = process.env.JWT_SECRET || 'vellic-dev-secret-change-in-production';
const MESSAGE_TIMEOUT_MS = 3000;

function encodeClientFrame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload || ''), 'utf8');
  const mask = crypto.randomBytes(4);
  let header = null;

  if (body.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | body.length;
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    throw new Error('Frame payload exceeds test harness limit');
  }

  header[0] = 0x80 | (opcode & 0x0f);
  const masked = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index += 1) {
    masked[index] = body[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

function encodeClientJsonFrame(payload) {
  return encodeClientFrame(0x1, JSON.stringify(payload));
}

function encodeClientCloseFrame(code = 1000, reason = '') {
  const reasonBuffer = Buffer.from(String(reason || ''), 'utf8');
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  return encodeClientFrame(0x8, payload);
}

function decodeServerFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    let payloadLength = secondByte & 0x7f;
    const masked = Boolean(secondByte & 0x80);
    let cursor = offset + 2;

    if (payloadLength === 126) {
      if (cursor + 2 > buffer.length) break;
      payloadLength = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (payloadLength === 127) {
      throw new Error('64-bit websocket payloads are not supported in this test harness');
    }

    const maskLength = masked ? 4 : 0;
    if (cursor + maskLength + payloadLength > buffer.length) break;

    const mask = masked ? buffer.subarray(cursor, cursor + 4) : null;
    cursor += maskLength;
    const payload = Buffer.from(buffer.subarray(cursor, cursor + payloadLength));

    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    frames.push({
      opcode: firstByte & 0x0f,
      payload,
    });

    offset = cursor + payloadLength;
  }

  return {
    frames,
    remaining: buffer.subarray(offset),
  };
}

class TestWebSocketClient {
  constructor(socket, initialBuffer = Buffer.alloc(0)) {
    this.socket = socket;
    this.buffer = initialBuffer;
    this.frames = [];
    this.waiters = [];
    this.closed = false;
    this.error = null;

    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flushFrames();
    });
    this.socket.on('end', () => {
      this.closed = true;
      this.flushWaiters();
    });
    this.socket.on('close', () => {
      this.closed = true;
      this.flushWaiters();
    });
    this.socket.on('error', (error) => {
      this.error = error;
      this.closed = true;
      this.flushWaiters();
    });

    this.flushFrames();
  }

  flushFrames() {
    const decoded = decodeServerFrames(this.buffer);
    this.buffer = decoded.remaining;
    if (decoded.frames.length > 0) {
      this.frames.push(...decoded.frames);
    }
    this.flushWaiters();
  }

  flushWaiters() {
    while (this.waiters.length > 0) {
      if (this.frames.length > 0) {
        const waiter = this.waiters.shift();
        clearTimeout(waiter.timer);
        waiter.resolve(this.frames.shift());
        continue;
      }

      if (this.error) {
        const waiter = this.waiters.shift();
        clearTimeout(waiter.timer);
        waiter.reject(this.error);
        continue;
      }

      if (this.closed) {
        const waiter = this.waiters.shift();
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Socket closed before the expected frame arrived'));
        continue;
      }

      break;
    }
  }

  async nextFrameAsync(timeoutMs = MESSAGE_TIMEOUT_MS) {
    if (this.frames.length > 0) {
      return this.frames.shift();
    }
    if (this.error) {
      throw this.error;
    }
    if (this.closed) {
      throw new Error('Socket closed before the expected frame arrived');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error(`Timed out waiting for websocket frame after ${timeoutMs}ms`));
      }, timeoutMs);

      this.waiters.push({ resolve, reject, timer });
    });
  }

  async nextEventAsync(timeoutMs = MESSAGE_TIMEOUT_MS) {
    while (true) {
      const frame = await this.nextFrameAsync(timeoutMs);
      if (frame.opcode === 0x9) {
        this.socket.write(encodeClientFrame(0xA, frame.payload));
        continue;
      }

      if (frame.opcode === 0x8) {
        const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1000;
        const reason = frame.payload.length > 2 ? frame.payload.subarray(2).toString('utf8') : '';
        return { kind: 'close', code, reason };
      }

      if (frame.opcode !== 0x1) {
        return {
          kind: 'frame',
          opcode: frame.opcode,
          payload: frame.payload,
        };
      }

      return {
        kind: 'json',
        message: JSON.parse(frame.payload.toString('utf8')),
      };
    }
  }

  async readJsonMessageAsync(timeoutMs = MESSAGE_TIMEOUT_MS) {
    while (true) {
      const event = await this.nextEventAsync(timeoutMs);
      if (event.kind === 'json') return event.message;
      if (event.kind === 'close') {
        throw new Error(`Socket closed before JSON message arrived (${event.code} ${event.reason})`);
      }
    }
  }

  async readUntilAsync(predicate, { timeoutMs = MESSAGE_TIMEOUT_MS, maxEvents = 20 } = {}) {
    const startedAt = Date.now();
    const seen = [];

    for (let index = 0; index < maxEvents; index += 1) {
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 0) break;
      const event = await this.nextEventAsync(remainingMs);
      seen.push(event);
      if (predicate(event)) {
        return {
          event,
          seen,
        };
      }
    }

    throw new Error('Timed out waiting for matching websocket event');
  }

  sendJson(payload) {
    this.socket.write(encodeClientJsonFrame(payload));
  }

  async closeAsync() {
    if (!this.socket.destroyed && !this.socket.writableEnded) {
      this.socket.write(encodeClientCloseFrame(1000, 'test-complete'));
      this.socket.end();
    }

    if (!this.closed) {
      await Promise.race([
        once(this.socket, 'close'),
        new Promise((resolve) => setTimeout(resolve, 250)),
      ]);
    }
  }
}

function createJwtToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET_EFFECTIVE, { expiresIn: '7d' });
}

function applyEnv(overrides) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

async function startTransportServerAsync(envOverrides) {
  const restoreEnv = applyEnv(envOverrides);
  const server = http.createServer((req, res) => {
    res.statusCode = 404;
    res.end('not found');
  });
  const controller = attachCoeditingTransport({
    server,
    logger: {
      error: (...args) => console.error(...args),
    },
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    server,
    port: server.address().port,
    controller,
    async closeAsync() {
      await new Promise((resolve) => server.close(resolve));
      restoreEnv();
    },
  };
}

async function connectClientAsync({ port, mapId, token }) {
  const key = crypto.randomBytes(16).toString('base64');

  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: `/api/maps/${mapId}/realtime/socket`,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Protocol': `vellic-auth, ${token}`,
      },
    });

    request.once('upgrade', (response, socket, head) => {
      try {
        assert.strictEqual(response.statusCode, 101);
        assert.strictEqual(response.headers['sec-websocket-protocol'], 'vellic-auth');
        resolve(new TestWebSocketClient(socket, head));
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    });

    request.once('response', (response) => {
      reject(new Error(`WebSocket upgrade was rejected with status ${response.statusCode}`));
    });

    request.once('error', reject);
    request.end();
  });
}

async function waitForAsync(check, { timeoutMs = 2000, intervalMs = 25 } = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError) throw lastError;
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function measureSnapshotDeltaAsync(env, before, extractor) {
  return waitForAsync(async () => {
    const after = await getCoeditingHealthSnapshotAsync(env);
    const delta = extractor(after) - extractor(before);
    return delta > 0 ? { after, delta } : null;
  });
}

async function runReadOnlyJoinScenarioAsync({ token, mapId, actorId }) {
  const env = {
    AUTH_HEADER_FALLBACK: 'true',
    COEDITING_EXPERIMENT_ENABLED: 'true',
    COEDITING_SYNC_ENGINE_ENABLED: 'true',
    COEDITING_ROLLOUT_ENABLED: 'true',
    COEDITING_ROLLOUT_USER_IDS: actorId,
    COEDITING_FORCE_READ_ONLY: 'false',
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_RECONNECTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_DROPPED_PER_WINDOW: '1',
  };

  await recordDroppedEventAsync('transport-chaos-preseed', Date.now(), { env });
  const server = await startTransportServerAsync(env);
  let client = null;

  try {
    client = await connectClientAsync({
      port: server.port,
      mapId,
      token,
    });

    const welcome = await client.readJsonMessageAsync();
    assert.strictEqual(welcome.type, 'welcome');
    assert.strictEqual(welcome.roomMode, 'read_only');
    assert.strictEqual(welcome.roomReason, 'health_degraded');
    assert.strictEqual(welcome.readOnlyFallbackActive, true);

    client.sendJson({
      type: 'join',
      sessionId: 'chaos-readonly-session',
      clientName: 'transport-chaos',
      accessMode: 'edit',
    });

    const joined = await client.readJsonMessageAsync();
    assert.strictEqual(joined.type, 'joined');
    assert.strictEqual(joined.roomMode, 'read_only');
    assert.strictEqual(joined.readOnlyFallbackActive, true);
    assert.strictEqual(joined.resumed, false);
  } finally {
    if (client) await client.closeAsync();
    await server.closeAsync();
  }
}

async function runResumeScenarioAsync({ token, mapId, actorId }) {
  const env = {
    AUTH_HEADER_FALLBACK: 'true',
    COEDITING_EXPERIMENT_ENABLED: 'true',
    COEDITING_SYNC_ENGINE_ENABLED: 'true',
    COEDITING_ROLLOUT_ENABLED: 'true',
    COEDITING_ROLLOUT_USER_IDS: actorId,
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_RECONNECTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_DROPPED_PER_WINDOW: '0',
  };
  const before = await getCoeditingHealthSnapshotAsync(env);
  const server = await startTransportServerAsync(env);
  let firstClient = null;
  let secondClient = null;

  try {
    firstClient = await connectClientAsync({
      port: server.port,
      mapId,
      token,
    });
    const firstWelcome = await firstClient.readJsonMessageAsync();
    assert.strictEqual(firstWelcome.type, 'welcome');
    assert.strictEqual(firstWelcome.roomMode, 'enabled');

    firstClient.sendJson({
      type: 'join',
      sessionId: 'chaos-resume-session',
      clientName: 'transport-chaos',
      accessMode: 'edit',
    });
    const firstJoined = await firstClient.readJsonMessageAsync();
    assert.strictEqual(firstJoined.type, 'joined');
    assert.strictEqual(firstJoined.resumed, false);

    secondClient = await connectClientAsync({
      port: server.port,
      mapId,
      token,
    });
    const secondWelcome = await secondClient.readJsonMessageAsync();
    assert.strictEqual(secondWelcome.type, 'welcome');

    secondClient.sendJson({
      type: 'join',
      sessionId: 'chaos-resume-session',
      clientName: 'transport-chaos',
      accessMode: 'edit',
    });

    const replaced = await firstClient.readUntilAsync(
      (event) => event.kind === 'json' && event.message.type === 'session.replaced'
    );
    assert.strictEqual(replaced.event.message.sessionId, 'chaos-resume-session');

    const secondJoined = await secondClient.readUntilAsync(
      (event) => event.kind === 'json' && event.message.type === 'joined'
    );
    assert.strictEqual(secondJoined.event.message.resumed, true);

    const reconnectDelta = await measureSnapshotDeltaAsync(
      env,
      before,
      (snapshot) => snapshot.metrics.reconnects.total
    );
    assert.ok(reconnectDelta.delta >= 1);
  } finally {
    if (firstClient) await firstClient.closeAsync().catch(() => {});
    if (secondClient) await secondClient.closeAsync().catch(() => {});
    await server.closeAsync();
  }
}

async function runJoinTimeoutScenarioAsync({ token, mapId, actorId }) {
  const env = {
    AUTH_HEADER_FALLBACK: 'true',
    COEDITING_EXPERIMENT_ENABLED: 'true',
    COEDITING_SYNC_ENGINE_ENABLED: 'true',
    COEDITING_ROLLOUT_ENABLED: 'true',
    COEDITING_ROLLOUT_USER_IDS: actorId,
    COEDITING_WS_JOIN_TIMEOUT_SEC: '5',
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_RECONNECTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_DROPPED_PER_WINDOW: '0',
  };
  const before = await getCoeditingHealthSnapshotAsync(env);
  const server = await startTransportServerAsync(env);
  let client = null;

  try {
    client = await connectClientAsync({
      port: server.port,
      mapId,
      token,
    });
    const welcome = await client.readJsonMessageAsync(1000);
    assert.strictEqual(welcome.type, 'welcome');

    const timeoutError = await client.readUntilAsync(
      (event) => event.kind === 'json' && event.message.type === 'error' && event.message.error === 'Join timed out',
      { timeoutMs: 7000 }
    );
    assert.strictEqual(timeoutError.event.message.type, 'error');

    const dropDelta = await measureSnapshotDeltaAsync(
      env,
      before,
      (snapshot) => snapshot.metrics.dropped.reasons.join_timeout || 0
    );
    assert.ok(dropDelta.delta >= 1);
  } finally {
    if (client) await client.closeAsync().catch(() => {});
    await server.closeAsync();
  }
}

async function runRateLimitScenarioAsync({ token, mapId, actorId }) {
  const env = {
    AUTH_HEADER_FALLBACK: 'true',
    COEDITING_EXPERIMENT_ENABLED: 'true',
    COEDITING_SYNC_ENGINE_ENABLED: 'true',
    COEDITING_ROLLOUT_ENABLED: 'true',
    COEDITING_ROLLOUT_USER_IDS: actorId,
    COEDITING_WS_ROOM_RATE_LIMIT_PER_MIN: '10',
    COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_RECONNECTS_PER_WINDOW: '0',
    COEDITING_DEGRADE_DROPPED_PER_WINDOW: '0',
  };
  const before = await getCoeditingHealthSnapshotAsync(env);
  const server = await startTransportServerAsync(env);
  let client = null;

  try {
    client = await connectClientAsync({
      port: server.port,
      mapId,
      token,
    });
    await client.readJsonMessageAsync();

    client.sendJson({
      type: 'join',
      sessionId: 'chaos-rate-limit-session',
      clientName: 'transport-chaos',
      accessMode: 'edit',
    });
    const joined = await client.readUntilAsync(
      (event) => event.kind === 'json' && event.message.type === 'joined'
    );
    assert.strictEqual(joined.event.message.type, 'joined');

    for (let index = 0; index < 10; index += 1) {
      client.sendJson({
        type: 'selection.update',
        selectedNodeIds: [`node-${index + 1}`],
      });
    }

    const blocked = await client.readUntilAsync(
      (event) => event.kind === 'json' && event.message.type === 'error' && event.message.error === 'Room rate limit exceeded',
      { timeoutMs: 3000, maxEvents: 25 }
    );
    assert.strictEqual(blocked.event.message.type, 'error');

    const dropDelta = await measureSnapshotDeltaAsync(
      env,
      before,
      (snapshot) => snapshot.metrics.dropped.reasons.room_rate_limit || 0
    );
    assert.ok(dropDelta.delta >= 1);
  } finally {
    if (client) await client.closeAsync().catch(() => {});
    await server.closeAsync();
  }
}

async function main() {
  if (shouldSkipPersistedHarness()) {
    console.log('[coediting-transport-chaos] Skipped transport chaos check without DATABASE_URL.');
    return;
  }

  const context = await createPersistedLoadContextAsync({ label: 'transport-chaos' });
  try {
    const token = createJwtToken(context.userId);

    await runReadOnlyJoinScenarioAsync({
      token,
      mapId: context.mapId,
      actorId: context.userId,
    });
    await runResumeScenarioAsync({
      token,
      mapId: context.mapId,
      actorId: context.userId,
    });
    await runJoinTimeoutScenarioAsync({
      token,
      mapId: context.mapId,
      actorId: context.userId,
    });
    await runRateLimitScenarioAsync({
      token,
      mapId: context.mapId,
      actorId: context.userId,
    });

    const health = await getCoeditingHealthSnapshotAsync({
      COEDITING_DEGRADE_CONFLICTS_PER_WINDOW: '0',
      COEDITING_DEGRADE_RECONNECTS_PER_WINDOW: '0',
      COEDITING_DEGRADE_DROPPED_PER_WINDOW: '0',
    });

    console.log('[coediting-transport-chaos] Passed.', {
      reconnectsTotal: health.metrics.reconnects.total,
      droppedTotal: health.metrics.dropped.total,
      droppedReasons: health.metrics.dropped.reasons,
      readOnlyFallbackActive: health.readOnlyFallbackActive,
    });
  } finally {
    await cleanupPersistedLoadContextAsync(context);
  }
}

main().catch((error) => {
  console.error('[coediting-transport-chaos] Failed:', error.message);
  process.exit(1);
});
