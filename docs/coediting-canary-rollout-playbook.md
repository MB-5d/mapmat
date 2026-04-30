# Co-Editing Canary Rollout Playbook

This is the operator playbook for staging and production co-editing canary rollout after the Phase 11 hardening work.

## Preconditions

- GitHub -> latest branch checks are green:
  - `Backend Syntax`
  - `Frontend Build`
- Railway -> service `vellic-staging` or `vellic-production` -> `Variables` includes:
  - `ADMIN_API_KEY`
  - `COEDITING_EXPERIMENT_ENABLED=true`
  - `COEDITING_SYNC_ENGINE_ENABLED=true`
  - `COEDITING_ROLLOUT_ENABLED=true`
  - `COEDITING_ROLLOUT_HARDENING_ENABLED=true`
  - `COEDITING_ROLLOUT_ALLOW_GLOBAL=false`
  - `COEDITING_ROLLOUT_GLOBAL_APPROVED=false`
  - `COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT=true`
  - `COEDITING_DISTRIBUTED_OBSERVABILITY_ENABLED=true`
  - `COEDITING_FORCE_READ_ONLY=false`
- Keep rollout scoped during canary with at least one of:
  - `COEDITING_ROLLOUT_USER_IDS`
  - `COEDITING_ROLLOUT_MAP_IDS`
- Recommended degraded-mode thresholds:
  - `COEDITING_DEGRADE_CONFLICTS_PER_WINDOW=20`
  - `COEDITING_DEGRADE_RECONNECTS_PER_WINDOW=5`
  - `COEDITING_DEGRADE_DROPPED_PER_WINDOW=5`

## Canary Gate Defaults

`npm run verify:realtime:*:canary` enforces:

- public `/health/coediting` status is `healthy`
- admin `/api/admin/coediting` status is `healthy`
- `rollout.configValid=true`
- `rollout.instanceAgreementStatus="consistent"`
- `rollout.allowGlobalRollout=false`
- `rollout.globalRolloutApproved=false`
- `readOnlyFallbackActive=false`
- health source is `distributed`
- rollout, experiment, and sync engine flags are all enabled
- at least one scoped rollout entity is configured
- recent conflicts <= `20`
- recent reconnects <= `5`
- recent dropped events <= `5`
- recent read-only blocks = `0`

Override those gates only with explicit environment variables in the terminal that runs the canary check.

Recommended canary policy in Railway `Variables`:

- keep `COEDITING_ROLLOUT_HARDENING_ENABLED=true`
- keep `COEDITING_ROLLOUT_ALLOW_GLOBAL=false` until broad rollout is explicitly approved
- keep `COEDITING_ROLLOUT_GLOBAL_APPROVED=false` until broad rollout is explicitly approved
- keep `COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT=true` during canary and early production expansion

If `COEDITING_ROLLOUT_ALLOW_GLOBAL=true`, the canary gate now fails even when scoped entity counts are still present. Scoped canary must remain explicitly scoped, not globally armed.

If broader rollout is explicitly approved later, set both `COEDITING_ROLLOUT_ALLOW_GLOBAL=true` and `COEDITING_ROLLOUT_GLOBAL_APPROVED=true`. Hardened runtime now rejects global rollout when only the first flag is set.

Before changing rollout scope or broad-rollout flags, compare staging and production policy state:

```bash
export COEDITING_STAGING_ADMIN_KEY="<vellic-staging ADMIN_API_KEY>"
export COEDITING_PRODUCTION_ADMIN_KEY="<vellic-production ADMIN_API_KEY>"
npm run verify:realtime:rollout-state
```

Then run local preflight for the exact target Railway `Variables` change:

```bash
export COEDITING_ADMIN_KEY="<target service ADMIN_API_KEY>"
export COEDITING_PREFLIGHT_CHANGE_TYPE="scope"
export COEDITING_ROLLOUT_USER_IDS="internal-user-1,internal-user-2"
export COEDITING_ROLLOUT_MAP_IDS=""
npm run verify:realtime:staging:preflight
```

`npm run verify:realtime:*:canary:window` uses the same gate limits but polls for a sustained observation window with:

- `COEDITING_CANARY_WINDOW_SEC=300`
- `COEDITING_CANARY_POLL_INTERVAL_SEC=30`
- `COEDITING_CANARY_MIN_SAMPLES=3`
- `COEDITING_CANARY_REQUIRE_STABLE_SCOPE_COUNT=true`

## Staging Canary

1. Railway -> project `vellic-staging` -> service `vellic-staging` -> `Variables`.
2. Confirm the scoped rollout variables point to a small internal user or map set.
3. Export the admin key from Railway `Variables`:

```bash
export COEDITING_ADMIN_KEY="<vellic-staging ADMIN_API_KEY>"
```

4. Preflight the exact scoped target before editing Railway `Variables`:

```bash
export COEDITING_PREFLIGHT_CHANGE_TYPE="scope"
export COEDITING_ROLLOUT_USER_IDS="<exact target user ids or empty string>"
export COEDITING_ROLLOUT_MAP_IDS="<exact target map ids or empty string>"
npm run verify:realtime:staging:preflight
```

5. Run the point-in-time realtime canary gate:

```bash
npm run verify:realtime:staging:canary
```

6. Run the sustained canary window:

```bash
npm run verify:realtime:staging:canary:window
```

7. Run the standard runtime verification:

```bash
npm run verify:runtime:staging
```

Only move to production canary if all three commands pass.

## Production Canary

1. Railway -> project `vellic-production` -> service `vellic-production` -> `Variables`.
2. Start with one internal user or one internal map in the rollout scope.
3. Export the production admin key:

```bash
export COEDITING_ADMIN_KEY="<vellic-production ADMIN_API_KEY>"
```

4. Preflight the exact scoped target before editing Railway `Variables`:

```bash
export COEDITING_PREFLIGHT_CHANGE_TYPE="scope"
export COEDITING_ROLLOUT_USER_IDS="<exact target user ids or empty string>"
export COEDITING_ROLLOUT_MAP_IDS="<exact target map ids or empty string>"
npm run verify:realtime:production:preflight
```

5. Run the point-in-time realtime canary gate:

```bash
npm run verify:realtime:production:canary
```

6. Run the sustained canary window:

```bash
npm run verify:realtime:production:canary:window
```

7. Run the standard runtime verification:

```bash
npm run verify:runtime:production
```

Widen rollout scope only after the production canary gate stays green for the agreed observation window.

## Broad Rollout

Use this only after scoped canary is complete and broad rollout is explicitly approved.

1. Railway -> service `Variables`.
2. Set:
   - `COEDITING_ROLLOUT_ALLOW_GLOBAL=true`
   - `COEDITING_ROLLOUT_GLOBAL_APPROVED=true`
   - clear `COEDITING_ROLLOUT_USER_IDS` and `COEDITING_ROLLOUT_MAP_IDS`
3. Compare staging and production rollout state before the change is applied broadly:

```bash
npm run verify:realtime:rollout-state
```
4. Preflight the exact broad target before editing Railway `Variables`:

```bash
export COEDITING_ADMIN_KEY="<target service ADMIN_API_KEY>"
export COEDITING_PREFLIGHT_CHANGE_TYPE="broad"
export COEDITING_ROLLOUT_ALLOW_GLOBAL="true"
export COEDITING_ROLLOUT_GLOBAL_APPROVED="true"
export COEDITING_ROLLOUT_USER_IDS=""
export COEDITING_ROLLOUT_MAP_IDS=""
npm run verify:realtime:staging:preflight
```

or:

```bash
npm run verify:realtime:production:preflight
```

5. Run the point-in-time broad rollout gate:

```bash
npm run verify:realtime:staging:broad
```

or:

```bash
npm run verify:realtime:production:broad
```

6. Run the sustained broad rollout window:

```bash
npm run verify:realtime:staging:broad:window
```

or:

```bash
npm run verify:realtime:production:broad:window
```

## Rollback

If the canary gate fails:

1. Railway -> service `Variables`.
2. Apply the smallest safe rollback first:
   - set `COEDITING_FORCE_READ_ONLY=true`, or
   - clear `COEDITING_ROLLOUT_USER_IDS` / `COEDITING_ROLLOUT_MAP_IDS`, or
   - set `COEDITING_ROLLOUT_ALLOW_GLOBAL=false`, or
   - set `COEDITING_ROLLOUT_REQUIRE_INSTANCE_AGREEMENT=false` only as a deliberate temporary emergency bypass, or
   - set `COEDITING_ROLLOUT_ENABLED=false`
3. Redeploy if Railway does not auto-restart the service.
4. Re-run the public health check:

```bash
npm run verify:realtime:staging
```

or:

```bash
npm run verify:realtime:production
```

5. Do not resume rollout expansion until both `verify:realtime:*:canary` and `verify:realtime:*:canary:window` pass again.
