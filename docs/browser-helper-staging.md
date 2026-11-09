# Browser helper staging integration

Default off in code. Enabled on staging for the approved David B. account on November 9; production remains unchanged. See the rollout record below.

## Deployment contract

Use the normal `server.js` entry point, existing account authentication, Postgres, scan ownership, encrypted private captures and scheduled cleanup. Do not use the pilot account launcher in staging. The helper core is in `utils/scanBrowserHelper`; pilot wrappers reuse it.

Stage only on one web instance that claims its own authenticated scan jobs. Sessions remain in memory and are never persisted in jobs or logs. A restart invalidates them; users reconnect. Multiple instances or a separate authenticated-scan worker require an explicit session-routing design before rollout. `SCAN_AUTH_HELPER_SINGLE_INSTANCE=true` is an operator assertion, not automatic infrastructure discovery: deployment review must verify one replica.

Set these only after reviewing the target environment:
- `SCAN_AUTH_BROWSER_HELPER=true`, `SCAN_AUTH_HELPER_MODE=staging`, `SCAN_AUTH_FEATURE_ENABLED=true`
- Exact existing staging Railway environment ID in `SCAN_AUTH_HELPER_ENVIRONMENT_ID`; known MAP-MAT project and environment name `staging` are checked.
- `SCAN_AUTH_HELPER_PUBLIC_ORIGIN=https://api-staging.vellic.io`, `SCAN_AUTH_HELPER_APP_ORIGIN=https://app-staging.vellic.io`
- `SCAN_AUTH_HELPER_ALLOWED_USER_IDS`: explicit internal tester account IDs; empty is rejected.
- `SCAN_AUTH_HELPER_EXTENSION_ID`: reviewed stable helper ID; `SCAN_AUTH_HELPER_ARTIFACT_DIR`: verified package directory.
- `RUN_MODE=web`, `DB_PROVIDER=postgres`, `SCAN_AUTH_HELPER_SINGLE_INSTANCE=true`; scan jobs must be handled by this process.
- Explicit false: `TEST_AUTH_ENABLED`, `ALLOW_PRIVATE_NETWORKS`, `SCAN_AUTH_LOCAL_PROTOTYPE`, `SCAN_AUTH_HELPER_ALLOW_FIXTURE`, `ALLOW_VERCEL_PREVIEWS`.
- Add the exact extension origin to `FRONTEND_URL` alongside the staging app origin. Preserve other required explicit existing origins.
- Existing private image storage/key and scheduled cleanup remain required; run the private-capture checks.
- Frontend: `REACT_APP_SCAN_AUTH_BROWSER_HELPER=true`, `REACT_APP_AUTHENTICATED_SCAN_ENABLED=true`, `REACT_APP_SCAN_AUTH_HELPER_ORIGIN=https://app-staging.vellic.io`; normal API base stays staging.

Production is rejected by staging mode. Disabling the helper flags restores the prior password/public scan paths.

## Private installation and updates

Use `node scripts/build-scan-helper.cjs NEW_RELEASE_DIR`. The reviewed, non-secret public key is stored in `extensions/scan-helper/staging-key.json`; preserve it for updates. The staging extension ID is `ggfnbddajhcphpacfojplhmcfgkfghok`.

The normal backend Dockerfile accepts build argument `BUILD_SCAN_HELPER=true` to package this release at `/app/helper-release`. Use that path for `SCAN_AUTH_HELPER_ARTIFACT_DIR`. Default builds do not generate or enable the helper. No image build or environment change enables the feature unless the runtime flags and account scope are also set.

A stable public manifest key is mandatory; retain that key for every update. Generate the first public key during release preparation, without saving a private signing key for unpacked testing. Archive the package and SHA-256 release metadata. The backend verifies version, destination, app origin, extension ID and archive integrity at startup; downloads require an authorized account. Never include a browser session or environment file.

The app offers installation instructions, download, and version/destination checks. For updates testers replace files in the same installed folder, reload the extension in Chrome, and recheck in Vellic. Chrome exposes only a status message to the exact app origin; it cannot initiate transfers or read cookies. Private-window access remains an explicit Chrome choice. The helper retains per-site consent and cleanup.

This is a private staging distribution flow. Consumer installation/automatic updates need a separately reviewed Chrome Web Store listing; do not represent an unpacked package as store-published.

## Lifecycle and compatibility

The app waits for the imported session and a fresh helper check confirming temporary cookie/page access is removed before enabling Use this login. Connection loss retries; expired/deleted/restarted sessions offer Start new connection and cancel the previous session. Closing the dialog cancels pairing. Site password remains available separately. Account sessions may authorize more than the selected page; navigation is restricted, credentials are not page-scoped. Device-bound, IndexedDB and cross-origin sessions may be unsupported; never bypass provider protections.

## Validation

Run `npm run check:browser-helper`, `npm run check:scan-auth-session`, private capture checks, frontend tests/build and backend checks. The isolated cloud fixture contains disposable content only and is installed exclusively by the hosted pilot when explicitly enabled. Cloud lifecycle results and teardown are recorded in `prototype/browser-helper/HOSTED.md`; real Stripe evidence remains separate.

Official browser contracts: [external messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) and [exact-origin connection allowlisting](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable).

### Read-only staging check, November 9

The existing staging environment is `da475d9e-af16-4895-a572-db8b75f53573`. Its `mapmat` web service has one replica, `RUN_MODE=web`, scan jobs enabled, Postgres and R2 storage. The helper is not enabled. Before the scoped rollout, change the currently enabled `TEST_AUTH_ENABLED` and `ALLOW_VERCEL_PREVIEWS` to false, explicitly set the remaining required false flags, then add the reviewed artifact/extension settings and tester IDs. These are planned deployment changes only; none were applied during integration testing.


### Readiness decision, November 9

Ready for a limited internal staging rollout; not yet deployed there. The complete app-driven cloud scan produced 20 protected pages and 20 private captures. Real Chrome close-window recovery, same-ID manual updates, active cloud expiry, cancellation and service-restart credential invalidation passed. Detailed evidence and the removed pilot are recorded in `prototype/browser-helper/HOSTED.md`.

During promotion, run the normal staging image build and Postgres runtime checks, confirm one web replica and scoped tester IDs, then smoke-test helper download/detection and one disposable protected scan at the real staging origins. The isolated cloud trial used SQLite and same-origin app/API hosting; it does not replace these staging deployment checks. Automatic Chrome Web Store updates and multi-instance routing remain outside this internal rollout.


### Queued product correction — November 9, user testing

User confirmed the password-protected site scan worked. The password dialog's optional thumbnail capture conflicts with the established scan-first, capture-later workflow. **Defer implementation until the current GitHub and Stripe tests finish**, as requested.

Required follow-up: remove image-capture choices from password/helper login dialogs and keep authenticated scans map-only. Use the existing Images flow for an explicit later capture, requesting a fresh site login when needed rather than retaining credentials past session expiry. Preserve private image ownership, encryption, expiry and cleanup. Validate password and browser-helper scans with zero capture jobs during scanning, then separately validate the requested image operation. Do not treat this note as a completed fix.


### Approved staging rollout — November 9

- User approved deployment for David B. only. Frontend: https://app-staging.vellic.io/app; API: https://api-staging.vellic.io. Backend and screenshot-worker deployment of `f08dc49` succeeded; the frontend deployment is `mapmat-staging-3m664b5y3-mattbraundesign.vercel.app`.
- Backend helper scope contains only user `8f9900d7-a576-4022-9d94-b449e2b9b3fd`. Actual running config rejects other users. The normal Linux Docker build generated the reviewed package; its version, exact destinations, stable identity and hash passed runtime verification. David's signed-in app successfully downloaded it.
- Applied helper flags and exact extension origin. Staging test-auth shortcuts and preview-origin access are disabled. Frontend demo authentication is disabled. Existing realtime settings and all production settings/deployments are unchanged.
- Actual staging Postgres health passed with no fallback or missing tables; realtime health was healthy with consistent instances. The existing realtime-change preflight returned 401 from its admin endpoint; no realtime rollout change was made. The staging readiness checker now accepts the exact validated staging helper origin and required preview restriction, while rejecting other extension origins and invalid helper configurations. Readiness passed with zero errors/warnings using the intended deployed settings; Postgres-mode backend checks and staging-config frontend build passed.
- Browser installation and new staging-destination GitHub/Stripe session transfers require the pending explicit user approvals. Neither real session has been transferred to staging yet. The old temporary cloud-pilot approval does not authorize a new destination.
- Thumbnail behavior remains queued above. For the upcoming real-site tests, leave private thumbnails unchecked and validate mapping without image capture.
