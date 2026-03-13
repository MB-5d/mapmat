#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const {
  createCoeditingRoomRegistry,
  createTransportConfigFromEnv,
} = require('../utils/coeditingTransport');

function main() {
  const config = createTransportConfigFromEnv({
    COEDITING_EXPERIMENT_ENABLED: 'true',
    COEDITING_WS_ROOM_RATE_LIMIT_PER_MIN: '2',
    COEDITING_WS_HEARTBEAT_SEC: '20',
    COEDITING_WS_IDLE_TIMEOUT_SEC: '90',
  });

  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.roomRateLimitPerMin, 10);
  assert.strictEqual(config.heartbeatIntervalSec, 20);
  assert.strictEqual(config.idleTimeoutSec, 90);

  const registry = createCoeditingRoomRegistry({ roomRateLimitPerMin: 2 });

  const firstJoin = registry.joinSession({
    mapId: 'map-1',
    actorId: 'user-1',
    sessionId: 'session-1',
    displayName: 'First User',
    clientName: 'web',
    accessMode: 'edit',
    connection: { id: 'socket-1' },
    now: 1000,
  });

  assert.strictEqual(firstJoin.resumed, false);
  assert.strictEqual(firstJoin.participants.length, 1);
  assert.strictEqual(firstJoin.participants[0].sessionId, 'session-1');

  const resumedJoin = registry.joinSession({
    mapId: 'map-1',
    actorId: 'user-1',
    sessionId: 'session-1',
    displayName: 'First User',
    clientName: 'web',
    accessMode: 'edit',
    connection: { id: 'socket-2' },
    now: 2000,
  });

  assert.strictEqual(resumedJoin.resumed, true);
  assert.ok(resumedJoin.replacedSession);
  assert.strictEqual(resumedJoin.participants.length, 1);
  assert.strictEqual(resumedJoin.participants[0].resumedAt, '1970-01-01T00:00:02.000Z');

  registry.touchSession(resumedJoin.session, 4000);
  const participantsAfterTouch = registry.listParticipants('map-1');
  assert.strictEqual(participantsAfterTouch[0].lastSeenAt, '1970-01-01T00:00:04.000Z');

  const firstRate = registry.consumeRoomMessage('map-1', 5000);
  const secondRate = registry.consumeRoomMessage('map-1', 6000);
  const blockedRate = registry.consumeRoomMessage('map-1', 7000);

  assert.strictEqual(firstRate.allowed, true);
  assert.strictEqual(secondRate.allowed, true);
  assert.strictEqual(blockedRate.allowed, false);
  assert.strictEqual(blockedRate.remaining, 0);

  const expired = registry.getExpiredSessions(95001, 90000);
  assert.strictEqual(expired.length, 1);
  assert.strictEqual(expired[0].sessionId, 'session-1');

  const leaveResult = registry.leaveSession(resumedJoin.session);
  assert.strictEqual(leaveResult.removed, true);
  assert.deepStrictEqual(registry.listParticipants('map-1'), []);

  console.log('[coediting-transport] Passed. Room join/resume/rate-limit behavior is consistent.');
}

main();
