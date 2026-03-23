# Collaboration UI Follow-Ups

Manual QA notes captured on 2026-03-18 after validating the multi-user collaboration access fix.

## Verified Working

- Owner, editor, viewer, and commenter accounts can all see the shared map.
- Owner and editor can edit the shared map.
- Viewer is blocked from editing.
- Commenter is blocked from structural editing.

## Current Behavior To Treat As Expected

- Owner/editor live editing is the currently supported real-time collaboration path.
- Viewer/commenter accounts currently resolve to read-only coediting mode, so they do not receive the writable live-room experience.
- Refreshing the browser returns the user to the home screen because the active map is not deep-linked to a stable route yet.

## UI And Product Follow-Ups

- Consolidate overlapping collaboration/coediting banners so duplicate status and error surfaces do not stack on top of each other.
- Add a route or durable URL state for an open map so a browser refresh returns to the same map instead of the home screen.
- Tighten hover affordances by role:
  - viewer: no node action hover UI
  - commenter: comments-only hover UI
  - editor/owner: full action hover UI
- Revisit commenter behavior on coediting-enabled maps. Current manual QA shows commenter hover behavior matches viewer behavior, which does not align with the intended role distinction.
- Revisit read-only participant update visibility. If viewer/commenter users should see live updates without edit access, add a non-writable real-time subscription path and corresponding UI treatment.

## Additional Deferred UX Follow-Ups

Captured on 2026-03-23 after screenshot stabilization and broader collaboration/manual QA.

- Undo / redo currently appears unavailable during live editing sessions.
  - This is currently enforced in the product code, not just a UI glitch.
  - Decide later whether live maps get:
    - no undo/redo until live operation history is modeled explicitly, or
    - a session-local staged undo model with clear safety rules.
- Legend colors are not currently changeable from the visible UI, even though the legend suggests editable color controls.
- Layers menu is only surfacing `Primary` in current testing.
  - Revisit layer availability and visibility logic so placement, status, and connection layers appear whenever the underlying scan/map data supports them.
- Replace the in-canvas live editing toast/banner with a quieter presence treatment near the map title.
  - Preferred direction:
    - show participant avatar/initial stack next to the map title
    - if more than two users, collapse into a stack
    - hover shows total participant count
    - click expands a participant list
  - Keep disruptive live status banners only for actual warnings/errors, not steady-state collaboration.

## Clarification For Future QA

- If owner/editor tabs fail to reflect each other's edits without a page refresh, that is still a bug.
- If viewer/commenter tabs require refresh to see changes, that is the current product limitation unless/until read-only real-time subscriptions are added.
