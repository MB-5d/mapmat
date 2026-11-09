# Isolated hosted helper trial

Status: isolated cloud pilot deployed November 9, 2026; **not ready for staging**.

Pilot: https://scanner-pilot-auth-helper-pilot.up.railway.app/app

Project `5c1fef1f-dd9b-47fc-8673-be0e50b335c8`, environment `ece1df20-702c-44ef-bfc9-9ac3057352fc`, service `e4fae64d-88d4-44e5-868b-4b358c3edc5a`. Current deadline: November 10, 2026 at 9:33 AM America/New_York. This stops the process; remove the project after the trial. The user approved up to 48 hours, but the configured window is 24 hours.
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

Still required:
- A genuine third-party second-factor challenge followed by the same helper transfer and cloud scan. GitHub's settings confirm 2FA is disabled. The user has 2FA on Coinbase, Stripe and GoDaddy. Prefer a Stripe sandbox with dummy data if suitable; existing owner sessions may access live finances even when viewing a sandbox. Do not transfer one without explicit approval of that scope. Do not enroll or alter MFA just to manufacture a passing test.
- Real Chrome interrupted-window permission cleanup for the cloud build, and cloud cancellation/expiry/restart behavior.
- Compatibility reporting for nonportable/device-bound sessions, signed-out SPA shells, cross-origin login storage and pages that cannot be scanned safely.
- A reviewed extension distribution/update plan and hosted storage/session ownership design before staging integration. An unpacked pilot helper is not a published user feature.
