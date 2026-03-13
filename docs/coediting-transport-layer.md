# Co-Editing Realtime Transport (Phase 10B)

Phase 10B adds a feature-flagged WebSocket transport for map-scoped rooms.

This phase does not apply or persist edit operations yet. Existing save/load/version APIs remain unchanged.

## Backend flag (default off)

- `COEDITING_EXPERIMENT_ENABLED=false`

When disabled, the WebSocket upgrade path returns `404 Not found`.

## WebSocket endpoint

- `GET /api/maps/:id/realtime/socket`
- Upgrade header: `Upgrade: websocket`
- Auth required with the same session rules as HTTP routes:
  - `auth_token` cookie, or
  - `Authorization: Bearer <token>` when `AUTH_HEADER_FALLBACK=true`
- Only actors allowed to perform `map.update` can connect (`owner` / `editor`)

## Transport tuning

- `COEDITING_WS_HEARTBEAT_SEC=20`
- `COEDITING_WS_IDLE_TIMEOUT_SEC=90`
- `COEDITING_WS_JOIN_TIMEOUT_SEC=15`
- `COEDITING_WS_ROOM_RATE_LIMIT_PER_MIN=240`
- `COEDITING_WS_MAX_MESSAGE_BYTES=32768`
- `COEDITING_WS_MAX_BACKPRESSURE_BYTES=131072`

## Message flow

Server welcome:

```json
{
  "type": "welcome",
  "mapId": "<map-id>",
  "actorId": "<user-id>",
  "heartbeatIntervalSec": 20,
  "idleTimeoutSec": 90,
  "joinTimeoutSec": 15
}
```

Client join or resume:

```json
{
  "type": "join",
  "sessionId": "session-abc123",
  "clientName": "web",
  "accessMode": "edit"
}
```

Reconnect behavior:

- Reconnect with the same `sessionId`.
- The newer socket replaces the older socket for that actor/session.
- The server sends `session.replaced` to the older socket and marks the new join as `resumed: true`.

Heartbeat:

```json
{
  "type": "heartbeat"
}
```

Leave:

```json
{
  "type": "leave"
}
```

## Server events

- `welcome`
- `joined`
- `heartbeat.ack`
- `presence.sync`
- `operation.committed`
- `left`
- `session.replaced`
- `error`

`presence.sync` includes the current room participant list after join, leave, or resume.

## Safety controls

- Join timeout closes sockets that never join a room session.
- Idle timeout closes sockets that stop heartbeating.
- Per-room message rate limit rejects bursts before sync-engine work is added.
- Socket backpressure closes slow consumers before buffers grow unbounded.
