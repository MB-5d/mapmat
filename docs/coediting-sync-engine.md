# Co-Editing Sync Engine (Phase 10C)

Phase 10C adds a server-authoritative live document engine on top of the Phase 10A contract and Phase 10B transport.

This phase remains additive and feature-flagged. Existing map save/load/version endpoints still work because committed live edits also update the existing `maps` row.

## Backend flag (default off)

- `COEDITING_SYNC_ENGINE_ENABLED=false`

When disabled:

- `POST /api/maps/:id/ops/ingest` keeps the Phase 10A validation-only behavior.
- Live document and replay endpoints return `404 Not found`.

## Live document endpoints

- `GET /api/maps/:id/live-document`
  - Returns the current live snapshot and version.
- `GET /api/maps/:id/ops/replay?afterVersion=12`
  - Returns committed ops after the supplied version for reconnect/recovery.
- `POST /api/maps/:id/ops/ingest`
  - Validates the canonical envelope.
  - Applies the op if `baseVersion` matches the current live document version.
  - Persists the op log + updated snapshot.
  - Updates the compatibility `maps` row in the same transaction.

All Phase 10C endpoints require the actor to be allowed to perform `map.update`.

## Persistence model

New tables:

- `map_live_snapshots`
- `map_live_ops`

The live snapshot stores:

- current `version`
- map metadata (`name`, `notes`)
- document JSON (`root`, `orphans`, `connections`)
- color state (`colors`, `connectionColors`)
- `lastOpId`
- `lastActorId`

The op log stores:

- canonical op identity (`opId`, `mapId`, `sessionId`, `actorId`)
- `baseVersion`
- committed `version`
- `type`
- `payload`
- original op `timestamp`
- `committedAt`

## Supported Phase 10C apply behavior

Applied operation types:

- `node.add`
- `node.update`
- `node.delete`
- `link.add`
- `link.update`
- `link.delete`
- `metadata.update`

Current limitation:

- `node.update` supports shallow property edits only.
- Structural moves/reparents are not applied yet through `node.update`.
- Unsupported structural changes return a `400` validation/apply error instead of silently mutating the document.

## Versioning and recovery

- The server is authoritative.
- Each committed op increments the live document version by `1`.
- `baseVersion` mismatches return `409` with the current version.
- Reconnect flows can recover with:
  1. `GET /api/maps/:id/live-document`
  2. `GET /api/maps/:id/ops/replay?afterVersion=<knownVersion>`

## Transport broadcasts

When Phase 10B transport is active for the same map room, committed ops are broadcast as:

```json
{
  "type": "operation.committed",
  "mapId": "<map-id>",
  "operation": {
    "opId": "op-123456",
    "version": 13
  },
  "liveDocument": {
    "version": 13,
    "lastOpId": "op-123456"
  }
}
```

## Safety behavior

- Duplicate `opId` submissions are treated idempotently.
- Live snapshot drift versus an externally updated saved map returns `409`.
- Root node deletion is rejected.
- Link endpoints must reference existing nodes.

## Validation

Repo checks used for this phase now include:

- `node scripts/check-coediting-sync-engine.js`
- `node scripts/check-coediting-simulation.js`
- `node scripts/check-coediting-load.js`
- `node scripts/check-coediting-recovery.js`
- `node scripts/check-coediting-soak.js`

The simulation harness covers stale-client replay, rebase after version conflict, and out-of-order recovery via replay.

The load/soak harnesses cover deterministic persisted op ingest/replay pressure across multiple clients in a single room session model.

The recovery harness covers reconnect replay, replay-to-live-document fallback when the missed-op window exceeds the replay page, and restart-like module reload recovery against the persisted snapshot/op log.
