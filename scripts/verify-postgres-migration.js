#!/usr/bin/env node

/**
 * Phase 4b Step 1: read-only parity check between SQLite and PostgreSQL.
 *
 * Required:
 *   DATABASE_URL=postgres://...
 *
 * Optional:
 *   SQLITE_DB_PATH=/absolute/or/relative/path/to/mapmat.db
 *   VERIFY_SAMPLE_LIMIT=5
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

const resolveSqlitePath = () => {
  if (process.env.SQLITE_DB_PATH) return path.resolve(process.env.SQLITE_DB_PATH);
  if (process.env.DB_PATH) return path.resolve(process.env.DB_PATH);

  const railwayVolumeDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_VOLUME_PATH;
  if (railwayVolumeDir) return path.join(railwayVolumeDir, 'mapmat.db');

  return path.join(__dirname, '..', 'data', 'mapmat.db');
};

const DATABASE_URL = process.env.DATABASE_URL;
const SQLITE_DB_PATH = resolveSqlitePath();
const SAMPLE_LIMIT = Math.max(1, Number(process.env.VERIFY_SAMPLE_LIMIT || 5));

if (!DATABASE_URL) {
  console.error('[verify] Missing DATABASE_URL');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_DB_PATH)) {
  console.error(`[verify] SQLite database not found: ${SQLITE_DB_PATH}`);
  process.exit(1);
}

const TABLES = [
  { name: 'users', key: 'id' },
  { name: 'projects', key: 'id' },
  { name: 'maps', key: 'id' },
  { name: 'map_versions', key: 'id' },
  { name: 'scan_history', key: 'id' },
  { name: 'pages', key: 'url' },
  { name: 'shares', key: 'id' },
  { name: 'usage_events', key: 'id' },
  { name: 'jobs', key: 'id' },
];

const qIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;

const getSqliteCount = (db, tableName) =>
  Number(db.prepare(`SELECT COUNT(*) as c FROM ${tableName}`).get()?.c || 0);

const getPostgresCount = async (client, tableName) => {
  const { rows } = await client.query(`SELECT COUNT(*)::bigint AS c FROM ${qIdent(tableName)}`);
  return Number(rows?.[0]?.c || 0);
};

const getSqliteRecentKeys = (db, { name, key }) => {
  const rows = db
    .prepare(`SELECT ${key} FROM ${name} ORDER BY ROWID DESC LIMIT ?`)
    .all(SAMPLE_LIMIT);
  return rows.map((row) => row[key]).filter(Boolean);
};

const getPostgresKeySet = async (client, { name, key }, keys) => {
  if (!keys.length) return new Set();
  const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
  const sql = `SELECT ${qIdent(key)} AS k FROM ${qIdent(name)} WHERE ${qIdent(key)} IN (${placeholders})`;
  const { rows } = await client.query(sql, keys);
  return new Set(rows.map((r) => r.k));
};

const run = async () => {
  const sqlite = new Database(SQLITE_DB_PATH, { readonly: true });
  const pg = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  console.log(`[verify] SQLite source: ${SQLITE_DB_PATH}`);
  console.log('[verify] Connecting to PostgreSQL...');
  await pg.connect();

  const results = [];
  let mismatches = 0;

  try {
    for (const table of TABLES) {
      const sqliteCount = getSqliteCount(sqlite, table.name);
      const pgCount = await getPostgresCount(pg, table.name);
      const countMatch = sqliteCount === pgCount;

      const sampleKeys = getSqliteRecentKeys(sqlite, table);
      const pgKeys = await getPostgresKeySet(pg, table, sampleKeys);
      const missingKeys = sampleKeys.filter((key) => !pgKeys.has(key));
      const sampleMatch = missingKeys.length === 0;

      if (!countMatch || !sampleMatch) mismatches += 1;

      results.push({
        table: table.name,
        sqlite: sqliteCount,
        postgres: pgCount,
        countMatch,
        sampleMatch,
        missingSampleKeys: missingKeys.length,
      });
    }

    console.table(results);

    if (mismatches > 0) {
      console.error(`[verify] Parity check failed for ${mismatches} table(s).`);
      process.exitCode = 1;
      return;
    }

    console.log('[verify] Parity check passed.');
  } finally {
    await pg.end().catch(() => {});
    sqlite.close();
  }
};

run().catch((error) => {
  console.error('[verify] Unexpected error:', error);
  process.exit(1);
});

