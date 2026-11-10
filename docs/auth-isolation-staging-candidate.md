# Auth isolation and capture-later candidate — 2026-11-10

Status: candidate code deployed to staging at `296504f`; browser isolation and
protected capture-later remain disabled pending scoped credentials and integrated
staging tests. Production is unchanged. Do not promote this candidate yet.

## Implemented

- Dedicated authenticated browser VMs; a separate public-browser VM; capacity
  bound; no app secrets in the browser image; no direct network interface in the
  browser namespace; public-address-only proxy; absolute lifetime and cleanup.
- Existing map Images jobs can reuse a login until its original 30-minute deadline.
  Scanning itself captures no images. Expiry requires login, not a rescan. Partial
  images survive an ended connection; a retry targets remaining pages.
- Private images use encrypted map-bound storage, map read permissions, existing
  image download controls, and durable retention while an authorized original or copied map exists.
  Legacy private pilot images retain their previous 24-hour expiry.
- Helper 0.4.0: protocol-aware version checks, verified store-link support,
  Chrome update-check states, temporary-permission safety, and explicit staging
  installation instructions. No store link or published release is invented.

## Evidence

- Backend, authenticated-scanning and ordinary image-capture regression suites passed.
- Current staging TLS, auth configuration/CORS, API and Postgres health passed.
  The authenticated staging smoke suite requires the normal QA account credentials;
  none were available locally. Test-auth bypass remains disabled in staging.
- Frontend build passed; existing bundle-size warning remains.
- Helper integration, hosted/local policy, permissions and fixture suites passed.
- Frontend helper, app contract, node, toolbar and private-image tests passed (99).
- Local real-browser transport and image test passed. This does not establish VM
  network isolation.
- Local real-app fixture passed: password login → scan without images → thumbnail
  and full-image capture → normal JPEG download → remove login → saved image still
  readable → recapture requires a new login, without rescanning.
- Unit security checks passed for encrypted map storage, owner/member access,
  cross-map denial, deleted-map cleanup, atomic claims, concurrent replay,
  expiry-before-save, and a login form appearing after page readiness.
- Three additional approved Railway machines were verified DESTROYED:
  `6331e87d-f6bd-4133-8188-46d82f3218e4`,
  `f3520daf-4c91-4ba6-8e00-7d24fbf34831`,
  `788215bf-8357-4d50-b5c2-d6543b12e5e7`.
- Cloud diagnosis found root-only Node installation and a version-manager shim;
  copy the actual `process.execPath` executable. Kernel owner firewall rules are
  unavailable; network namespaces work and replace that approach.
- New namespace browser loaded example.com and produced a screenshot. The denial
  probe stopped at an assertion that expected only a thrown network error rather
  than also accepting proxy denial HTTP statuses. This is **not** a completed
  denial/bypass/expiry test. Corrected suite:
  `scripts/check-isolated-scan-browser-cloud.cjs --approved-staging-test`.

## Outstanding production gates

1. Cloud deny/bypass/namespace/interruption/expiry and verified VM destruction
   passed on the approved final continuation machine below. Repeat the complete
   application flows in staging after configuring its scoped credentials.
2. Configure a staging-scoped Railway project token, checkpoint and deployment
   capacity. Never deploy the local account token. Verify all services executing
   browser jobs use the boundary, and measure cost/startup latency/concurrency.
3. Deploy and test app flows in real staging, with feature off and on, using
   password and helper logins. Verify slow capture past session expiry, reconnect,
   cancellation/restart, private-image access and user-visible progress.
4. Verify the locally passing copied-map/version image cases in staging/Postgres.
   Ciphertext keeps its original encryption scope; authorized copies now have
   independent access/retention references. Anonymous public-share image delivery
   remains denied and needs a product decision before promising identical sharing.
5. Prepare/approve the Chrome Web Store release and stable store-assigned identity;
   test genuine installation and upgrade from the preceding version in Chrome.
   Manual unpacked reload tests cannot establish automatic store updates.

New server/client capture flags default off. Production isolation configuration
currently fails closed. No new hosting, token or store publication was enabled
by saving these files.

Prepared helper package (not installed): `/private/tmp/vellic-staging-helper-0.4.0/vellic-scan-helper.zip`, stable staging identity `ggfnbddajhcphpacfojplhmcfgkfghok`.
Browser checkpoint from the successful startup/public-image probe: `vellic-browser-e21be52ee0b1c34e`; the preparation script derives its canonical build name from all allowlisted files and package versions.

## Final approved cloud machine

`38ff4624-5d4d-4cde-aa19-5a0a2ac91b2e` was created from the namespace
checkpoint and verified DESTROYED. Public page/image, private/metadata/loopback/
IPv6 denial, direct-egress denial and separate-context cookie tests all passed.
The subsequent interface assertion expected exactly `lo`; Linux also reports
default `tunl0`, `sit0` and `ip6tnl0` device names. Their flags and addresses were not retained in the failed assertion output. This assertion stopped the
suite before hard expiry. The harness now checks that every non-loopback device
is down and unaddressed, consistent with the runtime's network-interface check.
That corrected assertion and cloud hard expiry are still **unverified**. No
additional machine beyond the user's approved limit was created.

Final local HTTP checks also passed for authorized viewer access, outsider denial, role revocation and protected flags on on-demand canvas nodes. Dependency audit: zero known vulnerabilities.

## Continuation: copied images and failure harness

- Private-image references are saved atomically with map creation, updates,
  individual image updates and versions. Knowing an image URL cannot grant access.
- Real local app tests passed for owner/viewer copies surviving source deletion,
  normal image downloads on copies, membership revocation, unknown-role denial,
  rejected private URLs on all four save paths, failed-reference transaction rollback,
  historical-image access after replacing the current page, and access revocation
  after the last referencing map is deleted.
- Backend checks and ordinary image-capture smoke passed. Local real-browser
  interruption/expiry now verify lease destruction; capacity/cleanup tests pass.
- The cloud harness records independent failures and still runs expiry/cleanup.
  Its final lease calls the real provider destroy method. Namespace validation
  now has local regression cases for inactive tunnel devices and unsafe interfaces.
- Further cloud usage is awaiting renewed approval (one machine, 2 CPU / 2 GB,
  maximum 15 minutes). No new machine has been created in this continuation.
- Chrome installation checks are blocked by the locked Mac. The helper remains
  prepared, not installed/published. Neither staging nor production was deployed.

## Approved continuation cloud test and manual helper update

- Machine `62e39497-6934-4975-9019-96c3164898cb` restored checkpoint
  `vellic-browser-e21be52ee0b1c34e` in the staging environment (2 CPU / 2 GB).
  Public page/screenshot, private/metadata/loopback/IPv6 denial, direct-egress
  denial, separate-context cookies and namespace restrictions all passed.
- Client interruption stopped its remote browser process. Hard expiry disconnected
  Playwright and called real provider destruction. Final removal was verified.
  This used the one newly approved machine; no further test VM was created.
- Chrome's existing helper was manually updated from 0.3.0 to 0.4.0 under the same
  identity. Manifest permission sets are unchanged, checksum verified, and
  Incognito access is off. This is manual-upgrade evidence, not a store release.
- The currently deployed staging app still expects exactly 0.3.0, so it rejects
  the newer helper until the prepared compatibility code and artifact are deployed.
- Staging web flags were checked: isolation/capture-later are unset (off), helper
  remains David B. only, test-auth and private networks are false, one web replica.
  No isolation token is configured. The worker's existing test-auth flag is true,
  but worker mode exposes only health; review that setting before broader rollout.
- Postgres-mode backend checks, helper checks, and a frontend build using the
  actual mapmat-staging public build settings passed. The usual bundle-size
  warning remains. These do not substitute for a live Postgres capture test.
- Next code rollout targets staging only with isolation and protected capture
  still disabled. No account-wide Railway token is to be deployed.

## Live staging verification

- Commit `296504f` deployed successfully to staging web and screenshot worker.
  Frontend deployment `dpl_BDwGqtVw6txcpDRCfPMr1VMpp6wW` serves
  `https://app-staging.vellic.io/app`. Postgres runtime health and TLS/auth/CORS
  checks passed after deployment. Production deployment remains
  `972bb404-b3a4-427e-8419-abc8dd861178`.
- Actual Chrome/staging UI recognizes helper 0.4.0 and reports temporary access
  off. Pairing setup, continuing without a login, and a public example.com scan
  through to a canvas node passed. No private session was transferred.
- Real Chrome permission query after manual upgrade returned only the staging
  API origin and `alarms`; no cookie/scripting/site grants. Chrome's update-check
  API returned `no_update` (this does not establish a store upgrade).
- Fresh uninstall/reinstall of helper 0.4.0 passed with the same identity.
  Incognito and local-file access are off. Invalid pairing-code feedback passed.
- Review found the worker's stale test-auth flag can execute shared-account
  seeding at module import, despite exposing only health. Worker mode now forces
  test-auth off. The disposable worker check deliberately sets the old flag true
  and verifies disabled test auth plus zero seeded users. Web/test fixtures retain
  their existing behavior. No existing account credentials were changed by this fix.
