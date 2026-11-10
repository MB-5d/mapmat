# Auth isolation and capture-later candidate — 2026-11-10

Status: local work on `codex/auth-isolation-capture-later`; not deployed. Production
is unchanged. Do not promote this candidate yet.

## Implemented

- Dedicated authenticated browser VMs; a separate public-browser VM; capacity
  bound; no app secrets in the browser image; no direct network interface in the
  browser namespace; public-address-only proxy; absolute lifetime and cleanup.
- Existing map Images jobs can reuse a login until its original 30-minute deadline.
  Scanning itself captures no images. Expiry requires login, not a rescan. Partial
  images survive an ended connection; a retry targets remaining pages.
- Private images use encrypted map-bound storage, map read permissions, existing
  image download controls, and durable retention while the owning map exists.
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

1. Complete the corrected cloud deny/bypass/expiry suite with approved test usage;
   confirm a fresh checkpoint restore, no active/addressed namespace interfaces except loopback,
   connection interruption, capacity, and verified VM destruction.
2. Configure a staging-scoped Railway project token, checkpoint and deployment
   capacity. Never deploy the local account token. Verify all services executing
   browser jobs use the boundary, and measure cost/startup latency/concurrency.
3. Deploy and test app flows in real staging, with feature off and on, using
   password and helper logins. Verify slow capture past session expiry, reconnect,
   cancellation/restart, private-image access and user-visible progress.
4. Complete customer image cases: map duplication/Save As, sharing permissions,
   historical versions and deleting the original map. Current ciphertext binding
   is to the original map; duplicated maps need explicit asset authorization and
   retention handling. Anonymous public-share image delivery is intentionally
   denied and needs a product decision before promising identical sharing.
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
