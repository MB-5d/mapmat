# Isolated hosted helper trial

Status: loading-screen and permission-cleanup fixes validated November 9, 2026, including a successful real Stripe 2FA-origin cloud scan. **Full helper staging integration remains outstanding.** The original failed trial is retained below as history; see the final retest results.

Former pilot (offline): https://scanner-pilot-auth-helper-pilot.up.railway.app/app

Project `5c1fef1f-dd9b-47fc-8673-be0e50b335c8`, environment `ece1df20-702c-44ef-bfc9-9ac3057352fc`, service `e4fae64d-88d4-44e5-868b-4b358c3edc5a`. Original deadline: November 10, 2026 at 9:33 AM America/New_York. Deployment was removed with `railway down`; the project was then placed in Railway’s Deleted list on November 9. Railway retains a 48-hour recovery window before permanent deletion. The user approved up to 48 hours, but the configured window is 24 hours.
Keep the local helper installed separately. Do not change the existing MAP-MAT Railway project, staging, production, their secrets, databases, or storage.

## Deployment under review

- Separate Railway project `vellic-auth-helper-pilot`, environment `auth-helper-pilot`, one web service/replica. A new project may incur hosting charges. The user explicitly approved creation, deployment, hosting usage for up to 48 hours, and teardown on November 9, 2026.
- Same HTTPS origin serves Vellic's built frontend and API. The existing Chromium scanner runs inside this separate service with its private-network guard enabled. No Browserbase purchase or weakened network guard.
- Fresh random JWT, image-encryption key and pilot-owner password (32 random bytes, hexadecimal each). Fresh disposable database, encrypted private images and no Stripe, Google, Resend, production or staging credentials.
- Only the seeded pilot owner can use the API. Public account creation, password changes, Google account creation, billing mutations and admin endpoints are unavailable. No test authentication shortcuts. Exact extension origin and one-use pairing required for session import.
- Fixed cloud-only helper build; its review screen names the destination before any transfer. HTTPS target permissions only, no localhost grants, and temporary site access is removed after the attempt. The cloud helper uses a distinct generated public key to pin its Chrome ID before deployment; no private signing key is saved. Verify that exact ID in Chrome after loading.
- At most 20 scanned pages, depth 3, ten-minute imported session lifetime. The pilot rejects requests and terminates its process at a fixed deadline no more than 48 hours after startup. Restart policy NEVER. This is not a billing cap: remove the temporary service/project after testing.
- SQLite and encrypted local files are intentionally disposable and single-instance. Restarts may lose session state; redeployment loses data. This is not a production storage or multi-instance design.

## Prepare, then deploy only after approval

1. Review and commit this isolated branch. Run `node prototype/browser-helper/prepare-cloud.cjs /private/tmp/vellic-auth-helper-cloud-deploy-<unique>` to create a clean archive containing tracked code only. Env templates are removed; ignored credentials/runtime data are not copied. The main checkout and default deployment config are unchanged.
2. After explicit hosting approval, create/link only the separate project and environment in that prepared directory. Record their exact IDs. Add one service and generate its Railway HTTPS domain before deployment. No plan upgrades or extra managed services are required by this prototype.
3. Set `PILOT_ORIGIN` to that origin for the Docker frontend build. Set all configuration below using private input; never log secret values. The bootstrap overrides storage/runtime settings to use its own disposable files and has no access to deployed Vellic data.
4. Build the helper with `node prototype/browser-helper/build-extension.cjs HTTPS_ORIGIN NEW_EXTENSION_DIRECTORY`. Use the generated ID for `SCAN_AUTH_HELPER_EXTENSION_ID` and exact `FRONTEND_URL`. After validating the deployment, request approval to load this cloud helper and transfer the chosen site's session to that exact destination. The earlier local-session approval does not cover this transfer. Verify the installed ID in Chrome.
5. Deploy the prepared directory to the recorded separate project/environment/service only. Confirm source commit and run one replica. Verify signed-out denial, owner login, private images, target boundaries, cancellation/replay/expiry and restart recovery before using any real account session.
6. User signs in and completes the real site's verification in Chrome. Transfer only after destination-specific approval. Scan only a named dummy/test area. No passwords, codes or raw sessions in logs or evidence.
7. Stop/remove the pilot after evidence collection; remove the cloud helper's grants and uninstall it. Record teardown and any remaining costs/resources.

Required non-secret settings:

```
NODE_ENV=production
SCAN_AUTH_BROWSER_HELPER=true
SCAN_AUTH_HELPER_MODE=hosted
SCAN_AUTH_FEATURE_ENABLED=true
SCAN_AUTH_LOCAL_PROTOTYPE=false
SCAN_AUTH_HELPER_ALLOW_FIXTURE=false
TEST_AUTH_ENABLED=false
ALLOW_PRIVATE_NETWORKS=false
ALLOW_VERCEL_PREVIEWS=false
SCAN_AUTH_HELPER_PUBLIC_ORIGIN=<exact Railway HTTPS origin>
PILOT_ORIGIN=<same origin>
RAILWAY_DOCKERFILE_PATH=prototype/browser-helper/Dockerfile
SCAN_AUTH_HELPER_PROJECT_ID=<new project UUID>
SCAN_AUTH_HELPER_ENVIRONMENT_ID=<new environment UUID>
SCAN_AUTH_HELPER_EXTENSION_ID=<cloud helper Chrome ID>
SCAN_AUTH_HELPER_PILOT_EXPIRES_AT=<fixed UTC timestamp, max 48 hours>
SCAN_AUTH_HELPER_OWNER_EMAIL=<dedicated synthetic pilot account>
FRONTEND_URL=<origin>,chrome-extension://<extension ID>
```

Railway supplies its own project/environment IDs, environment name and public domain; the runtime compares them against the explicit settings. Existing MAP-MAT project ID is denied even if settings otherwise match. The three fresh secrets are `JWT_SECRET`, `PRIVATE_SCAN_CAPTURE_KEY`, and `SCAN_AUTH_HELPER_OWNER_PASSWORD`.

## Validation and remaining gates

Local checks: `check.cjs`, `check-hosted.cjs`, `check-hosted-runtime.cjs`, existing backend checks, authenticated-session checks and hosted-config frontend build. The runtime check exercises the actual entry point with an isolated temporary database, secure cookie login, disabled auto-signup, pairing, cancellation and private-network denial. It simulates deployment metadata locally; it does not prove cloud behavior.

Cloud evidence collected November 9:

- The actual Linux Docker build, HTTPS frontend, normal cookie login, anonymous API denial, no test-auth shortcuts, exact extension origin, pairing replay/cancellation, private-network rejection and public scan passed.
- The first deployment selected the regular backend Dockerfile despite the config path. The explicit `RAILWAY_DOCKERFILE_PATH` service variable corrected this; the second build included the frontend.
- User explicitly approved loading the cloud helper and transferring their GitHub session to this exact pilot. Chrome verified helper ID `glacpmbbgcalclakbdjabpemhlehlmgb`; the installed local helper stayed separate.
- Actual helper transfer of the user's previously Google-signed-in GitHub session passed. Four dummy private repository pages returned 200; four private captures succeeded, zero failed/skipped. Owner image requests returned 200, anonymous requests 401, and public image paths 404. The helper reported temporary site permission removal; the imported scan session returned 404 after completion.
- Read-only inspection inside the cloud container confirmed four encrypted objects, correct owner decryption, wrong-owner rejection and rejection at image expiry using an injected test clock. This is not an elapsed 24-hour expiry test. Session deletion after scan completion is not a timed session-expiry test.
- A saved-map deep link returned 404 in the pilot. The pilot SPA fallback was extended to `/app/...` and is covered by the isolated runtime checks.
- A public scan of quotes.toscrape.com passed with a three-page cap. A one-page example.com scan with a two-page cap failed the existing root-only collapse safeguard because unvisited common-path guesses remained. Keep this edge case visible; do not present it as broad regular-scan validation.
- Evidence files are local: `/private/tmp/vellic-cloud-pilot-evidence.json`, `/private/tmp/vellic-cloud-github-evidence.json`, `/private/tmp/vellic-cloud-storage-evidence.json`, `/private/tmp/vellic-cloud-github-map.png`. Credentials and the source job payload are kept separately in a private directory and must not be committed.

- Scheduled cloud image cleanup passed against actual storage: a synthetic encrypted image expired and was removed after 63 seconds; active encrypted and public images were preserved. This verifies the scheduled cleanup process, not an elapsed 24-hour capture lifetime.
- Actual elapsed ten-minute idle cloud session expiry passed: the imported synthetic session returned 404 and its pairing returned 410 after the deadline. This was an idle session; active-scan expiry remains locally verified only. Evidence: `/private/tmp/vellic-cloud-expiry-evidence.json`.
- Cloud-only incognito support is prepared with Chrome split mode, same-context checks and the selected tab’s cookie store. Policy and packaging checks passed; actual browser enablement and Stripe transfer also passed; end-to-end content verification failed as described below. The local helper still rejects incognito.

- The user completed a genuine Stripe Authenticator challenge in Chrome Incognito on November 9. The signed-in UI and existing Vellic sandbox were verified. Proposed one-page target: `/acct_1TeNpEBTeziwbBQm/test/products/prod_UluFy2Tz2UctfW` (Extra Editor). The user approved incognito helper access and transfer to the exact pilot. The actual split-mode helper connected successfully, the cloud verification endpoint returned ready, and a one-page job completed. However, visual inspection FAILED: the capture contains only Stripe’s loading screen, not the product. Do not count this as end-to-end MFA scanning success. Owner image access was 200, anonymous access 401, cache private/no-store, and the imported session returned 404 after completion. Incognito access was disabled and the cloud helper was uninstalled afterward.

Historical outstanding items after the first trial (the readiness, permission and real-MFA findings are resolved by the successful retest below):
- Blocker: reject empty/loading SPA shells in authenticated access verification and capture. `fetchPageWithBrowserContext` currently tolerates a three-second network-idle timeout, then classifies/captures immediately; capture success does not establish meaningful content. The live Stripe result was marked active with title “Dashboard” while the image was only a loading screen. Investigate page readiness versus blocked/device-bound site behavior before declaring session portability. Add delayed-SPA and permanent-loading regressions, then repeat the approved one-page live test.
- Verify Chrome permission revocation independently: the helper reported removal and its `getAll()` check passed, but Chrome’s extension settings still listed GitHub/Stripe grants. This discrepancy is unresolved; do not claim verified browser-wide revocation. Full cloud-helper uninstall removed the pilot extension and its access.
- A genuine third-party second-factor challenge followed by the same helper transfer and cloud scan. GitHub's settings confirm 2FA is disabled. The user has 2FA on Coinbase, Stripe and GoDaddy. Prefer a Stripe sandbox with dummy data if suitable; existing owner sessions may access live finances even when viewing a sandbox. Do not transfer one without explicit approval of that scope. Do not enroll or alter MFA just to manufacture a passing test.
- Real Chrome interrupted-window permission cleanup for the cloud build, and cloud cancellation/expiry/restart behavior.
- Compatibility reporting for nonportable/device-bound sessions, signed-out SPA shells, cross-origin login storage and pages that cannot be scanned safely.
- A reviewed extension distribution/update plan and hosted storage/session ownership design before staging integration. An unpacked pilot helper is not a published user feature.

## Initial live Stripe evidence and cleanup

- User-entered Authenticator challenge: confirmed by the user; signed-in sandbox UI observed.
- Approved one-page job `d118bd3a-263a-4904-93e3-6c8b51cdc086`: reported complete with one active page and one capture, but visual validation failed. Capture `/private/tmp/vellic-cloud-stripe-capture.png` is Stripe's loading screen. Evidence `/private/tmp/vellic-cloud-stripe-evidence.json` records this as failure, not success.
- Imported session removed after completion (404); owner-only image retrieval 200, anonymous/private and public-path requests 401, private/no-store caching.
- Cloud helper incognito permission disabled, then cloud helper uninstalled. Chrome search showed no matching installed extension. Earlier local helper remains separate.
- Temporary Railway deployment removed and project moved to Deleted; normal 48-hour recovery window retained. Existing MAP-MAT project and staging/production deployments were not changed.
- This trial used the real installed helper and the existing cloud scan API with an explicit one-page cap. It did not validate a complete Stripe scan initiated through the app's login dialog. Earlier GitHub app-flow evidence remains separate.
- Follow-up: add meaningful content readiness/failure handling, resolve permission-revocation evidence, rerun live Stripe, finish cloud active-scan-expiry and interrupted-window checks, then prepare staging integration and extension distribution. Do not ship the isolated pilot configuration as staging architecture.

## Loading/readiness and permission fix retest (November 9)

- Authenticated verification, crawling and capture now wait for stable rendered content, reject empty/loading/busy shells, and check session expiry while waiting. Capture repeats this after viewport/preparation changes and rechecks access. A bounded failure reports `scan_auth_content_not_ready`; it does not create a successful blank capture.
- Cookies and scripting are now optional, requested only during a connection and removed together with temporary hosts. Shared cleanup checks actual permissions, verifies page/cookie access is denied, and treats failures as errors. A separate worker cleans up on window close/startup/alarm and retries with a visible warning badge after failure.
- Chrome remembers prior optional permission approvals even after active permission removal (official permissions API documentation, Step 5). The UI host list alone is not proof of active access. The new negative probes test the capability directly. The subsequent successful retest below supplies live proof.
- Local readiness cases, helper cleanup tests, authenticated scanning regression (including disabled-auth regular scanning), private image checks and the four-page synthetic helper flow passed. Updated live Stripe results are recorded below.
- The same temporary project was restored for the authorized repeat within the original hosting window. Staging and production are excluded. Remove it after the repeat.

## Successful fixed Stripe retest (November 9)

- Server build `331ad88`, deployment `dd22739a-427d-4ac9-944b-edbfc69bbe9f`; helper includes the subsequent cookie-probe correction. One-page job `437f391c-a403-4161-a92c-61e32478a053` completed with one fetched/captured page, zero failed/skipped, correct title “Extra Editor – Vellic sandbox – Stripe [Test]”.
- Visual inspection PASS: `/private/tmp/vellic-cloud-stripe-retest-capture.png` shows the actual Extra Editor page, monthly/yearly prices and sandbox banner. Evidence: `/private/tmp/vellic-cloud-stripe-retest-evidence.json`. This reused the user's same real Authenticator-authenticated Incognito session; no new challenge was claimed.
- Owner image 200, anonymous/public paths 401, private/no-store cache. Scan session removed (404). The separate connection-only cleanup proof session was explicitly deleted and verified 404.
- Actual installed helper UI PASS: “Temporary page and cookie access ended and was verified.” Both active permission state and negative page/cookie access probes were checked. `cookies.getAll()` can return an empty list without host access, so it was the wrong denial probe; `cookies.get()` explicitly checks host access. Chrome's “not available in this context” response after removal is also a successful denial. Unexpected errors and retained permissions still fail closed. Evidence `/private/tmp/vellic-helper-cleanup-verified.png`.
- Five-minute active scan expiry rerun PASS with the readiness changes: scan remained active at expiry, failed without publishing success, made no credentialed requests after expiry and removed the session. `/private/tmp/vellic-readiness-active-expiry.json`. This is a local runtime test, not a cloud active-expiry test.
- Backend suite, authenticated-scan suite (including auth-disabled public scans), private-image checks, readiness regressions, cleanup regressions, synthetic four-page helper scan and deployed public scan/access checks passed.
- These two fixes are validated for staging review. The complete helper remains an isolated pilot: normal hosted deployment configuration, extension installation/update distribution, and hosted lifecycle/ownership rollout still need integration before calling the full feature staging-ready. No staging or production deployment occurred.

- Final retest cleanup verified: Incognito access disabled and the cloud helper uninstalled; temporary deployment stopped and pilot project moved to Railway Deleted with its normal 48-hour recovery window. The pilot health endpoint returned 404. Screenshot `/private/tmp/vellic-pilot-retest-deleted.png`. Main checkout remained clean at staging `719016b`; no staging/production push or deployment was performed.

## App integration and lifecycle validation (November 9)

- Shared helper runtime moved to `utils/scanBrowserHelper`; the app now checks installation/version/destination, provides a protected package download and same-folder update instructions, waits for an imported session, and offers recovery after expiry or lost sessions. The existing site-password option remains available.
- Staging configuration is explicit, limited to internal account IDs, exact staging origins and one web instance with Postgres. Normal deployment defaults remain off. The opt-in Docker package and stable staging public identity are documented in `docs/browser-helper-staging.md`.
- Installed cloud helper 0.3.0 was detected by the actual Chrome app UI. Replacing its files and Chrome Reload kept its ID. This is an unpacked internal test installation/update flow, not Chrome Web Store publication or automatic consumer updates.
- Cloud artifact download passed: authenticated owner only, anonymous 401, exact extension identity/version and matching SHA-256.
- Cloud interrupted upload passed: after an actual aborted request, the pending session was removed and its pairing returned 410. The bridge now closes any context created after a client disconnect and invalidates that pairing. Evidence `/private/tmp/vellic-cloud-aborted-import.json`.
- Actual active cloud cancellation passed with the corrected slow fixture: no successful map, no new credentialed requests after cancellation, imported session 404 and pairing 410. Evidence `/private/tmp/vellic-cloud-cancel-integration.json`.
- Actual elapsed five-minute active cloud expiry passed on deployment `354a3cad-3d74-405f-8a34-88fef0672a68`: the scan was still running at expiry, failed safely, made no credentialed requests after the boundary and removed the session. Sixteen protected requests were observed. Evidence `/private/tmp/vellic-cloud-active-expiry-integration.json`.
- Earlier attempts are not passing evidence: one container lacked the zip utility (corrected); an initial expiry fixture did not parse its slowdown control and completed too early (corrected and regression-tested). The successful elapsed test above used the corrected fixture.
