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
- Later bulk image-capture jobs do not reuse this temporary login. The Playwright integration below captures requested private previews during the scan before cleanup. Later refresh requires a fresh authenticated rescan.

Local fixture checks cover first scans, fresh-login rescans, continuing without login, partial results, cancellation, restart failure, and cookie scoping. Expiry has a boundary test, but its full 30-minute lifecycle has not been exercised in staging.

Do not turn on the flags for general users until real-site Google/SSO, long-running scans, expiry, and independent security review have been completed. See [the staging beta test steps](authenticated-scan-staging-beta.md). Authenticated screenshots are deliberately deferred for this beta.

## Browserbase local integration foundation

The isolated Browserbase pilot is not wired into app routes or deployed. It uses the existing Playwright/password-gate helper; no Puppeteer, target-site API, persisted profile, or new package is needed.

- `utils/scanAuthBrowserbase.js` owns a temporary, user-bound, exact-origin session through ordered login, scan, capture, and confirmed cleanup. It rejects concurrent use, wrong-user/site access, out-of-order completion, and expired work. Reconnection reinstalls the supplied network guard. Expiry never extends beyond the provider's ten-minute pilot lifetime.
- Cancellation and failure close the browser and request provider release. Unconfirmed release remains retryable. If the process dies, the provider TTL bounds the orphaned session; a new process cannot recover its in-memory login and must ask the user to sign in again.
- Recordings, browser logs, CAPTCHA solving, and certificate bypass are disabled in the create request. Provider operational metadata retention is separate and is not claimed to be disabled.
- `npm run check:scan-auth-browserbase` runs offline contract and lifecycle tests. `scripts/check-scan-auth-browserbase-pilot.js --protected` is a separate, explicitly approved fixed-site live test; credentials are entered through hidden input and never saved or logged. Captures are private local test files, not shared screenshot assets.

Before any Browserbase application wiring or rollout:

1. Resolve remote-browser network protection. The current DNS-pinning proxy listens locally and is not reachable from Browserbase. Main-frame domain allowlisting and Playwright request interception are not substitutes for that proxy or complete network isolation. The fixed-site pilot does not establish an arbitrary-site security policy.
2. Add owner-authorized private capture storage/delivery. The existing screenshot cache keys by URL and can expose public asset URLs; do not put authenticated content in it.
3. Connect scan and requested image capture into one owner-bound job before cleanup, with cancellation and precise partial/completed results. For later capture batches, request one fresh login rather than retaining the original session.
4. Reuse the standard compact password form with visibility toggle and no sampled URL list. Do not enable the legacy screenshot-and-Type UI. Browser-assisted account/SSO sign-in still needs a separate review and compatibility trial.

No staging or production flag is changed by this work.

## Existing Playwright capture integration

The Browserbase pilot is preserved and inactive. Authenticated `/scan-jobs` requests can now request `authenticatedCaptureType: "thumb"` (or `"full"` for backend validation). The frontend requests thumbnails after the standard single-password flow. The job retains its existing protected, locally proxied Playwright context through capture, then destroys the login in the existing job-finalization path. No target-site password or cookie is added to the job payload or saved map.

Capture uses the existing password queue, safe-URL checks, obstruction handling, screenshot styles, and screenshot credit policy. The beta captures at most 100 eligible pages within the available credit allowance. Locked, failed, out-of-scope, stopped, and over-budget pages are counted explicitly in `authenticatedCaptureSummary`; they are not silently reported as successful images. Cancellation or expired login cannot produce a completed capture step. Login expiry retains the existing web-process policy; it has not been redesigned here.

Private images are loaded with authenticated API requests into temporary frontend blob URLs, which are revoked when the image unmounts. The existing node cards, report images, node editor, and image overlay use this shared adapter without new layouts. Authenticated nodes remain excluded from ordinary logged-out image jobs; a fresh authenticated rescan is currently required to refresh them. The warning no longer claims these nodes have no URLs.

Local checks include protected fixtures with one password unlocking 13 pages and authenticated thumbnail delivery before login deletion, signed-out/public-route rejection, plus frontend API/image tests. The real-site Playwright check on mattbraun.design detected 10 protected pages, produced 16 private thumbnails with zero capture failures, and confirmed owner-only delivery and login deletion. Six ineligible/error entries were accounted for as skipped. Font preparation is bounded; the live harness permits up to 15 minutes instead of terminating a healthy scan after four minutes. Full-page real-site rendering, later standalone capture batches with fresh login, and production retention/sharing remain unfinished. Deployment must be verified separately from these local checks.

### Private capture storage foundation

`utils/privateScanCapture.js` encrypts PNG/JPEG captures with Node's AES-256-GCM before passing ciphertext to the existing local/R2 adapter. A configured 32-byte hex `PRIVATE_SCAN_CAPTURE_KEY` is required and stored privately as a backend service variable, never in Git. Each asset has a random key, per-owner derived encryption key, and authenticated expiry header. Assets are not cached or deduplicated across users or URLs.

The authenticated `/api/private-scan-captures/:filename` read route returns owner-only images with `private, no-store` headers. The public `/screenshots/:filename` route rejects the reserved private prefix before reading storage. Feature-disabled, missing-key, wrong-owner, tampered, and expired states fail closed. The scan and image jobs do not yet write to this store.

The pilot retention ceiling is 24 hours. Expiry blocks reading; physical removal of expired ciphertext, R2 bucket lifecycle rules, key backup/rotation, durable map previews, and access for collaborators/shared maps remain rollout decisions. Do not treat this as production retention or sharing support. Cross-origin frontend delivery and saved-map image hydration still need integration tests.

`npm run check:private-scan-capture` covers encryption/access/expiry plus the real backend HTTP route and local persistence in an isolated disposable fixture. It also verifies ordinary public screenshot delivery remains unchanged. Live R2 persistence has not been tested.

Browserbase's current proxy documentation requires Developer or higher for custom proxies. The free pilot cannot validate the planned remote DNS-pinning gateway. Do not expose the existing loopback proxy publicly or route arbitrary-site authenticated traffic directly as a workaround. A paid pilot decision and an authenticated TLS gateway deployment/security review are required before this remote-browser path goes to staging.
