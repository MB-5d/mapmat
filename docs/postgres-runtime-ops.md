# Postgres Runtime Ops (Current)

Last updated: March 12, 2026.

This is the active operations guide after cutover. Staging and production now run:

- `DB_PROVIDER=postgres`
- `DATABASE_URL=postgres://...`
- `/health/db` reports:
  - `runtime: "postgres"`
  - `runtimeRequested: "postgres"`
  - `runtimeFallback: false`

## Daily Verification

Run from repo root:

```bash
npm run verify:runtime:staging
npm run verify:runtime:production
```

Or both in one command:

```bash
npm run verify:runtime:all
```

## What These Commands Check

- `check:db-health:*` validates runtime + Postgres readiness.
- `test:smoke:*` validates core API behavior (save/load/share, scan-stream path).
- CI also runs `npm run check:backend:postgres` on pull requests.

## Railway UI Checklist

For each environment:

1. Open `Railway` -> project `mapmat`.
2. Open service `mapmat`.
3. Select environment (`staging` or `production`).
4. Open tab `Variables`.
5. Confirm:
   - `DB_PROVIDER` = `postgres`
   - `DATABASE_URL` is set
6. Open tab `Deployments`.
7. Confirm latest deployment status is `Success`.

## Notes

- Legacy phase-era command names (`verify:phase5:*`, `verify:phase7*`) map to the new runtime verify flow.
- Shadow/parity tooling (`check-db-canary`, `check-db-parity`, `/health/db/parity`) was retired in Phase 8.
- The historical phase-by-phase implementation log remains in `docs/postgres-migration.md`.
