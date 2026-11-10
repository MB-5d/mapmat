# Authenticated scanning: security and staging review

Review started November 10, 2026. Scope: password/helper session ownership and lifecycle, network controls, image boundaries, account access, customer-flow regressions, and actual staging failure tests. Production is not an authorized deployment target. This is a code and integration review, not an independent penetration-test certification.

## Confirmed findings and fixes

1. **Private content could enter the public screenshot cache.** The legacy `/screenshot?authSessionId=...` route passed a ready login into the URL-keyed public screenshot pipeline. It lacked the dedicated private image ownership/encryption path. The route now rejects authenticated capture, and the shared public capture function refuses login state. This establishes a vulnerable code path; no claim is made that real customer content was exposed.
2. **UI-only map-only policy.** Older callers could still request authenticated scan-time images. `/scan-jobs` now rejects that request before creating work. Protected capture-later remains deferred; ordinary public capture-later remains available.
3. **Incomplete session lifecycle on alternate routes.** Legacy `/scan` and `/scan-stream` could reuse authenticated state outside the job API's one-scan ownership and completion cleanup. They now reject authenticated requests and direct callers to scan jobs. Public scanning remains supported.
4. **Untrusted state in precheck.** `/scan-auth/precheck` spread client options directly into the crawler, including raw browser state. It now uses the existing sanitized option boundary. Internal capture flags are stripped as well.
5. **Account checks happened too late.** Inactive accounts could open login browsers and run prechecks even when scan creation was denied. Both now use the shared scan entitlement rule before doing that work. Unapproved helper accounts receive 403 before a session is created.
6. **Async lifecycle races.** Two requests could pass the same ready-session check before job persistence completed. A synchronous reservation now allows only one claim. Browser contexts created after session cancellation/expiry are closed before use; job creation rechecks cancellation/expiry after persistence.
7. **Regular-scan regressions.** Authenticated content readiness was also applied to public rendered/hash-route pages, rejecting valid short pages. It now runs only for authenticated contexts. Unvisited common-path guesses also caused valid one-page scans to fail and inflated the hidden-page manifest/remaining count. Confirmed discovery now drives those decisions; real discovered-but-unvisited pages still trigger incomplete-scan protection.
8. **Capacity was reported as a server failure.** Two active authenticated scans correctly blocked a third connection, but returned HTTP 500. The response is now HTTP 429 with `scan_auth_capacity`, preserving both active sessions.
9. **Browser loss could leave a login ready.** A real closed Chromium context reproduced a ready session retaining login state after its browser became unusable. The fetch boundary now clears the session and reports `scan_auth_browser_lost`; the crawler propagates that fatal condition instead of collecting ordinary failed-page nodes. Expiry keeps its distinct expired-login response. This regression uses an actual closed Playwright context.
10. **Remaining scan/image wording.** Live Chrome stop testing found two remaining "captured" phrases in the stop confirmation and safety-limit notice. Both now say "scanned".

Regression coverage uses the real HTTP server with disposable local accounts and pages. Delayed persistence/browser creation tests exercise the actual route/context functions to reproduce the timing windows. Private-store ownership/encryption/cleanup tests remain separate from the deferred capture UI.

## Validation before staging deployment

- Authenticated session suite passed, including wrong password, mixed gates, client-state injection, inactive-account denial, map-only requests, cancellation, restart, zero image credits, missing private storage, and ordinary scans with authentication disabled.
- Session race tests passed: one login cannot be claimed twice; canceled browser startup closes its context.
- Helper configuration, account scope, package integrity, permissions/negative probes, cancellation, replay, interrupted import, and fixture checks passed.
- Full backend Postgres-mode boundary suite passed. Individual fixture checks explicitly use disposable SQLite; this does not substitute for deployed Postgres testing.
- Frontend customer-flow checks passed with authenticated scanning on and off, including missing/outdated/wrong-destination helper, cleanup gating, expired connection recovery, guests, inactive subscriptions and password fallback. The test suite now explicitly sets helper mode per scenario instead of inheriting a conflicting environment flag.
- Frontend build passed with the existing bundle-size warning.
- Full crawler-collapse fixtures, focused-scan fixtures, page-order checks, and a four-page helper-to-scanner map-only test passed.
- Backend and frontend dependency audits reported zero known vulnerabilities on November 10, 2026. This is advisory coverage, not proof that the application has no vulnerabilities.

## Staging test plan and results

The separately approved `auth-failure-fixture` service contains generated pages only, had an automatic four-hour application deadline, and was removed after testing on November 10. Railway confirmed it absent from every environment. The scanner keeps private-network access disabled. Staging QA accounts use normal password login; no signing material or generated account impersonation tokens are used.

Verified on the deployed staging API: inactive-account rejection, cross-account/guest denial, incorrect-password retry, helper account restrictions, old image/scan route rejection, simultaneous claims, active cancellation, no protected requests after cancellation, four-page map-only scanning, session deletion after completion, and protected-map save/reopen with owner-only access. Generated maps were deleted afterward.

Chrome customer checks: David B. sees helper version/status and permission-cleanup status; password fallback contains no image options; wrong passwords show an actionable inline error; cancellation returns to the start screen. Authentication-off scanning produced the Example Domain map. Protected Images are marked unavailable; ordinary Images retains the existing save-first capture-later controls. Missing/outdated/wrong-destination helper and expired-connection UI states have automated component coverage, not a new live Chrome test for every state.

The installed staging helper was also exercised live with a generated fixture login: target/destination consent, optional storage left off, selected-origin permission, session import, verified removal of temporary page/cookie access, app connection detection, and Use this login. Stopping that scan produced a partial map and the target received no additional protected requests afterward. The browser remained signed into the generated target; no GitHub or Stripe session was used in this review.

Chrome extension settings confirmed Incognito access off. Unneeded local-file access was switched off. Chrome's settings can retain previously approved site names; the helper's runtime permission cleanup was separately verified by its permission check, rather than inferred from that list.

The final browser-loss change also passed a five-minute local active-expiry run: 16 protected requests, active at expiry, failed without a map, no later credentialed requests, and session removal. The full staging lifetime is tested separately below.

Staging database/auth-domain/runtime checks passed using the normal QA login. The first generic smoke command lacked credentials and was rerun with that normal signed-in session. The low-page-limit Example Domain failure was reproduced before the fix and completed afterward. The final one-page result reported zero remaining pages; it queued behind the long authenticated scan before completing.

The actual 30-minute staging expiry test passed on November 10: 95 protected requests, running at its deadline, failed without a map, old session removed, and no protected requests starting after expiry. This ran on `ba8ed5c`; the later browser-loss change has separate five-minute active-expiry coverage described above.

The actual staging restart test passed on final code `4f91cf1`: the sequential scan was confirmed running before Railway restarted the web deployment; afterward its persisted Postgres job was failed with an interruption/expiry message and no map, its old login was gone, protected requests had stopped, and a fresh login succeeded. Earlier inconclusive attempts are not counted as evidence.

The final-build capacity test also passed: two active scans stayed running while a third connection received HTTP 429 and `scan_auth_capacity`. Both disposable scans were canceled afterward. Ownership/access, concurrent claim, active cancellation, map-only capture boundaries, protected scan completion, save/reopen and generated-map deletion were repeated successfully after restart.

The final frontend deployment is Ready. Its served JavaScript contains "pages scanned so far" and no "pages captured so far"; the stop dialog wording is covered by component tests. The full live helper/Stop flow was checked before this final wording edit. Chrome was being used concurrently during the last refresh, so no additional live stop-dialog screenshot is claimed.

Tests: cross-account and guest denial; inactive account denial; helper account restrictions; old capture/scan route rejection; simultaneous claims; active cancellation; a scan crossing the normal session deadline; a web-service restart with a running scan and persistent Postgres job; fresh login after restart; save/reopen protected map; public one-page and normal multi-page regressions.

## Still required before general production release

- **Browser isolation review/design:** Chromium currently runs with `--no-sandbox` in the same container as the app, which holds database and service credentials. DNS-pinned proxy checks and request/WebSocket filters reduce network exposure but are not OS isolation. Do not call this an independently security-approved production architecture. A dedicated restricted browser runtime, or an independently reviewed equivalent boundary, remains a release gate.
- Production helper configuration/package, customer installation/update distribution, and a reviewed production rollout/rollback plan remain unfinished; the current mode intentionally rejects production.
- Imported logins are process-local. One web instance is required; multiple replicas or a separate authenticated worker need explicit routing/isolation work.
- Protected-page image capture, durable private previews, and private-image sharing remain deferred. A map-only launch must state that limitation.
- Real Google/GitHub and Stripe Authenticator results apply to those tested cases. Email verification used a controlled fixture. Device-bound, IndexedDB, and cross-origin sessions are not universally supported.

## Browser isolation release gate

The current browser process is suitable only for the explicitly limited staging test, not a general production security sign-off. A separate restricted runtime needs no database, Stripe, email-provider or app-signing credentials; short-lived per-scan access; private/metadata network denial enforced outside page JavaScript; and verified destruction on cancellation, expiry, process failure and deployment. Validate resource/concurrency limits and any routing changes before widening access.

Simply changing a browser flag or using another container image does not establish that boundary. Playwright's [crawling guidance](https://playwright.dev/docs/docker#crawling-and-scraping) recommends a separate user and an appropriate seccomp profile for untrusted sites. The hosting platform's actual isolation and network restrictions must be verified before selecting the deployment design. No new browser infrastructure or production deployment was created in this review.

Operational observation: staging has three persisted image-job records marked running from May 8/19, 2026. These predate the current deployment and were not active scans in this test. Their historical status cleanup is separate from authenticated scanning and was not silently changed.

## Final state

Code `4f91cf1` is deployed successfully to staging web and worker; the staging frontend is Ready. The temporary fixture service and its deployments were deleted and absence verified. Production web deployment remains `972bb404-b3a4-427e-8419-abc8dd861178`; no production code, configuration, or credentials were changed. The existing local edits in `docs/browser-helper-staging.md` were preserved. Staging is suitable for the existing limited testing scope; general production release remains gated by browser isolation and helper distribution/rollout work above.
