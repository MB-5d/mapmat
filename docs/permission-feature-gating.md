# Permission Feature Gating (Phase 9E)

Phase 9E adds API-driven permission mapping so the frontend can gate features by resolved map role.

## Backend

### Policy additions

- Added `map.comment` action + feature mapping in `policies/permissionPolicy.js`.
- Comment permission roles: `owner`, `editor`, `commenter`.

### New endpoint

- `GET /api/maps/:id/feature-gates`
  - Auth required.
  - Resolves actor role for the target map using owner + collaboration membership.
  - Returns:
    - `permissions.role`
    - `permissions.features`:
      - `mapView`
      - `mapComment`
      - `mapEdit`
      - `versionSave`
      - `historyManage`
      - `shareManage`
      - `discoveryRun`
      - `collabPanelView`
      - `collabInviteSend`
      - `presenceView`
      - `coeditingLive`
      - `coeditingReadOnly`
    - `permissions.coediting`:
      - `mode`
      - `reason`
      - `reasons`
      - `readOnlyFallbackActive`
      - `healthStatus`

## Frontend

- New API method: `getMapFeatureGates(mapId)`.
- New UI flag (default off): `REACT_APP_PERMISSION_GATING_ENABLED=false`.
- When enabled, map-level UI gates use backend `permissions.features` with safe fallback to existing `access` URL behavior.
- Phase 10E also reuses this endpoint for co-editing rollout mode when `REACT_APP_COEDITING_EXPERIMENT_ENABLED=true`.

## Safety and fallback

- Default behavior remains unchanged unless `REACT_APP_PERMISSION_GATING_ENABLED=true`.
- If the feature-gates endpoint is unavailable or returns `404`, frontend falls back to legacy access-level gating.
