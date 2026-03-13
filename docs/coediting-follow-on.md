# True Co-Editing Follow-On Plan (CRDT/OT)

This document defines the post-Phase-9 path to true multi-user live editing.

Phase 9 delivered collaboration foundations (permissions, invites, presence, and safe non-silent overwrite behavior). It intentionally does not include real-time operation sync.

## Goal

Provide Figma/Miro/Docs-style concurrent editing where multiple users can edit the same map at the same time with deterministic conflict handling.

## Non-Goals (For This Follow-On Start)

- No rewrite of existing save/export APIs in one release.
- No forced migration of all users to live mode on day one.
- No default-on behavior until operational quality is verified.

## Decision Gate: OT vs CRDT

Choose one protocol before implementation starts:

- OT path: server-authoritative transform pipeline.
- CRDT path: commutative replicated state model with eventual consistency.

Decision criteria:

- Correctness under offline/reconnect behavior.
- Implementation complexity in current Node + React stack.
- Performance/memory at expected map sizes.
- Operational debuggability and tooling maturity.

## Recommended Starting Direction

Evaluate CRDT first (Yjs-class approach) with a strict feature flag and map-scoped room model, because it reduces transform complexity for multi-writer scenarios.

If CRDT memory/runtime overhead is unacceptable in production testing, pivot to OT with the same transport/session envelope.

## Proposed Execution Phases

### Phase 10A - Event Model + Version Contract

- Define map operation envelope (`opId`, `mapId`, `sessionId`, `actorId`, `baseVersion`, `timestamp`).
- Define canonical operation types (node add/update/delete, edge/link updates, metadata updates).
- Add explicit schema validation for all operation payloads.
- Keep existing save endpoint behavior unchanged.

### Phase 10B - Realtime Transport Layer

- Add WebSocket endpoint for map rooms.
- Authenticate each socket with existing auth/session semantics.
- Implement map room join/leave + heartbeat + reconnect handling.
- Add server-side backpressure and per-room rate limits.

### Phase 10C - Sync Engine (CRDT or OT)

- Apply accepted operations to a map document state.
- Broadcast deltas/updates to room participants.
- Persist snapshots + incremental operations for recovery.
- Add deterministic replay test harness.

### Phase 10D - Frontend Live Editing Mode

- Add local operation queue and reconciliation loop.
- Render presence cursors/selections with lightweight batching.
- Add reconnect recovery path with state resync.
- Add explicit connection status UI states: `Connected`, `Reconnecting`, `Out of Sync`.

### Phase 10E - Rollout and Safety Controls

- Tenant/user/map scoped feature gating.
- Read-only fallback if sync health is degraded.
- Structured observability: sync latency, conflict events, reconnect rates, dropped ops.
- Gradual rollout: local dev -> staging internal -> staging canary -> production canary -> broader rollout.

## Feature Flags (Default Off)

- Backend: `COEDITING_EXPERIMENT_ENABLED=false`
- Frontend: `REACT_APP_COEDITING_EXPERIMENT_ENABLED=false`

Do not enable in production by default until canary SLOs are met.

## Data and Migration Strategy

- Keep current persisted map JSON as compatibility baseline.
- Introduce incremental operation log storage alongside snapshots.
- Build one-way import from existing map JSON into live document state.
- Keep export pipeline backward-compatible with current map shape during transition.

## Testing Requirements

- Unit tests for operation validation and merge/replay logic.
- Deterministic multi-client simulation tests (including delayed/reordered events).
- Load tests for high-frequency edits in a single room.
- Chaos tests for disconnect/reconnect and server restarts.

Current repo coverage now includes deterministic multi-client convergence simulation via:

- `node scripts/check-coediting-simulation.js`

Current repo coverage also includes a persisted single-room load harness via:

- `node scripts/check-coediting-load.js`
- `node scripts/check-coediting-recovery.js`
- `node scripts/check-coediting-soak.js`

Current chaos/recovery coverage now includes deterministic persisted reconnect replay, forced live-document fallback, and restart-like sync-engine reload validation.

Broader transport/runtime fault injection remains follow-on work.

## Runtime Verification Additions (When Implemented)

Add new scripts without replacing current runtime verification flow:

- `verify:realtime:staging`
- `verify:realtime:production` (canary-safe checks only)

Existing `verify:runtime:*` commands remain required and unchanged.

## Exit Criteria For Production Rollout

- No silent data loss in staged fault-injection scenarios.
- P95 end-to-end op propagation latency within agreed SLO.
- Reconnect success and state convergence rates above target.
- Support playbook documented for incident response and rollback.
