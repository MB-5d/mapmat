# Authenticated Scan Pause

Authenticated page scanning is intentionally disabled for now.

## Why

The temporary Playwright login flow is useful, but it is not stable enough for staging while core scan behavior is still being hardened.

## What is disabled

- The `Authenticated Pages` scan option is hidden by default.
- Frontend auth pre-checks do not run by default.
- Backend scan-auth session creation is disabled by default.

## Preserved code

The implementation remains in place behind flags:

- Frontend: `REACT_APP_AUTHENTICATED_SCAN_ENABLED=true`
- Backend: `SCAN_AUTH_FEATURE_ENABLED=true`

Re-enable both flags together when we are ready to test this feature again.
