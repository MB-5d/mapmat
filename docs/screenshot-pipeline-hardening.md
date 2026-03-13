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

## Frontend rollout flag

- `REACT_APP_SCREENSHOT_JOB_PIPELINE_ENABLED=false` (default)

When enabled, full-size screenshot viewing uses `screenshot-jobs` polling in the UI.  
When disabled, UI retains the legacy direct `/screenshot?type=full` call.

