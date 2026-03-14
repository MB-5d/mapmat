# Co-Editing Canary Rollout Playbook

This is the operator playbook for staging and production co-editing canary rollout after the Phase 11 hardening work.

## Preconditions

- GitHub -> latest branch checks are green:
  - `Backend Syntax`
  - `Frontend Build`
- Railway -> service `mapmat-staging` or `mapmat-production` -> `Variables` includes:
  - `ADMIN_API_KEY`
  - `COEDITING_EXPERIMENT_ENABLED=true`
  - `COEDITING_SYNC_ENGINE_ENABLED=true`
  - `COEDITING_ROLLOUT_ENABLED=true`
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
- `readOnlyFallbackActive=false`
- health source is `distributed`
- rollout, experiment, and sync engine flags are all enabled
- at least one scoped rollout entity is configured
- recent conflicts <= `20`
- recent reconnects <= `5`
- recent dropped events <= `5`
- recent read-only blocks = `0`

Override those gates only with explicit environment variables in the terminal that runs the canary check.

## Staging Canary

1. Railway -> project `mapmat-staging` -> service `mapmat-staging` -> `Variables`.
2. Confirm the scoped rollout variables point to a small internal user or map set.
3. Export the admin key from Railway `Variables`:

```bash
export COEDITING_ADMIN_KEY="<mapmat-staging ADMIN_API_KEY>"
```

4. Run the realtime canary gate:

```bash
npm run verify:realtime:staging:canary
```

5. Run the standard runtime verification:

```bash
npm run verify:runtime:staging
```

Only move to production canary if both commands pass.

## Production Canary

1. Railway -> project `mapmat-production` -> service `mapmat-production` -> `Variables`.
2. Start with one internal user or one internal map in the rollout scope.
3. Export the production admin key:

```bash
export COEDITING_ADMIN_KEY="<mapmat-production ADMIN_API_KEY>"
```

4. Run the realtime canary gate:

```bash
npm run verify:realtime:production:canary
```

5. Run the standard runtime verification:

```bash
npm run verify:runtime:production
```

Widen rollout scope only after the production canary gate stays green for the agreed observation window.

## Rollback

If the canary gate fails:

1. Railway -> service `Variables`.
2. Apply the smallest safe rollback first:
   - set `COEDITING_FORCE_READ_ONLY=true`, or
   - clear `COEDITING_ROLLOUT_USER_IDS` / `COEDITING_ROLLOUT_MAP_IDS`, or
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
