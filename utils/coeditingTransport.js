const crypto = require('crypto');
const mapStore = require('../stores/mapStore');
const collaborationStore = require('../stores/collaborationStore');
const permissionPolicy = require('../policies/permissionPolicy');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{6,120}$/;
const UPGRADE_PATH_PATTERN = /^\/api\/maps\/([^/]+)\/realtime\/socket$/;

const MESSAGE_TYPES = Object.freeze({
  WELCOME: 'welcome',
  JOIN: 'join',
  RESUME: 'resume',
  JOINED: 'joined',
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeat.ack',
  LEAVE: 'leave',
  LEFT: 'left',
  PRESENCE_SYNC: 'presence.sync',
  OPERATION_COMMITTED: 'operation.committed',
  SESSION_REPLACED: 'session.replaced',
  ERROR: 'error',
});

let activeTransportController = null;

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function clampInt(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function createTransportConfigFromEnv(env = process.env) {
  return {
    enabled: parseEnvBool(env.COEDITING_EXPERIMENT_ENABLED, false),
    collaborationBackendEnabled: parseEnvBool(env.COLLABORATION_BACKEND_ENABLED, false),
    heartbeatIntervalSec: clampInt(env.COEDITING_WS_HEARTBEAT_SEC, 20, { min: 5, max: 60 }),
    idleTimeoutSec: clampInt(env.COEDITING_WS_IDLE_TIMEOUT_SEC, 90, { min: 15, max: 600 }),
    joinTimeoutSec: clampInt(env.COEDITING_WS_JOIN_TIMEOUT_SEC, 15, { min: 5, max: 60 }),
    roomRateLimitPerMin: clampInt(env.COEDITING_WS_ROOM_RATE_LIMIT_PER_MIN, 240, { min: 10, max: 5000 }),
    maxMessageBytes: clampInt(env.COEDITING_WS_MAX_MESSAGE_BYTES, 32768, { min: 256, max: 1048576 }),
    maxBackpressureBytes: clampInt(
      env.COEDITING_WS_MAX_BACKPRESSURE_BYTES,
      131072,
      { min: 1024, max: 4194304 }
    ),
  };
}

function normalizeAccessMode(accessMode, role) {
  const normalized = String(accessMode || '').trim().toLowerCase();
  if (['view', 'comment', 'edit'].includes(normalized)) return normalized;
  if (role === permissionPolicy.ROLES.OWNER || role === permissionPolicy.ROLES.EDITOR) return 'edit';
  if (role === permissionPolicy.ROLES.COMMENTER) return 'comment';
  return 'view';
}

function buildSessionKey(actorId, sessionId) {
  return `${actorId}:${sessionId}`;
}

function serializeParticipant(session) {
  return {
    actorId: session.actorId,
    sessionId: session.sessionId,
    displayName: session.displayName || null,
    clientName: session.clientName || null,
    accessMode: session.accessMode,
    joinedAt: new Date(session.joinedAt).toISOString(),
    lastSeenAt: new Date(session.lastHeartbeatAt).toISOString(),
    resumedAt: session.resumedAt ? new Date(session.resumedAt).toISOString() : null,
  };
}

function createCoeditingRoomRegistry({ roomRateLimitPerMin }) {
  const rooms = new Map();

  function getOrCreateRoom(mapId, now) {
    let room = rooms.get(mapId);
    if (!room) {
      room = {
        mapId,
        sessions: new Map(),
        windowStartedAt: now,
        windowCount: 0,
      };
      rooms.set(mapId, room);
    }
    return room;
  }

  function getRoom(mapId) {
    return rooms.get(mapId) || null;
  }

  function cleanupRoom(mapId) {
    const room = rooms.get(mapId);
    if (!room) return;
    if (room.sessions.size === 0) {
      rooms.delete(mapId);
    }
  }

  function listParticipants(mapId) {
    const room = getRoom(mapId);
    if (!room) return [];
    return Array.from(room.sessions.values())
      .sort((a, b) => {
        if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
        return buildSessionKey(a.actorId, a.sessionId).localeCompare(buildSessionKey(b.actorId, b.sessionId));
      })
      .map(serializeParticipant);
  }

  function listSessions(mapId) {
    const room = getRoom(mapId);
    if (!room) return [];
    return Array.from(room.sessions.values());
  }

  function joinSession({
    mapId,
    actorId,
    sessionId,
    displayName,
    clientName,
    accessMode,
    connection,
    now = Date.now(),
  }) {
    const room = getOrCreateRoom(mapId, now);
    const sessionKey = buildSessionKey(actorId, sessionId);
    const replacedSession = room.sessions.get(sessionKey) || null;
    const joinedAt = replacedSession ? replacedSession.joinedAt : now;

    const session = {
      mapId,
      actorId,
      sessionId,
      sessionKey,
      displayName: displayName || null,
      clientName: clientName || null,
      accessMode,
      connection,
      joinedAt,
      lastHeartbeatAt: now,
      resumedAt: replacedSession ? now : null,
    };

    room.sessions.set(sessionKey, session);

    return {
      session,
      replacedSession,
      resumed: Boolean(replacedSession),
      participants: listParticipants(mapId),
    };
  }

  function touchSession(session, now = Date.now()) {
    if (!session) return null;
    session.lastHeartbeatAt = now;
    return session;
  }

  function leaveSession(session) {
    if (!session) return { removed: false, participants: [] };
    const room = getRoom(session.mapId);
    if (!room) return { removed: false, participants: [] };

    const current = room.sessions.get(session.sessionKey);
    if (current !== session) {
      return { removed: false, participants: listParticipants(session.mapId) };
    }

    room.sessions.delete(session.sessionKey);
    const participants = listParticipants(session.mapId);
    cleanupRoom(session.mapId);

    return { removed: true, participants };
  }

  function consumeRoomMessage(mapId, now = Date.now()) {
    const room = getOrCreateRoom(mapId, now);

    if (now - room.windowStartedAt >= 60000) {
      room.windowStartedAt = now;
      room.windowCount = 0;
    }

    if (room.windowCount >= roomRateLimitPerMin) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: room.windowStartedAt + 60000,
      };
    }

    room.windowCount += 1;
    return {
      allowed: true,
      remaining: Math.max(roomRateLimitPerMin - room.windowCount, 0),
      resetAt: room.windowStartedAt + 60000,
    };
  }

  function getExpiredSessions(now, idleTimeoutMs) {
    const expired = [];
    for (const room of rooms.values()) {
      for (const session of room.sessions.values()) {
        if (now - session.lastHeartbeatAt > idleTimeoutMs) {
          expired.push(session);
        }
      }
    }
    return expired;
  }

  return {
    joinSession,
    touchSession,
    leaveSession,
    listParticipants,
    listSessions,
    consumeRoomMessage,
    getExpiredSessions,
  };
}

function parseRealtimePath(rawUrl) {
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const match = parsed.pathname.match(UPGRADE_PATH_PATTERN);
    if (!match) return null;
    return {
      mapId: decodeURIComponent(match[1]),
      pathname: parsed.pathname,
    };
  } catch {
    return null;
  }
}

function writeHttpError(socket, statusCode, statusText, body) {
  if (!socket || socket.destroyed) return;
  const payload = JSON.stringify(body || { error: statusText });
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n`
    + 'Connection: close\r\n'
    + 'Content-Type: application/json\r\n'
    + `Content-Length: ${Buffer.byteLength(payload)}\r\n`
    + '\r\n'
    + payload
  );
  socket.destroy();
}

function createAcceptValue(key) {
  return crypto.createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
}

function encodeFrame(opcode, payloadBuffer = Buffer.alloc(0)) {
  const payload = Buffer.isBuffer(payloadBuffer) ? payloadBuffer : Buffer.from(payloadBuffer);
  const length = payload.length;

  if (length >= 65536) {
    throw new Error('WebSocket frame payload too large');
  }

  if (length < 126) {
    return Buffer.concat([
      Buffer.from([0x80 | opcode, length]),
      payload,
    ]);
  }

  const header = Buffer.alloc(4);
  header[0] = 0x80 | opcode;
  header[1] = 126;
  header.writeUInt16BE(length, 2);
  return Buffer.concat([header, payload]);
}

function encodeTextFrame(message) {
  return encodeFrame(0x1, Buffer.from(String(message), 'utf8'));
}

function encodePongFrame(payloadBuffer = Buffer.alloc(0)) {
  return encodeFrame(0xA, payloadBuffer);
}

function encodeCloseFrame(code = 1000, reason = '') {
  const reasonBuffer = Buffer.from(String(reason || ''), 'utf8').subarray(0, 123);
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  return encodeFrame(0x8, payload);
}

function decodeFrames(buffer, maxMessageBytes) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const fin = Boolean(firstByte & 0x80);
    const opcode = firstByte & 0x0f;
    const masked = Boolean(secondByte & 0x80);
    let payloadLength = secondByte & 0x7f;
    let headerLength = 2;

    if (!fin) {
      return { frames, remaining: buffer.subarray(offset), errorCode: 1003, errorReason: 'Fragmented frames not supported' };
    }

    if (!masked) {
      return { frames, remaining: buffer.subarray(offset), errorCode: 1002, errorReason: 'Client frames must be masked' };
    }

    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      return { frames, remaining: buffer.subarray(offset), errorCode: 1009, errorReason: 'Frame too large' };
    }

    if (payloadLength > maxMessageBytes) {
      return { frames, remaining: buffer.subarray(offset), errorCode: 1009, errorReason: 'Frame exceeds max message size' };
    }

    const totalLength = headerLength + 4 + payloadLength;
    if (offset + totalLength > buffer.length) break;

    const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
    const payload = Buffer.from(
      buffer.subarray(offset + headerLength + 4, offset + totalLength)
    );

    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }

    frames.push({ opcode, payload });
    offset += totalLength;
  }

  return { frames, remaining: buffer.subarray(offset), errorCode: null, errorReason: null };
}

async function resolveActorRoleAsync({
  mapId,
  mapOwnerUserId,
  actorUserId,
  collaborationBackendEnabled,
}) {
  let membershipRole = null;

  if (collaborationBackendEnabled && actorUserId) {
    const membership = await collaborationStore.getMembershipByMapAndUserAsync(mapId, actorUserId);
    membershipRole = membership?.role || null;
  }

  return permissionPolicy.resolveResourceRole({
    actorUserId,
    resourceOwnerUserId: mapOwnerUserId,
    membershipRole,
  });
}

function normalizeJoinMessage(message, role) {
  const sessionId = String(message.sessionId || '').trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { error: { field: 'sessionId', message: 'Valid sessionId is required' } };
  }

  const clientName = String(message.clientName || '').trim().slice(0, 64) || 'web';
  return {
    value: {
      sessionId,
      clientName,
      accessMode: normalizeAccessMode(message.accessMode, role),
    },
  };
}

function attachCoeditingTransport({ server, logger = console } = {}) {
  const config = createTransportConfigFromEnv();
  const registry = createCoeditingRoomRegistry({
    roomRateLimitPerMin: config.roomRateLimitPerMin,
  });

  const heartbeatIntervalMs = config.heartbeatIntervalSec * 1000;
  const idleTimeoutMs = Math.max(config.idleTimeoutSec * 1000, heartbeatIntervalMs + 1000);
  const joinTimeoutMs = config.joinTimeoutSec * 1000;
  let nextConnectionId = 1;

  function sendJson(connection, payload) {
    if (!connection || connection.closed || connection.socket.destroyed || connection.socket.writableEnded) {
      return false;
    }

    const json = JSON.stringify(payload);
    const jsonBytes = Buffer.byteLength(json);
    if (jsonBytes > config.maxMessageBytes) {
      closeConnection(connection, 1009, 'Message exceeds max size');
      return false;
    }

    let frame = null;
    try {
      frame = encodeTextFrame(json);
    } catch {
      closeConnection(connection, 1009, 'Message exceeds max size');
      return false;
    }

    if (connection.socket.writableLength + frame.length > config.maxBackpressureBytes) {
      closeConnection(connection, 1013, 'Backpressure limit exceeded');
      return false;
    }

    connection.socket.write(frame);
    return true;
  }

  function closeConnection(connection, code = 1000, reason = '') {
    if (!connection || connection.closed) return;
    connection.closed = true;

    if (connection.joinTimer) {
      clearTimeout(connection.joinTimer);
      connection.joinTimer = null;
    }

    const currentSession = connection.joinedSession;
    connection.joinedSession = null;

    if (currentSession) {
      const leaveResult = registry.leaveSession(currentSession);
      if (leaveResult.removed) {
        broadcastPresence(currentSession.mapId, {
          reason: 'leave',
          actorId: currentSession.actorId,
          sessionId: currentSession.sessionId,
        });
      }
    }

    if (!connection.socket.destroyed && !connection.socket.writableEnded) {
      try {
        connection.socket.write(encodeCloseFrame(code, reason));
      } catch {
        // Ignore close-frame write failures.
      }
    }

    if (!connection.socket.destroyed) {
      connection.socket.end();
      connection.socket.destroy();
    }
  }

  function broadcastPresence(mapId, extra = {}) {
    const sessions = registry.listSessions(mapId);
    if (sessions.length === 0) return;

    const payload = {
      type: MESSAGE_TYPES.PRESENCE_SYNC,
      mapId,
      participants: registry.listParticipants(mapId),
      serverTime: new Date().toISOString(),
      ...extra,
    };

    for (const session of sessions) {
      sendJson(session.connection, payload);
    }
  }

  function broadcastRoomEvent(mapId, payload) {
    const sessions = registry.listSessions(mapId);
    if (sessions.length === 0) return 0;

    let delivered = 0;
    for (const session of sessions) {
      if (sendJson(session.connection, payload)) {
        delivered += 1;
      }
    }
    return delivered;
  }

  function handleJoin(connection, rawMessage) {
    if (connection.closed) return;

    const normalized = normalizeJoinMessage(rawMessage, connection.role);
    if (normalized.error) {
      sendJson(connection, {
        type: MESSAGE_TYPES.ERROR,
        error: normalized.error.message,
        field: normalized.error.field,
      });
      return;
    }

    if (connection.joinedSession) {
      sendJson(connection, {
        type: MESSAGE_TYPES.ERROR,
        error: 'Socket already joined a room session',
      });
      return;
    }

    const now = Date.now();
    const result = registry.joinSession({
      mapId: connection.mapId,
      actorId: connection.user.id,
      sessionId: normalized.value.sessionId,
      displayName: connection.user.name || connection.user.email || null,
      clientName: normalized.value.clientName,
      accessMode: normalized.value.accessMode,
      connection,
      now,
    });

    connection.joinedSession = result.session;

    if (result.replacedSession && result.replacedSession.connection !== connection) {
      sendJson(result.replacedSession.connection, {
        type: MESSAGE_TYPES.SESSION_REPLACED,
        mapId: connection.mapId,
        actorId: connection.user.id,
        sessionId: normalized.value.sessionId,
        serverTime: new Date(now).toISOString(),
      });
      closeConnection(result.replacedSession.connection, 1008, 'Session resumed elsewhere');
    }

    sendJson(connection, {
      type: MESSAGE_TYPES.JOINED,
      mapId: connection.mapId,
      actorId: connection.user.id,
      sessionId: normalized.value.sessionId,
      resumed: result.resumed,
      participants: result.participants,
      heartbeatIntervalSec: config.heartbeatIntervalSec,
      idleTimeoutSec: config.idleTimeoutSec,
      roomRateLimitPerMin: config.roomRateLimitPerMin,
      serverTime: new Date(now).toISOString(),
    });

    broadcastPresence(connection.mapId, {
      reason: result.resumed ? 'resume' : 'join',
      actorId: connection.user.id,
      sessionId: normalized.value.sessionId,
    });
  }

  function handleHeartbeat(connection) {
    if (!connection.joinedSession) {
      sendJson(connection, {
        type: MESSAGE_TYPES.ERROR,
        error: 'Join is required before heartbeat',
      });
      return;
    }

    const now = Date.now();
    registry.touchSession(connection.joinedSession, now);
    sendJson(connection, {
      type: MESSAGE_TYPES.HEARTBEAT_ACK,
      mapId: connection.mapId,
      actorId: connection.user.id,
      sessionId: connection.joinedSession.sessionId,
      serverTime: new Date(now).toISOString(),
    });
  }

  function handleLeave(connection) {
    if (!connection.joinedSession) {
      sendJson(connection, {
        type: MESSAGE_TYPES.LEFT,
        mapId: connection.mapId,
        serverTime: new Date().toISOString(),
      });
      closeConnection(connection, 1000, 'Client left');
      return;
    }

    const currentSession = connection.joinedSession;
    connection.joinedSession = null;
    const leaveResult = registry.leaveSession(currentSession);

    sendJson(connection, {
      type: MESSAGE_TYPES.LEFT,
      mapId: connection.mapId,
      actorId: currentSession.actorId,
      sessionId: currentSession.sessionId,
      serverTime: new Date().toISOString(),
    });

    if (leaveResult.removed) {
      broadcastPresence(connection.mapId, {
        reason: 'leave',
        actorId: currentSession.actorId,
        sessionId: currentSession.sessionId,
      });
    }

    closeConnection(connection, 1000, 'Client left');
  }

  function handleMessage(connection, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      sendJson(connection, {
        type: MESSAGE_TYPES.ERROR,
        error: 'Message must be a JSON object',
      });
      return;
    }

    const type = String(message.type || '').trim().toLowerCase();
    if (!type) {
      sendJson(connection, {
        type: MESSAGE_TYPES.ERROR,
        error: 'Message type is required',
      });
      return;
    }

    if (type !== MESSAGE_TYPES.HEARTBEAT) {
      const rateLimit = registry.consumeRoomMessage(connection.mapId, Date.now());
      if (!rateLimit.allowed) {
        sendJson(connection, {
          type: MESSAGE_TYPES.ERROR,
          error: 'Room rate limit exceeded',
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        });
        closeConnection(connection, 1013, 'Room rate limit exceeded');
        return;
      }
    }

    if (type === MESSAGE_TYPES.JOIN || type === MESSAGE_TYPES.RESUME) {
      handleJoin(connection, message);
      return;
    }

    if (type === MESSAGE_TYPES.HEARTBEAT) {
      handleHeartbeat(connection);
      return;
    }

    if (type === MESSAGE_TYPES.LEAVE) {
      handleLeave(connection);
      return;
    }

    sendJson(connection, {
      type: MESSAGE_TYPES.ERROR,
      error: `Unsupported message type: ${type}`,
    });
  }

  async function handleUpgrade(req, socket, head) {
    const parsedPath = parseRealtimePath(req.url);
    if (!parsedPath) {
      writeHttpError(socket, 404, 'Not Found', { error: 'Not found' });
      return;
    }

    if (!config.enabled) {
      writeHttpError(socket, 404, 'Not Found', { error: 'Not found' });
      return;
    }

    const upgradeHeader = String(req.headers.upgrade || '').trim().toLowerCase();
    const websocketKey = String(req.headers['sec-websocket-key'] || '').trim();
    const websocketVersion = String(req.headers['sec-websocket-version'] || '').trim();

    if (upgradeHeader !== 'websocket' || !websocketKey || websocketVersion !== '13') {
      writeHttpError(socket, 400, 'Bad Request', { error: 'Invalid WebSocket upgrade request' });
      return;
    }

    const { authenticateRequestAsync } = require('../routes/auth');
    const user = await authenticateRequestAsync(req);
    if (!user) {
      writeHttpError(socket, 401, 'Unauthorized', { error: 'Authentication required' });
      return;
    }

    const map = await mapStore.getMapByIdAsync(parsedPath.mapId);
    if (!map) {
      writeHttpError(socket, 404, 'Not Found', { error: 'Map not found' });
      return;
    }

    if (config.collaborationBackendEnabled) {
      await collaborationStore.ensureCollaborationSchemaAsync();
    }

    const role = await resolveActorRoleAsync({
      mapId: parsedPath.mapId,
      mapOwnerUserId: map.user_id,
      actorUserId: user.id,
      collaborationBackendEnabled: config.collaborationBackendEnabled,
    });

    if (!permissionPolicy.can(permissionPolicy.ACTIONS.MAP_UPDATE, role)) {
      writeHttpError(socket, 404, 'Not Found', { error: 'Map not found' });
      return;
    }

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${createAcceptValue(websocketKey)}\r\n`
      + '\r\n'
    );

    socket.setNoDelay(true);
    socket.setKeepAlive(true, heartbeatIntervalMs);

    const connection = {
      id: `coedit-${nextConnectionId}`,
      socket,
      buffer: head && head.length ? Buffer.from(head) : Buffer.alloc(0),
      closed: false,
      mapId: parsedPath.mapId,
      user,
      role,
      joinedSession: null,
      joinTimer: null,
    };
    nextConnectionId += 1;

    connection.joinTimer = setTimeout(() => {
      if (!connection.joinedSession) {
        sendJson(connection, {
          type: MESSAGE_TYPES.ERROR,
          error: 'Join timed out',
        });
        closeConnection(connection, 1008, 'Join timed out');
      }
    }, joinTimeoutMs);
    connection.joinTimer.unref?.();

    sendJson(connection, {
      type: MESSAGE_TYPES.WELCOME,
      mapId: parsedPath.mapId,
      actorId: user.id,
      heartbeatIntervalSec: config.heartbeatIntervalSec,
      idleTimeoutSec: config.idleTimeoutSec,
      joinTimeoutSec: config.joinTimeoutSec,
      roomRateLimitPerMin: config.roomRateLimitPerMin,
      maxMessageBytes: config.maxMessageBytes,
      serverTime: new Date().toISOString(),
    });

    socket.on('data', (chunk) => {
      if (connection.closed) return;
      connection.buffer = Buffer.concat([connection.buffer, chunk]);

      const decoded = decodeFrames(connection.buffer, config.maxMessageBytes);
      connection.buffer = decoded.remaining;

      if (decoded.errorCode) {
        sendJson(connection, {
          type: MESSAGE_TYPES.ERROR,
          error: decoded.errorReason,
        });
        closeConnection(connection, decoded.errorCode, decoded.errorReason);
        return;
      }

      for (const frame of decoded.frames) {
        if (frame.opcode === 0x8) {
          closeConnection(connection, 1000, 'Client closed');
          return;
        }

        if (frame.opcode === 0x9) {
          if (!socket.destroyed && !socket.writableEnded) {
            socket.write(encodePongFrame(frame.payload));
          }
          continue;
        }

        if (frame.opcode === 0xA) {
          continue;
        }

        if (frame.opcode !== 0x1) {
          sendJson(connection, {
            type: MESSAGE_TYPES.ERROR,
            error: 'Only text frames are supported',
          });
          closeConnection(connection, 1003, 'Only text frames are supported');
          return;
        }

        try {
          const message = JSON.parse(frame.payload.toString('utf8'));
          handleMessage(connection, message);
        } catch {
          sendJson(connection, {
            type: MESSAGE_TYPES.ERROR,
            error: 'Invalid JSON message',
          });
        }
      }
    });

    socket.on('close', () => {
      closeConnection(connection, 1000, 'Socket closed');
    });

    socket.on('error', (error) => {
      logger.error?.('Coediting transport socket error:', error);
      closeConnection(connection, 1011, 'Socket error');
    });
  }

  const sweepInterval = setInterval(() => {
    const expiredSessions = registry.getExpiredSessions(Date.now(), idleTimeoutMs);
    for (const session of expiredSessions) {
      closeConnection(session.connection, 1008, 'Heartbeat timeout');
    }
  }, Math.max(heartbeatIntervalMs, 5000));
  sweepInterval.unref?.();

  server.on('upgrade', (req, socket, head) => {
    handleUpgrade(req, socket, head).catch((error) => {
      logger.error?.('Coediting transport upgrade error:', error);
      writeHttpError(socket, 500, 'Internal Server Error', { error: 'Failed to initialize realtime transport' });
    });
  });

  server.on('close', () => {
    clearInterval(sweepInterval);
    if (activeTransportController?.server === server) {
      activeTransportController = null;
    }
  });

  const controller = {
    server,
    config,
    registry,
    broadcastRoomEvent,
  };
  activeTransportController = controller;
  return controller;
}

function broadcastRoomEventAsync(mapId, payload) {
  if (!activeTransportController) return Promise.resolve(0);
  return Promise.resolve(activeTransportController.broadcastRoomEvent(mapId, payload));
}

module.exports = {
  MESSAGE_TYPES,
  createTransportConfigFromEnv,
  createCoeditingRoomRegistry,
  attachCoeditingTransport,
  broadcastRoomEventAsync,
};
