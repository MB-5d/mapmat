# Collaboration Backend (Phase 9B)

Phase 9B adds a backend foundation for collaboration entities while keeping current product behavior unchanged by default.

## Feature Flag

Set backend environment variable:

- `COLLABORATION_BACKEND_ENABLED=true`

If unset or `false`, collaboration endpoints return `404 Not found`.

Frontend panel toggle:

- `REACT_APP_COLLABORATION_UI_ENABLED=true`

Optional invite tuning:

- `COLLAB_INVITE_DEFAULT_DAYS` (default `7`)
- `COLLAB_INVITE_MAX_DAYS` (default `30`)

## Endpoints

All endpoints are under backend base URL and require login/auth.

- `GET /api/maps/:id/collaboration`
  - Returns current map memberships, pending invites, collaboration settings, and owner-visible pending access requests.
- `GET /api/maps/:id/activity`
  - Returns recent append-only map activity events for any user with read access.
  - Intended to back the later collaboration history log and live change notifications.
- `GET /api/maps/:id/comments`
  - Returns backend-backed comments grouped by node for any user with map read access.
- `POST /api/maps/:id/comments`
  - Creates a comment or reply for a node.
  - Roles: owner/editor/commenter.
- `PATCH /api/maps/:id/comments/:commentId`
  - Updates comment text and/or completion state.
  - Roles: owner/editor/commenter.
- `DELETE /api/maps/:id/comments/:commentId`
  - Deletes a comment thread.
  - Roles: owner/editor/commenter.
- `POST /api/maps/:id/invites`
  - Body: `{ "email": "user@example.com", "role": "viewer|commenter|editor", "expires_in_days": 7 }`
  - Returns invite payload (including token for manual testing).
- `POST /api/collaboration/invites/:token/accept`
  - Accepts invite for the currently logged-in user if invite email matches account email.
- `DELETE /api/maps/:id/invites/:inviteId`
  - Revokes a pending invite.
- `PATCH /api/maps/:id/members/:userId`
  - Body: `{ "role": "owner|viewer|commenter|editor" }`
  - Creates/updates membership role.
- `DELETE /api/maps/:id/members/:userId`
  - Removes membership access.
- `PATCH /api/maps/:id/collaboration/settings`
  - Body supports:
    - `access_policy`: `private|viewer_invites_open`
    - `non_viewer_invites_require_owner`: boolean
    - `access_requests_enabled`: boolean
    - `presence_identity_mode`: `named|anonymous`
- `GET /api/maps/:id/access-requests`
  - Owner-only list of access requests.
- `POST /api/maps/:id/access-requests`
  - Creates a pending access request for the current authenticated user.
- `PATCH /api/maps/:id/access-requests/:requestId`
  - Owner-only approve/deny action.
  - Body: `{ "status": "approved|denied", "role": "viewer|commenter|editor" }`

## Schema

Tables are created lazily when collaboration endpoints are used:

- `map_memberships`
- `map_invites`
- `map_comments`
- `map_collaboration_settings`
- `map_access_requests`
- `map_activity_events`

This avoids runtime impact until collaboration is enabled and exercised.

## Activity Events

Phase 2A adds an append-only `map_activity_events` table with a narrow first pass of event sources:

- collaboration settings updates
- invite created / accepted / revoked
- membership role changes and removals
- access request created / approved / denied
- comment created / updated / resolved / reopened / deleted
- named version saves
- committed live content operations such as metadata updates and node/link edits

The feed is intentionally separate from scan history and version snapshots.

## Comments

Phase 3A moves saved-map comments to a first-class backend model:

- comments are keyed by `map_id`, `node_id`, and `comment_id`
- replies are stored via `parent_comment_id`
- viewers can read comments
- owners, editors, and commenters can create/update/delete comments
- older comment data embedded in legacy map JSON is imported lazily on first backend comment access
