# Alpha Manual Runbook

Use this after the automated checks pass.

Local targets:

- frontend: `http://localhost:3001`
- backend: `http://localhost:4002`

Test accounts:

- owner: `vellic-owner@example.com`
- editor: `vellic-editor@example.com`
- viewer: `vellic-viewer@example.com`
- commenter: `vellic-commenter@example.com`
- password for all: `Admin123!`

Recommended setup:

- use four Chrome profiles: `Owner`, `Editor`, `Viewer`, `Commenter`
- hard refresh each profile with `Cmd + Shift + R` before starting

## 1. App routing and standalone project creation

1. Open `http://localhost:3001/`
2. Confirm the landing site appears.
3. Open `http://localhost:3001/app`
4. Confirm the app appears instead of the landing site.
5. Log in as `Owner`.
6. From the blank app state, click `Create Project`.
7. Create a project named `Alpha Test`.
8. Confirm the project appears without first opening or saving a map.

Expected:

- landing site and app are separated
- project creation works from the no-map state

## 2. Scan, save, reopen

1. In the `Owner` profile, scan a URL.
2. Save the map into `Alpha Test`.
3. Confirm the URL changes to `/app/maps/:mapId`.
4. Refresh the page.
5. Confirm the same map reopens.

Expected:

- save succeeds
- direct map route persists through refresh

## 3. Thumbnails and full screenshots

1. In the saved map, select one node with a URL.
2. Open `Images`.
3. Run `Get thumbnails (Selected)`.
4. Confirm only the selected node gets a thumbnail.
5. Run `Get full screenshots (Selected)`.
6. Confirm:
   - the selected node gets a full screenshot asset
   - if it did not already have a thumbnail, it gets one too
7. Refresh the map.
8. Confirm the selected node still has its image assets.
9. Open `Images` again.
10. Test:
    - `Download thumbnails (Selected)`
    - `Download full screenshots (Selected)`

Optional broader check:

- run the same flow with `All`

Expected:

- screenshot assets persist after refresh
- downloads only use saved backend assets
- selected operations do not unexpectedly fill the rest of the canvas

## 4. Comments

1. Open the same saved map in `Owner`, `Editor`, `Viewer`, and `Commenter`.
2. On a node, add a comment as `Commenter`.
3. Confirm `Owner` and `Editor` can read it.
4. Confirm `Viewer` can read it but cannot create or edit it.
5. Resolve the comment as `Commenter` or `Owner`.
6. Refresh all profiles.

Expected:

- comment badge appears on the node
- comment scroll works
- comment state persists after refresh

## 5. Collaboration and invites

1. In `Owner`, open `Share`.
2. Confirm memberships and settings load.
3. Send an invite if needed.
4. In another account, open the account menu and confirm `Invites` appears.
5. Accept the invite from the in-app inbox.
6. Confirm the map appears under `Shared With Me`.
7. If the map is `Private`, test access request flow from a no-access account.
8. In `Owner`, open the account menu and then `Requests`.
9. Approve or deny the request.

Expected:

- invite inbox works
- access request inbox works
- shared map visibility updates correctly

## 6. Live editing

1. Open the same saved map in `Owner` and `Editor`.
2. Confirm both reach connected live state.
3. Edit a node title in `Owner`.
4. Confirm the change appears in `Editor`.
5. Edit a node title in `Editor`.
6. Confirm the change appears in `Owner`.
7. Open the same map in `Viewer` and `Commenter`.
8. Confirm they receive the updates without being able to edit structure.
9. With both `Owner` and `Editor` connected, confirm `Undo` / `Redo` explains that it is unavailable during active multi-writer live editing.
10. Close the extra editor window, make a fresh edit in a solo owner window, and confirm `Undo` works again.

Expected:

- owner/editor live editing works in both directions
- viewer/commenter receive read-only live updates
- undo/redo is only blocked while another edit-capable user is actively connected

## 7. Timeline and versions

1. In `Owner` or `Editor`, save a named version.
2. Open `Map Timeline`.
3. Confirm the version appears under `Versions`.
4. Confirm activity appears under `Activity`.
5. Click a version entry and confirm it restores that version.
6. Click an activity entry and confirm it navigates or restores where supported.
7. After some normal edits/autosaves, confirm `Autosaved` entries begin to appear.

Expected:

- timeline is useful for saved versions and activity
- autosaved checkpoints exist over time

## 8. Record blockers

Treat it as an alpha blocker if any of these fail:

- map cannot be reopened reliably
- screenshot assets do not persist
- comments do not persist
- collaboration permissions are wrong
- invite or access request flow breaks
- refresh breaks the working route/session

Do not treat these as immediate blockers unless they break core flows:

- stronger parallax capture handling
- true multi-user undo/redo parity with tools like Figma/Miro/Google
