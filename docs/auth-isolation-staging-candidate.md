# Authenticated scanning: staging readiness

Updated 2026-11-10. **Not approved for production.** Production remains at
`071a10f07ef31d82c4d958bf6d988999858dd53c`.

## Tested behavior

The implementation below passed the scoped staging test. Its new isolation and
protected capture-later settings are now restored to off; the temporary test
credentials are revoked. This is not persistent staging enablement.

Scanning creates map nodes without capturing images. Protected pages use the
normal Images controls afterward. An active site connection can be reused until
its original deadline; expiry requires signing in again, not rescanning the map.
Previously saved private images remain available to authorized map readers.

Authenticated browsers run in separate Railway machines with no app secrets,
app checkout or private-network access. Chromium uses its sandbox inside a
network namespace and a public-address-only proxy. Connections have an absolute
lifetime, per-process capacity limit and verified cleanup. Public browser work
uses a separate machine. Staging currently has one web instance.

## Fixes found during integrated testing

- `fa000e8`: the console's cookie middleware no longer shadows the read-only
  operational health endpoint. Its existing API-key guard still applies;
  keys cannot grant access to console routes.
- `4f95450`: a usable partial/page-limited scan retains its live connection for
  later images. The regression fixture now exercises a partial scan.
- `58aacc3`: Vite includes the protected capture setting in real frontend builds.
  Component tests alone did not reveal the omitted build setting.
- `c29adbe`: after abrupt web-process loss, running, paused and stopping protected
  capture jobs fail with a reconnect message. Saved images/progress remain.
  Separate worker restarts, completed captures and public image jobs are excluded.
  Conditional job updates prevent overwriting an already settled job.
- Earlier staging fix `fd1b156` prevents worker startup from seeding/resetting
  shared test accounts, even with its stale test-auth environment flag.

## Verified evidence

- Dedicated cloud boundary test passed public page/image capture, private,
  metadata, loopback and IPv6 denial, direct-egress denial, cookie isolation,
  namespace restrictions, interrupted connection cleanup, hard expiry and real
  provider destruction. Machine `62e39497-6934-4975-9019-96c3164898cb` was removed.
- Integrated staging tests use generated protected pages and normal QA sign-in,
  actual Postgres and R2. No GitHub or Stripe session was transferred in this run.
- Ordinary public scanning passed with isolation configured. That crawl used the
  HTTP path and did not itself allocate a browser machine.
- Password login, map-only partial scan, private thumbnails/full-page capture,
  normal JPEG download, unauthorized access/copy denial and saved map/version
  creation passed against staging.
- Actual R2 object inspection confirmed version-2 encrypted binary storage.
  Guest/other-account image access and the public screenshot route were denied.
- A slow protected capture ran through the real five-minute test login deadline.
  Its settled result was stopped with `authRequired`, saved zero new images, and
  returned a reconnect requirement. Existing images remained readable; expired
  session reuse returned 409. No protected requests started after expiry.
- Actual Chrome verified the normal Images menu, a saved private full-size image,
  and Images → selected page → password → capture after expiry without a rescan.
  The new full-size protected image was visibly verified.
- Graceful staging web restart stopped an active private capture, removed the
  session and retained the saved image. A new helper-protocol import, access
  verification and active cancellation passed afterward. The imported cookie was
  generated fixture data; this is not a repeat of real-provider Google/2FA tests.
- Abrupt local process-loss regression passed for running, paused and stopping
  private jobs, plus worker/public/completed-job exclusions. Full backend checks
  in Postgres mode, protected capture regressions, ordinary image-job smoke and
  frontend production build passed. Postgres-mode fixtures partly use SQLite;
  the integrated staging checks above provide the live Postgres evidence.
- Helper 0.4.0 manual Chrome upgrade/fresh install passed under stable staging ID
  `ggfnbddajhcphpacfojplhmcfgkfghok`. Its active permissions were only staging API
  access and alarms; Incognito and file access were off. Staging recognized the
  installed version. Chrome's `no_update` result is not store-upgrade evidence.

## Test scope and configuration

The user approved at most six temporary browser machines, 2 CPU / 2 GB each,
one disposable protected site and one staging-scoped key for one hour. The test
window had a deadline of **2026-11-11 00:38:32 UTC**. Resource cleanup completed after 43
minutes, within the approved hour. Test settings were restored; this is not
persistent enablement for all staging users.

The mandatory scoped coediting preflight was run after fixing its routing.
It rejects the existing global policy because it is a scope-change check. No
coediting change is proposed or applied: live health, valid current policy and
zero policy differences were separately verified. No safety settings were
changed to make that check pass.

Three unrelated staging image/screenshot rows still say running with timestamps
from May 2026. They were not changed by this work and were not current activity.

## Remaining production gates

1. Prepare the production helper identity/package and approved Chrome Web Store
   distribution; verify genuine customer installation and automatic upgrades.
   Manual unpacked Chrome tests do not establish that delivery path.
2. Prepare and review production-specific isolation/helper configuration, scoped
   credentials, capacity, expected startup latency and hosting cost. Current
   configuration deliberately accepts staging only and rejects production.
   Memory-only login ownership still requires a bounded single web instance.
3. Decide how private images should behave in anonymous public map shares.
   Current behavior denies anonymous access; authorized copies retain independent
   access and retention. Do not promise ordinary public image-sharing behavior.
4. Verify abrupt application-process loss in the cloud. The attempted remote
   SIGKILL did not terminate PID 1, so that attempt is not a passed crash test.
   Actual local SIGKILL recovery, graceful cloud app restart and forced cloud
   browser destruction passed; those cover different failure conditions.

## Final interruption and cleanup evidence

- Destroying the final cloud browser during an active capture stopped the job,
  removed its login and preserved the previously saved image. The settled job
  reports `complete` with a stopped result; it does not report successful capture.
- Actual Postgres copy/version retention passed: a copied image survived source
  deletion and removal from the current map while a version retained it. Deleting
  the final referencing map revoked access.
- All six integrated-test browser machines were verified DESTROYED. The
  disposable protected site was removed and the staging-scoped key was revoked;
  its authentication was rejected afterward.
- Both services' temporary settings exactly match their original values, and
  the collaboration policy hash is unchanged. The frontend was rebuilt with
  protected capture-later off. The helper remains limited to David B.'s account.
- Both disposable maps, 14 encrypted test objects and 12 test-job rows were
  removed. No unrelated records were deleted.
- Restored staging web and worker deployments succeeded at `c29adbe`.
  Final staging TLS, sign-in configuration/CORS and Postgres health checks passed.
  Production remains deployment `972bb404-b3a4-427e-8419-abc8dd861178`, commit
  `071a10f07ef31d82c4d958bf6d988999858dd53c`.

Sanitized test results are retained locally in
`/private/tmp/vellic-integrated-staging/*-result.json`; temporary files containing
test sessions and configuration snapshots are removed after final verification.
