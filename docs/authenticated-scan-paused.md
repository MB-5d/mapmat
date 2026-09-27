# Authenticated Scan Pause

Authenticated page scanning is intentionally disabled by default while the beta is validated.

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

## Narrow beta status

- One interactive login is used for one scan or rescan. The session is held only in the web process, expires 30 minutes after creation unless a scan has started, and is removed on scan completion or cancellation.
- An authenticated job is claimed by the process holding the login. If that process restarts, the job fails and the user must log in again; sessions are not persisted or transferred to another worker.
- Before a login is accepted, Vellic checks the protected pages found by the pre-check. Pages still requiring login are reported as a partial scan, not a complete scan.
- Target-site cookies and local storage are limited to the scan's site scope. Google and other SSO providers can be used in the interactive browser when they permit it, but provider-specific login flows need staging trials.
- Temporary login and authenticated browser contexts use a credentialed local proxy that resolves and pins public IPv4 destinations, plus request and WebSocket filtering. Service workers are disabled. This mitigates DNS rebinding for proxied browser traffic but is not an operating-system network sandbox.
- Later bulk image-capture jobs do not reuse this temporary login. New page previews are deferred for authenticated scan results in this beta. Existing previews are preserved on rescans, labeled as not updated, and are not refreshed.

Local fixture checks cover first scans, fresh-login rescans, continuing without login, partial results, cancellation, restart failure, and cookie scoping. Expiry has a boundary test, but its full 30-minute lifecycle has not been exercised in staging.

Do not turn on the flags for general users until real-site Google/SSO, long-running scans, expiry, and independent security review have been completed. See [the staging beta test steps](authenticated-scan-staging-beta.md). Authenticated screenshots are deliberately deferred for this beta.
