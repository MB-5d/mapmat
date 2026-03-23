# Alpha Readiness Checklist

This is the next gate after the recent collaboration and screenshot stabilization work.

The goal is not broad public testing yet. The goal is a controlled alpha with guided tasks and a short blocker list.

Manual browser execution guide:

- See [alpha-manual-runbook.md](./alpha-manual-runbook.md)

## Current target

Use this checklist before inviting outside testers into the app.

Scope:

- core map creation / save / reopen
- screenshots and thumbnails
- collaboration and access flows
- comments
- live editing
- direct app routes / refresh safety

## Automated gate

Run these first:

- `npm run check:frontend-build`
- `npm run check:backend`
- `API_BASE=http://localhost:4002 node scripts/check-local-collaboration.js`

Expected outcome:

- all commands pass
- only existing non-blocking frontend lint warnings remain

## Manual gate

### 1. Map creation and routing

- Open `http://localhost:3001/app`
- Create a project from the blank app state without first opening a map
- Scan a URL and create a new map
- Save the map into a project
- Confirm the saved map route is `/app/maps/:mapId`
- Refresh the browser and confirm the same map reopens

### 2. Thumbnail and screenshot flows

- Capture thumbnails for all pages
- Capture thumbnails for selected pages
- Capture full screenshots for selected pages
- Capture full screenshots for all pages
- Confirm full screenshot capture also fills missing node thumbnails for the same node
- Refresh the map and confirm screenshot assets persist
- Download:
  - thumbnails `Selected`
  - thumbnails `All`
  - full screenshots `Selected`
  - full screenshots `All`

### 3. Collaboration access

- Owner can invite editor, commenter, and viewer
- Invite inbox can accept and decline pending invites
- Shared map appears in `Shared With Me`
- Private/open viewer invite policy behaves correctly
- Access requests appear to owners and can be approved/denied

### 4. Live editing

- Owner and editor both reach connected live state
- Owner/editor changes sync both directions
- Viewer/commenter receive read-only live updates
- Presence count stays correct as users join/leave

### 5. Comments

- Owner/editor/commenter can add comments on saved shared maps
- Viewer can read comments only
- Comment badges appear on nodes with comments
- Comment scrolling works
- Comment state persists after refresh

### 6. Timeline and versions

- Owner/editor can save a named version
- Viewer/commenter can open the timeline read-only
- Activity tab shows recent events
- Version entries are clickable
- Activity entries navigate or restore where supported
- Autosaved checkpoints appear after real edits over time

## Known deferred items

These should not block the current alpha unless they break core flows:

- Parallax-heavy pages may still need more screenshot stabilization
- Undo / redo behavior in live editing needs a product decision
- Legend color editing needs a follow-up UI/logic pass
- Layers menu completeness needs a follow-up UI/logic pass
- Steady-state live presence should move from a canvas banner to a map-title avatar stack
- Remove / rescan image asset controls are intentionally deferred until after testing

## Alpha blocker rule

Treat the issue as an alpha blocker if it causes any of the following:

- data loss
- saved map cannot be reopened reliably
- collaboration permissions are wrong
- comments or screenshots do not persist
- invite / access request flow breaks
- route refresh breaks the working session

## After this checklist

If the checklist passes with no alpha blockers:

1. Do a short internal guided testing round.
2. Fix only real blockers, not polish-by-default.
3. Then open controlled user testing.
