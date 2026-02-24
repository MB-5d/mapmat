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

Next step (Phase 4b) will introduce runtime DB abstraction and controlled cutover:

1. read-only validation against Postgres
2. staging runtime switch
3. production cutover

## 7) Phase 4b Readiness Checks

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

## 6) Rollback safety

If migration fails:

- Script rolls back Postgres transaction automatically.
- SQLite source is read-only and unchanged.
