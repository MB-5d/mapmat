# Postgres Migration (Phase 4)

This is the first migration step from SQLite to PostgreSQL.

Scope of this step:

- Keep runtime on SQLite (no behavior change in prod/staging yet).
- Add a one-way migration tool to copy existing SQLite data into Postgres.
- Prepare verification steps before switching the app runtime.

## 1) Create Postgres Target

Use either:

- Supabase Postgres, or
- Railway Postgres service.

Capture the connection string as:

- `DATABASE_URL=postgres://...`

## 2) Install dependencies

From repo root:

```bash
npm install
```

## 3) Run migration from local SQLite snapshot

Required environment variable:

- `DATABASE_URL`

Optional:

- `SQLITE_DB_PATH` to override source file path
- `MIGRATION_TRUNCATE=true` to clear target tables before copy

Examples:

```bash
DATABASE_URL="postgres://..." npm run migrate:postgres
```

```bash
DATABASE_URL="postgres://..." SQLITE_DB_PATH="./data/mapmat.db" npm run migrate:postgres
```

```bash
DATABASE_URL="postgres://..." MIGRATION_TRUNCATE=true npm run migrate:postgres
```

## 4) Verify migration

After migration:

1. Run parity checker:

```bash
DATABASE_URL="postgres://..." npm run verify:postgres
```

2. Confirm output shows:
- matching `sqlite` and `postgres` counts
- `countMatch: true`
- `sampleMatch: true`

3. Optional manual spot checks:
- `SELECT COUNT(*) FROM users;`
- `SELECT COUNT(*) FROM maps;`
- `SELECT COUNT(*) FROM map_versions;`
- `SELECT COUNT(*) FROM jobs;`
- `SELECT id, created_at FROM maps ORDER BY created_at DESC LIMIT 5;`

## 5) Do not switch app runtime yet

Current app runtime remains SQLite.

Next steps:

1. read-only validation against Postgres
2. staging runtime switch
3. production cutover

## 6) Phase 4b Readiness Checks

Before runtime cutover, verify Postgres target health:

```bash
DATABASE_URL="postgres://..." npm run check:postgres
```

Expected:

- `configured: true`
- `reachable: true`
- `missingTableCount: 0`

Runtime health visibility endpoint:

- `GET /health/db`
- Returns runtime provider (`sqlite` by default) and cached Postgres probe status.

## 7) Phase 4c Preflight (Staging)

Before cutover work, run endpoint checks from your local machine:

```bash
HEALTH_DB_URL="https://mapmat-staging.up.railway.app/health/db" npm run check:db-health
```

Expected staging output:

- `ok: true`
- `postgres.configured: true`
- `postgres.reachable: true`
- `postgres.missingTables: []`

Run parity validation against staging endpoint:

```bash
PARITY_URL="https://mapmat-staging.up.railway.app/health/db/parity" npm run check:db-parity
```

Expected:

- `configured: true`
- `reachable: true`
- `allMatch: true`
- `mismatchCount: 0`

Runtime fields now include:

- `runtime` (active runtime provider)
- `runtimeRequested` (what env asked for via `DB_PROVIDER`)
- `runtimeFallback` (whether runtime had to fall back)
- `supportedRuntimes` (currently `["sqlite"]`)

Important:

- Current runtime remains SQLite by design.
- Setting `DB_PROVIDER=postgres` today is not a completed cutover; use this phase to validate readiness only.

## 8) Rollback safety

If migration fails:

- Script rolls back Postgres transaction automatically.
- SQLite source is read-only and unchanged.

## 9) Phase 4d Adapter Boundary (No Runtime Cutover Yet)

This phase keeps runtime on SQLite but moves DB access behind store adapters so we can switch providers safely later.

Current expectation:

- `runtime: "sqlite"`
- `postgres.configured: true`
- `postgres.reachable: true`
- `postgres.missingTables: []`

Validation command:

```bash
HEALTH_DB_URL="https://mapmat-staging.up.railway.app/health/db" \
REQUIRE_RUNTIME=sqlite \
EXPECT_RUNTIME_FALLBACK=false \
npm run check:db-health
```

Boundary guard command:

```bash
npm run check:backend
```

`check:backend` now includes a DB-boundary validator that fails if direct SQL calls are added outside `stores/dbAdapter.js`.

Optional guardrail check (when toggling `DB_PROVIDER` to an unsupported provider):

```bash
HEALTH_DB_URL="https://mapmat-staging.up.railway.app/health/db" \
EXPECT_RUNTIME_FALLBACK=true \
npm run check:db-health
```

## 10) Phase 4e Staging Canary (Requested Postgres, Active SQLite Fallback)

Goal:

- Keep app runtime on SQLite.
- Intentionally set staging `DB_PROVIDER=postgres` to prove fallback safety.
- Validate health + parity in one command.

Important shell context:

- Commands run at `root@...:/app#` are **inside Railway service container**.
- Commands run at `matthewbraun@... MapMat %` are **local machine**.

Canary validation command (run from local machine):

```bash
HEALTH_DB_URL="https://mapmat-staging.up.railway.app/health/db" \
PARITY_URL="https://mapmat-staging.up.railway.app/health/db/parity" \
REQUIRE_RUNTIME=sqlite \
REQUIRE_RUNTIME_REQUESTED=postgres \
EXPECT_RUNTIME_FALLBACK=true \
npm run check:db-canary
```

Expected:

- health shows:
  - `runtime: "sqlite"`
  - `runtimeRequested: "postgres"`
  - `runtimeFallback: true`
  - Postgres readiness healthy
- parity shows `allMatch: true`
