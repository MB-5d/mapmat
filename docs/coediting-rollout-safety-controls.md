# Co-Editing Rollout and Safety Controls (Phase 10E)

Phase 10E adds scoped rollout controls, read-only fallback, and coarse health visibility for the Phase 10 co-editing path.

This phase is additive. Existing save/load/version endpoints and `verify:runtime:*` remain unchanged.

## Rollout flags

- `COEDITING_EXPERIMENT_ENABLED=false`
- `COEDITING_SYNC_ENGINE_ENABLED=false`
- `COEDITING_ROLLOUT_ENABLED=false`

Optional scope controls:

- `COEDITING_ROLLOUT_USER_IDS=<comma-separated-user-ids>`
- `COEDITING_ROLLOUT_MAP_IDS=<comma-separated-map-ids>`
- `COEDITING_ROLLOUT_BLOCK_USER_IDS=<comma-separated-user-ids>`
- `COEDITING_ROLLOUT_BLOCK_MAP_IDS=<comma-separated-map-ids>`

The rollout stays fail-closed:

- if the experiment flag is off, co-editing remains unavailable
- if the sync engine flag is off, Phase 10C/10D live mode remains unavailable
- if rollout is off, live co-editing remains unavailable
- block lists override allow lists

## Read-only fallback controls

- `COEDITING_FORCE_READ_ONLY=false`
- `COEDITING_METRICS_WINDOW_SEC=300`
- `COEDITING_DEGRADE_CONFLICTS_PER_WINDOW=0`
- `COEDITING_DEGRADE_RECONNECTS_PER_WINDOW=0`
- `COEDITING_DEGRADE_DROPPED_PER_WINDOW=0`

When any enabled threshold is exceeded inside the rolling window, scoped live co-editing moves to `read_only`.

`read_only` means:

- live document reads and replay stay available
- WebSocket room join can stay available for scoped editors
- operation ingest is blocked with `423` and `code: "COEDITING_READ_ONLY_FALLBACK"`
- frontend editing UI falls back to read-only for the active map

## API and health surfaces

- `GET /api/maps/:id/feature-gates`
  - now includes:
    - `permissions.features.coeditingLive`
    - `permissions.features.coeditingReadOnly`
    - `permissions.coediting.mode`
    - `permissions.coediting.reason`
    - `permissions.coediting.readOnlyFallbackActive`
    - `permissions.coediting.healthStatus`
- `GET /health/coediting`
  - coarse public health summary for rollout verification
- `GET /api/admin/coediting`
  - admin-key protected rollout + observability snapshot

## Transport and ingest behavior

- `GET /api/maps/:id/realtime/socket`
  - now resolves rollout mode before upgrade
  - `welcome` and `joined` include:
    - `roomMode`
    - `roomReason`
    - `readOnlyFallbackActive`
- `POST /api/maps/:id/ops/ingest`
  - preserves Phase 10A validation behavior when the sync engine is disabled
  - blocks writes in read-only fallback with explicit error code

## Structured observability

In-memory metrics currently track:

- commit latency
- version conflicts
- reconnect events
- dropped events
- read-only blocks

These metrics are process-local and reset on restart/deploy. Treat them as a local circuit breaker and operational signal, not as a long-term analytics store.

## Frontend behavior

When `REACT_APP_COEDITING_EXPERIMENT_ENABLED=true`, the frontend now reads backend co-editing mode from `feature-gates` even if Phase 9E permission gating is otherwise off.

If the backend reports `permissions.coediting.mode === "read_only"`:

- map editing controls are disabled for the active map
- autosave and version-save paths are paused for that active map
- the UI shows a read-only safety banner

## Validation

- `npm run check:backend`
- `npm run check:backend:postgres`
- `npm run check:frontend-build`
- `npm run verify:realtime:staging`
- `npm run verify:realtime:production`
