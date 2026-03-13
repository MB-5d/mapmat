# Co-Editing Frontend Live Mode (Phase 10D)

Phase 10D adds an opt-in frontend live-editing mode on top of the Phase 10A contract, Phase 10B transport, and Phase 10C sync engine.

This phase remains additive and feature-flagged. Existing save/load/version endpoints are still present.

## Frontend flag (default off)

- `REACT_APP_COEDITING_EXPERIMENT_ENABLED=false`

Optional tuning:

- `REACT_APP_COEDITING_SELECTION_BROADCAST_MS=200`

When disabled, the frontend stays on the existing save/load/autosave flow.

## Activation rules

Live mode only activates when all of the following are true:

- the frontend flag is enabled
- the current actor is allowed to edit the map
- the map is already saved (`currentMap.id` exists)
- the user is not viewing a historical version
- the current canvas is not an imported unsaved draft

## Frontend behavior

When live mode is active:

- the client fetches `GET /api/maps/:id/live-document`
- the client joins `GET /api/maps/:id/realtime/socket`
- autosave to `PUT /api/maps/:id` is paused for the active map
- a local pending-op queue is maintained for supported edits
- reconnect attempts resync from replay/full live document before queue flush resumes
- the UI shows explicit connection states:
  - `Connected`
  - `Reconnecting`
  - `Out of Sync`

## Supported live edits

Current Phase 10D live-edit support is intentionally limited to the Phase 10C sync-engine surface:

- `node.add`
- `node.update` (shallow field edits only)
- `node.delete`
- `link.add`
- `link.update`
- `link.delete`
- `metadata.update` for map name and color settings

## Explicitly blocked while live mode is active

These flows are still available outside live mode, but are blocked during live mode so the frontend does not diverge from the current sync engine contract:

- drag-to-reparent / structural node moves
- orphan/subdomain type moves through the edit modal
- comments
- annotation markers
- thumbnail capture/autosave
- standard `Save Map` updates on the already-live saved map
- moving the actively open live map to another project
- undo / redo

## Presence selections

Phase 10D adds lightweight selection presence:

- the client sends throttled `selection.update` messages over the WebSocket room session
- the backend stores `selectedNodeIds` on the joined room session
- `presence.sync` rebroadcasts current participant selection state
- the frontend renders collaborator selection pills around selected nodes

This phase does not attempt full cursor streaming yet. The selection channel is intentionally low-frequency to stay within the existing transport rate limits.

## WebSocket auth fallback

The browser WebSocket API cannot set `Authorization` headers directly.

To preserve the existing auth-header fallback behavior for deployments where cross-site cookies are unreliable, the frontend now sends the stored bearer token through `Sec-WebSocket-Protocol` as:

- `mapmat-auth`
- `<jwt-token>`

The transport echoes `Sec-WebSocket-Protocol: mapmat-auth` when that fallback is used.

Cookie auth still works unchanged.

## Reconnect recovery path

Reconnect uses this order:

1. `GET /api/maps/:id/ops/replay?afterVersion=<knownVersion>`
2. fallback to `GET /api/maps/:id/live-document` if replay is insufficient or a gap is detected
3. reapply any still-pending local drafts in deterministic order
4. resume queue flushing after the room rejoins

If the client cannot safely rebase, the UI moves to `Out of Sync` and requires a manual `Resync` action.

## Validation

Repo checks used for this phase:

- `npm run check:backend`
- `npm run check:backend:postgres`
- `npm run check:frontend-build`

`verify:runtime:*` remains unchanged and was not replaced.
