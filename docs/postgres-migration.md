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

## 11) Phase 5 Daily Ops (Shadow Postgres While Runtime Stays SQLite)

Use these shortcuts from repo root:

```bash
npm run verify:phase5:staging
```

```bash
npm run verify:phase5:production
```

If parity fails (expected when new writes land in SQLite first), use the automatic re-sync commands:

```bash
npm run verify:phase5:staging:resync
```

```bash
npm run verify:phase5:production:resync
```

If production canary fails with parity mismatch, re-sync production shadow Postgres:

```bash
railway ssh -s mapmat -e production
```

Then inside the Railway shell (`root@...:/app#`):

```bash
cd /app
MIGRATION_TRUNCATE=true SQLITE_DB_PATH=/app/data/mapmat.db npm run migrate:postgres
exit
```

Then back on your local shell:

```bash
npm run verify:phase5:production
```

## 12) Next Step (Phase 6 Entry)

Phase 6 starts when you want runtime cutover work.

Entry criteria:

- `npm run verify:phase5:staging` passes
- `npm run verify:phase5:production` passes
- `DB_PROVIDER=postgres` is set in staging and production (requested runtime)
- `/health/db` shows:
  - `runtime: "sqlite"`
  - `runtimeRequested: "postgres"`
  - `runtimeFallback: true`
  - `postgres.reachable: true`

At this point, proceed to implementing real Postgres runtime support (not just shadow parity).

## 13) Phase 6A (Started): Async Store Boundary for Runtime Cutover

Phase 6A adds cutover-safe scaffolding without changing runtime behavior yet.

What is now in place:

- `stores/dbAdapter.js`
  - adds async DB methods:
    - `queryOneAsync`
    - `queryAllAsync`
    - `executeAsync`
    - `transactionAsync`
  - keeps existing sync methods for current sqlite runtime
  - includes Postgres pool/query translation support behind runtime gates
- `stores/authStore.js`
  - now uses async adapter methods for auth data access
- `routes/auth.js`
  - now awaits store operations across signup/login/profile/delete
  - test-auth seed path now runs async

Validation for this phase:

```bash
npm run check:backend
```

Expected: pass with no DB-boundary violations and no syntax errors.

Important:

- Runtime remains sqlite shadow mode in Phase 6A.
- Do **not** change `SUPPORTED_RUNTIME_PROVIDERS` to include `postgres` yet.
- Continue using phase 5 canary/parity checks during this migration stage.
