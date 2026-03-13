# Realtime Collaboration Baseline (Phase 9D)

This phase adds a safe, feature-flagged baseline for map presence awareness.

## Scope

- Presence sessions per map for authenticated users.
- Heartbeat-based liveness with automatic expiry (TTL).
- Lightweight UI indicator for active parallel sessions.

This is not full co-editing (no CRDT/OT, no live operation sync).

## Backend Flag + Config

- `REALTIME_BASELINE_ENABLED=false`
- `REALTIME_PRESENCE_TTL_SEC=90`
- `REALTIME_PRESENCE_HEARTBEAT_SEC=20`

When `REALTIME_BASELINE_ENABLED=false`, realtime routes return `404`.

## API Endpoints

All endpoints are authenticated and mounted under `/api`.

- `GET /maps/:id/presence`
  - Lists active sessions for a map.
- `POST /maps/:id/presence/heartbeat`
  - Upserts caller session and returns active session list.
- `DELETE /maps/:id/presence/:sessionId`
  - Leaves/removes a session.
  - Owners/editors can remove any session; other roles can remove only their own.

Permissions are enforced through `policies/permissionPolicy.js`.

## Frontend Flag + Config

- `REACT_APP_REALTIME_BASELINE_ENABLED=false`
- `REACT_APP_REALTIME_PRESENCE_HEARTBEAT_SEC=20`

When enabled, the frontend sends periodic presence heartbeats for logged-in users on saved maps and renders a compact "active sessions" banner.

