# Authenticated scanning: security and staging review

Review started November 10, 2026. Scope: password/helper session ownership and lifecycle, network controls, image boundaries, account access, customer-flow regressions, and actual staging failure tests. Production is not an authorized deployment target. This is a code and integration review, not an independent penetration-test certification.

## Confirmed findings and fixes

1. **Private content could enter the public screenshot cache.** The legacy `/screenshot?authSessionId=...` route passed a ready login into the URL-keyed public screenshot pipeline. It lacked the dedicated private image ownership/encryption path. The route now rejects authenticated capture, and the shared public capture function refuses login state. This establishes a vulnerable code path; no claim is made that real customer content was exposed.
2. **UI-only map-only policy.** Older callers could still request authenticated scan-time images. `/scan-jobs` now rejects that request before creating work. Protected capture-later remains deferred; ordinary public capture-later remains available.
3. **Incomplete session lifecycle on alternate routes.** Legacy `/scan` and `/scan-stream` could reuse authenticated state outside the job API's one-scan ownership and completion cleanup. They now reject authenticated requests and direct callers to scan jobs. Public scanning remains supported.
4. **Untrusted state in precheck.** `/scan-auth/precheck` spread client options directly into the crawler, including raw browser state. It now uses the existing sanitized option boundary. Internal capture flags are stripped as well.
5. **Account checks happened too late.** Inactive accounts could open login browsers and run prechecks even when scan creation was denied. Both now use the shared scan entitlement rule before doing that work. Unapproved helper accounts receive 403 before a session is created.
6. **Async lifecycle races.** Two requests could pass the same ready-session check before job persistence completed. A synchronous reservation now allows only one claim. Browser contexts created after session cancellation/expiry are closed before use; job creation rechecks cancellation/expiry after persistence.

Regression coverage uses the real HTTP server with disposable local accounts and pages. Delayed persistence/browser creation tests exercise the actual route/context functions to reproduce the timing windows. Private-store ownership/encryption/cleanup tests remain separate from the deferred capture UI.

## Validation before staging deployment

- Authenticated session suite passed, including wrong password, mixed gates, client-state injection, inactive-account denial, map-only requests, cancellation, restart, zero image credits, missing private storage, and ordinary scans with authentication disabled.
- Session race tests passed: one login cannot be claimed twice; canceled browser startup closes its context.
- Helper configuration, account scope, package integrity, permissions/negative probes, cancellation, replay, interrupted import, and fixture checks passed.
- Full backend Postgres-mode boundary suite passed. Individual fixture checks explicitly use disposable SQLite; this does not substitute for deployed Postgres testing.
- Frontend customer-flow checks passed with authenticated scanning on and off, including missing/outdated/wrong-destination helper, cleanup gating, expired connection recovery, guests, inactive subscriptions and password fallback. The test suite now explicitly sets helper mode per scenario instead of inheriting a conflicting environment flag.
- Frontend build passed with the existing bundle-size warning.

## Staging test plan and results

Pending live results. The separately approved `auth-failure-fixture` service contains generated pages only, has an automatic four-hour application deadline, and will be removed after testing. The scanner keeps private-network access disabled. Staging QA accounts use normal password login; no signing material or generated account impersonation tokens are used.

Tests: cross-account and guest denial; inactive account denial; helper account restrictions; old capture/scan route rejection; simultaneous claims; active cancellation; a scan crossing the normal session deadline; a web-service restart with a running scan and persistent Postgres job; fresh login after restart; save/reopen protected map; public one-page and normal multi-page regressions.

## Still required before general production release

- **Browser isolation review/design:** Chromium currently runs with `--no-sandbox` in the same container as the app, which holds database and service credentials. DNS-pinned proxy checks and request/WebSocket filters reduce network exposure but are not OS isolation. Do not call this an independently security-approved production architecture. A dedicated restricted browser runtime, or an independently reviewed equivalent boundary, remains a release gate.
- Production helper configuration/package, customer installation/update distribution, and a reviewed production rollout/rollback plan remain unfinished; the current mode intentionally rejects production.
- Imported logins are process-local. One web instance is required; multiple replicas or a separate authenticated worker need explicit routing/isolation work.
- Protected-page image capture, durable private previews, and private-image sharing remain deferred. A map-only launch must state that limitation.
- Real Google/GitHub and Stripe Authenticator results apply to those tested cases. Email verification used a controlled fixture. Device-bound, IndexedDB, and cross-origin sessions are not universally supported.
