# Browser helper staging integration

Default off. No staging or production deployment is included in this change.

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

Use `node prototype/browser-helper/build-extension.cjs https://api-staging.vellic.io NEW_RELEASE_DIR PREVIOUS_REVIEWED_MANIFEST.json https://app-staging.vellic.io`.

A stable public manifest key is mandatory; retain that key for every update. Generate the first public key during release preparation, without saving a private signing key for unpacked testing. Archive the package and SHA-256 release metadata. The backend verifies version, destination, app origin, extension ID and archive integrity at startup; downloads require an authorized account. Never include a browser session or environment file.

The app offers installation instructions, download, and version/destination checks. For updates testers replace files in the same installed folder, reload the extension in Chrome, and recheck in Vellic. Chrome exposes only a status message to the exact app origin; it cannot initiate transfers or read cookies. Private-window access remains an explicit Chrome choice. The helper retains per-site consent and cleanup.

This is a private staging distribution flow. Consumer installation/automatic updates need a separately reviewed Chrome Web Store listing; do not represent an unpacked package as store-published.

## Lifecycle and compatibility

The app waits for the imported session before enabling Use this login. Connection loss retries; expired/deleted/restarted sessions offer Start new connection and cancel the previous session. Closing the dialog cancels pairing. Site password remains available separately. Account sessions may authorize more than the selected page; navigation is restricted, credentials are not page-scoped. Device-bound, IndexedDB and cross-origin sessions may be unsupported; never bypass provider protections.

## Validation

Run `npm run check:browser-helper`, `npm run check:scan-auth-session`, private capture checks, frontend tests/build and backend checks. The isolated cloud fixture contains disposable content only and is installed exclusively by the hosted pilot when explicitly enabled. Cloud lifecycle results and teardown are recorded in `prototype/browser-helper/HOSTED.md`; real Stripe evidence remains separate.
