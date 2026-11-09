# Isolated hosted helper trial

Status: implemented and locally checked; **not deployed, not ready for staging**.
Keep the local helper installed separately. Do not change the existing MAP-MAT Railway project, staging, production, their secrets, databases, or storage.

## Deployment under review

- Separate Railway project `vellic-auth-helper-pilot`, environment `auth-helper-pilot`, one web service/replica. A new project may incur hosting charges. Creation was blocked by automatic approval review pending the user's explicit approval.
- Same HTTPS origin serves Vellic's built frontend and API. The existing Chromium scanner runs inside this separate service with its private-network guard enabled. No Browserbase purchase or weakened network guard.
- Fresh random JWT, image-encryption key and pilot-owner password (32 random bytes, hexadecimal each). Fresh disposable database, encrypted private images and no Stripe, Google, Resend, production or staging credentials.
- Only the seeded pilot owner can use the API. Public account creation, password changes, Google account creation, billing mutations and admin endpoints are unavailable. No test authentication shortcuts. Exact extension origin and one-use pairing required for session import.
- Fixed cloud-only helper build; its review screen names the destination before any transfer. HTTPS target permissions only, no localhost grants, and temporary site access is removed after the attempt. The cloud helper gets a separate Chrome ID; copy that exact ID into the pilot configuration.
- At most 20 scanned pages, depth 3, ten-minute imported session lifetime. The pilot rejects requests and terminates its process at a fixed deadline no more than 48 hours after startup. Restart policy NEVER. This is not a billing cap: remove the temporary service/project after testing.
- SQLite and encrypted local files are intentionally disposable and single-instance. Restarts may lose session state; redeployment loses data. This is not a production storage or multi-instance design.

## Prepare, then deploy only after approval

1. Review and commit this isolated branch. Run `node prototype/browser-helper/prepare-cloud.cjs /private/tmp/vellic-auth-helper-cloud-deploy-<unique>` to create a clean archive containing tracked code only. Env templates are removed; ignored credentials/runtime data are not copied. The main checkout and default deployment config are unchanged.
2. After explicit hosting approval, create/link only the separate project and environment in that prepared directory. Record their exact IDs. Add one service and generate its Railway HTTPS domain before deployment. No plan upgrades or extra managed services are required by this prototype.
3. Set `PILOT_ORIGIN` to that origin for the Docker frontend build. Set all configuration below using private input; never log secret values. The bootstrap overrides storage/runtime settings to use its own disposable files and has no access to deployed Vellic data.
4. Build the helper with `node prototype/browser-helper/build-extension.cjs HTTPS_ORIGIN NEW_EXTENSION_DIRECTORY`. Request approval to load this cloud helper and transfer the chosen site's session to that exact destination. The earlier local-session approval does not cover this transfer. Load, obtain its Chrome ID, set `SCAN_AUTH_HELPER_EXTENSION_ID` and exact `FRONTEND_URL` before deploying.
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

Still required:
- Actual Docker build and remote deployment; Docker is not installed in this local environment.
- Google-session transfer and protected scan from the remote IP, with target-scoped permission and private-image access/expiry checks.
- A genuine third-party second-factor challenge followed by the same helper transfer and cloud scan. GitHub's settings confirm 2FA is disabled. The user has 2FA on Coinbase, Stripe and GoDaddy. Prefer a Stripe sandbox with dummy data if suitable; existing owner sessions may access live finances even when viewing a sandbox. Do not transfer one without explicit approval of that scope. Do not enroll or alter MFA just to manufacture a passing test.
- Real Chrome interrupted-window permission cleanup for the cloud build, and cloud cancellation/expiry/restart behavior.
- Compatibility reporting for nonportable/device-bound sessions, signed-out SPA shells, cross-origin login storage and pages that cannot be scanned safely.
- A reviewed extension distribution/update plan and hosted storage/session ownership design before staging integration. An unpacked pilot helper is not a published user feature.
