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
  - Returns current map memberships and pending invites.
- `POST /api/maps/:id/invites`
  - Body: `{ "email": "user@example.com", "role": "viewer|commenter|editor", "expires_in_days": 7 }`
  - Returns invite payload (including token for manual testing).
- `POST /api/collaboration/invites/:token/accept`
  - Accepts invite for the currently logged-in user if invite email matches account email.
- `DELETE /api/maps/:id/invites/:inviteId`
  - Revokes a pending invite.
- `PATCH /api/maps/:id/members/:userId`
  - Body: `{ "role": "viewer|commenter|editor" }`
  - Creates/updates membership role.
- `DELETE /api/maps/:id/members/:userId`
  - Removes membership access.

## Schema

Tables are created lazily when collaboration endpoints are used:

- `map_memberships`
- `map_invites`

This avoids runtime impact until collaboration is enabled and exercised.
