# Disposable staging failure target

This service serves generated pages only. It is separate from the Vellic app and contains no customer credentials. Each run has a random password, a path-scoped HttpOnly cookie, and a private control endpoint. Protected pages form a chain so repetitive-page grouping cannot shorten an expiry test. Slow mode delays each child response by 18 seconds.

Hosting requires explicit approval for the named temporary service and its usage charges. Set a random `FIXTURE_CONTROL_KEY` and an absolute `FIXTURE_EXPIRES_AT` no more than 24 hours ahead (four hours was used for this review). The process stops at that deadline. Remove the service after testing; process exit alone is not infrastructure cleanup.

## Runner

Use Node 24 and `VELLIC_STAGING_FAILURE_TEST_DIR` pointing to a private directory outside the repository. Keep its files mode 0600. The runner intentionally permits only the named staging API and fixture origin.

- `accounts.json`: `origin` set to `https://api-staging.vellic.io`, plus `agency` and `free` objects containing a `cookie` obtained through their normal QA-account sign-in. The negative account must be inactive/archived. Do not generate account tokens from signing keys or use customer sessions.
- `control.json`: `fixtureOrigin` set to `https://auth-failure-fixture-staging.up.railway.app`, plus the fixture's `key` and `expiresAt`.

Run `node prototype/auth-failure-fixture/check-staging.cjs COMMAND`:

1. `preflight`, `checks`, `capacity`, `success`, then `public-single`. These cover entitlement/ownership, incorrect-password retry, legacy image-route rejection, duplicate claims, active cancellation, two-scan capacity without disrupting active work, map-only results, save/reopen and the ordinary one-page regression. `success` removes its generated map. Run `capacity` while the QA account has no other active scans.
2. `expiry`. It must remain running until the real session deadline, then fail without a map. The runner checks that no protected requests start after expiry. Do not deploy/restart either service during this test. `expiry-monitor` reports timing only. `cancel-expiry` cancels only the recorded disposable attempt if fixture repair is needed.
3. `restart-start`, then the separately authorized staging web restart/deployment, then `restart-check`. First confirm that no unrelated current scans will be interrupted. The check requires a failed persisted job, removal of the old session, no further protected requests, and a fresh working login.

Run short ordinary scans before long authenticated tests: the single staging web worker can queue ordinary scans behind a long scan. A queued test is not a successful public-scan result.

The directory contains result summaries and sensitive temporary run state. Never commit or upload it. Remove it when testing and evidence recording are finished. The fixture upload excludes the runner and all JSON/log files.

Real Google/GitHub and Stripe Authenticator checks are separate evidence. This controlled target tests failure behavior, not provider compatibility.
