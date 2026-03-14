# Co-Editing Rollout and Safety Controls (Phase 10E)

Phase 10E adds scoped rollout controls, read-only fallback, and coarse health visibility for the Phase 10 co-editing path.

This phase is additive. Existing save/load/version endpoints and `verify:runtime:*` remain unchanged.

## Rollout flags

- `COEDITING_EXPERIMENT_ENABLED=false`
- `COEDITING_SYNC_ENGINE_ENABLED=false`
- `COEDITING_ROLLOUT_ENABLED=false`
- `COEDITING_ROLLOUT_HARDENING_ENABLED=false`
- `COEDITING_ROLLOUT_ALLOW_GLOBAL=false`
- `COEDITING_ROLLOUT_GLOBAL_APPROVED=false`
- `COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT=false`

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

When `COEDITING_ROLLOUT_HARDENING_ENABLED=true` and rollout is enabled, config is also fail-closed unless:

- at least one rollout scope is configured, or `COEDITING_ROLLOUT_ALLOW_GLOBAL=true`
- `COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED=true`
- `ADMIN_API_KEY` is configured
- `COEDITING_ROLLOUT_ALLOW_GLOBAL=true` is not combined with scoped allow lists
- unscoped/global rollout also sets `COEDITING_ROLLOUT_GLOBAL_APPROVED=true`

If those requirements are not met, runtime rollout resolution returns `disabled` with coarse reason `config_invalid`, and admin canary checks also fail.

When `COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT=true`, the hardened rollout also requires recent shared agreement on the rollout fingerprint across active instances. If different instances advertise different scopes, block lists, or hardening-critical flags inside the observability window, rollout again resolves `disabled` with coarse reason `config_invalid`.

## Read-only fallback controls

- `COEDITING_FORCE_READ_ONLY=false`
- `COEDITING_METRICS_WINDOW_SEC=300`
- `COEDITING_DEGRADE_CONFLICTS_PER_WINDOW=0`
- `COEDITING_DEGRADE_RECONNECTS_PER_WINDOW=0`
- `COEDITING_DEGRADE_DROPPED_PER_WINDOW=0`
- `COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED=false`
- `COEDITING_DISTRIBUTED_OBSERVABILITY_RETENTION_DAYS=30`

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
  - rollout now also reports coarse `instanceAgreementStatus`
- `GET /api/admin/coediting`
  - admin-key protected rollout + observability snapshot
  - includes recent observed instance/fingerprint counts for drift diagnosis

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

When `COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED=false`, in-memory metrics track:

- commit latency
- version conflicts
- reconnect events
- dropped events
- read-only blocks

When `COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED=true`, those same counters are also written into the active runtime database and rollout/health resolution reads the shared aggregate instead of a single-process view.

The same database also stores the most recent rollout fingerprint per active instance so canary/admin checks can detect cross-instance rollout drift without introducing a separate worker.

Implementation notes:

- no extra worker is required
- local in-memory counters remain as the fallback path
- the shared aggregate is bucketed for low write amplification and coarse operational health, not tenant analytics
- bucket retention is pruned opportunistically so long-running canaries do not grow the recent-window table without bound
- public `GET /health/coediting` stays coarse; `GET /api/admin/coediting` remains the richer operational surface

## Frontend behavior

When `REACT_APP_COEDITING_EXPERIMENT_ENABLED=true`, the frontend now reads backend co-editing mode from `feature-gates` even if Phase 9E permission gating is otherwise off.

If the backend reports `permissions.coediting.mode === "read_only"`:

- map editing controls are disabled for the active map
- autosave and version-save paths are paused for that active map
- the UI shows a read-only safety banner

## Validation

- `npm run check:backend`
- `npm run check:backend:postgres`
- `node scripts/check-coediting-observability.js`
- `npm run check:frontend-build`
- `npm run verify:realtime:staging`
- `npm run verify:realtime:production`
- `npm run verify:realtime:staging:canary`
- `npm run verify:realtime:production:canary`
- `npm run verify:realtime:staging:canary:window`
- `npm run verify:realtime:production:canary:window`

`verify:realtime:*:canary` also queries `GET /api/admin/coediting` with `x-admin-key: <ADMIN_API_KEY>` and fails fast on:

- non-healthy public or admin status
- `readOnlyFallbackActive=true`
- `rollout.configValid=false`
- `rollout.instanceAgreementStatus!="consistent"`
- `rollout.allowGlobalRollout=true`
- `rollout.globalRolloutApproved=true`
- non-distributed health source
- rollout, experiment, or sync engine flags unexpectedly off
- unscoped rollout during canary
- recent conflict/reconnect/dropped/read-only-block metrics above the configured gate limits

`verify:realtime:*:canary:window` repeats the same admin/public validation over a configurable observation window and fails on any unhealthy sample, scoped-entity drift, or instance-agreement drift during that window.

The staged operator sequence is documented in `docs/coediting-canary-rollout-playbook.md`.
