# Co-Editing Event Contract (Phase 10A)

Phase 10A introduces a canonical operation envelope and a feature-flagged ingest endpoint.

This is additive only. Existing map save/load/version APIs are unchanged.

## Backend flag (default off)

- `COEDITING_EXPERIMENT_ENABLED=false`

When disabled, the ingest endpoint returns `404 Not found`.

## Ingest endpoint

- `POST /api/maps/:id/ops/ingest`
- Auth required.
- Actor must resolve to a role that can perform `map.update` (owner/editor).

## Canonical envelope

```json
{
  "opId": "op-123456",
  "mapId": "11111111-1111-4111-8111-111111111111",
  "sessionId": "session-abc123",
  "actorId": "22222222-2222-4222-8222-222222222222",
  "baseVersion": 12,
  "timestamp": "2026-03-13T18:15:00.000Z",
  "type": "node.add",
  "payload": {}
}
```

Envelope fields are strictly validated and normalized:

- Required fields: `opId,mapId,sessionId,actorId,baseVersion,timestamp,type,payload`
- No unknown envelope keys allowed.
- `mapId` must match `:id` route param.
- `actorId` must match authenticated user id.
- `timestamp` is normalized to UTC ISO string.

## Canonical operation types

Node operations:

- `node.add`
- `node.update`
- `node.delete`

Link operations:

- `link.add`
- `link.update`
- `link.delete`

Metadata operations:

- `metadata.update`

Payload is type-specific and strictly validated (including unknown key rejection).

## Response behavior

Accepted operation:

- `202 Accepted`
- Returns normalized `operation` and `serverReceivedAt`.

Invalid envelope/payload:

- `400 Bad Request`
- `code: "COEDITING_CONTRACT_INVALID"`
- `details: [{ field, message }]`

## Safety

- No operation persistence yet in Phase 10A.
- No changes to `POST /api/maps`, `PUT /api/maps/:id`, `GET /api/maps/:id`, or version routes.
