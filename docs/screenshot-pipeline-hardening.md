# Screenshot Pipeline Hardening (Phase 9F)

Phase 9F revisits full-size screenshot capture and adds safety controls without breaking existing behavior.

## What changed

- Screenshot `type` is now validated as `full` or `thumb`.
- Full captures are bounded by max dimensions; oversized pages are truncated safely.
- Screenshot cache TTL is configurable.
- Stale screenshot files are cleaned up opportunistically with bounded work per pass.
- Browser disconnect is handled so future requests can recreate Playwright cleanly.
- Screenshot job read/cancel/stream endpoints are now scoped to the same caller identity that created the job.

## Backend configuration

- `SCREENSHOT_CAPTURE_TIMEOUT_MS=60000`
- `SCREENSHOT_CACHE_TTL_MS=3600000`
- `SCREENSHOT_FULL_MAX_HEIGHT=16000`
- `SCREENSHOT_FULL_MAX_WIDTH=1920`
- `SCREENSHOT_CLEANUP_INTERVAL_MS=300000`
- `SCREENSHOT_CLEANUP_MAX_FILES=50`

## API behavior notes

- `GET /screenshot` and `POST /screenshot-jobs` reject invalid `type` with `400`.
- Screenshot responses now include:
  - `type`
  - `cached`
  - `blocked`
  - `truncated`

## Frontend behavior

- Full-size screenshot viewing now uses `screenshot-jobs` polling in the UI by default.
- The legacy direct `/screenshot?type=full` frontend path is no longer used for full-size viewing.
- Expanding a node thumbnail keeps showing the current thumbnail asset until an explicit full-page asset has been captured for that node.
- Explicit full-page screenshots are requested from the toolbar image menu and their backend-generated asset URLs are saved onto the node data.
- Thumbnail generation still uses the direct `thumb` endpoint and remains a separate follow-on pipeline concern.

## Next asset lifecycle controls

These should be added after the current screenshot stabilization pass, not mixed into the low-level capture fixes.

### Phase 9G: Download controls in the image menu

- Download thumbnails:
  - `Selected`
  - `All`
- Download full screenshots:
  - `Selected`
  - `All`

### Implementation notes

- Download actions should use the backend-stored asset URLs that are already attached to node data.
- `Selected` and `All` should follow the same scope rules already used by thumbnail/full capture.
- These controls should stay separate for `thumbnail` vs `full` so the user can manage cost and speed explicitly.

### Deferred until after testing

- Remove thumbnails / full screenshots
- Rescan thumbnails / full screenshots
- File reclamation for deleted asset references

### Why this order

- Download is relatively light once asset persistence is stable.
- Remove and rescan still depend on the backend asset model being trustworthy, otherwise the UI can orphan files or reintroduce cache confusion.
