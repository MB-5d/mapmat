#!/usr/bin/env node

/**
 * Phase 4 migration utility: copy SQLite data to PostgreSQL.
 *
 * This script is intentionally additive and does not change runtime DB behavior.
 * It creates Postgres tables/indexes (if missing) and upserts data table-by-table.
 *
 * Required:
 *   DATABASE_URL=postgres://...
 *
 * Optional:
 *   SQLITE_DB_PATH=/absolute/or/relative/path/to/mapmat.db
 *   MIGRATION_TRUNCATE=true   // clear target tables before import
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

const parseEnvBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const resolveSqlitePath = () => {
  if (process.env.SQLITE_DB_PATH) return path.resolve(process.env.SQLITE_DB_PATH);
  if (process.env.DB_PATH) return path.resolve(process.env.DB_PATH);

  const railwayVolumeDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_VOLUME_PATH;
  if (railwayVolumeDir) return path.join(railwayVolumeDir, 'mapmat.db');

  return path.join(__dirname, '..', 'data', 'mapmat.db');
};

const DATABASE_URL = process.env.DATABASE_URL;
const SQLITE_DB_PATH = resolveSqlitePath();
const MIGRATION_TRUNCATE = parseEnvBool(process.env.MIGRATION_TRUNCATE, false);

if (!DATABASE_URL) {
  console.error('[migrate] Missing DATABASE_URL');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_DB_PATH)) {
  console.error(`[migrate] SQLite database not found: ${SQLITE_DB_PATH}`);
  process.exit(1);
}

const TABLES = [
  {
    name: 'users',
    conflictKey: 'id',
    columns: ['id', 'email', 'password_hash', 'name', 'created_at', 'updated_at'],
  },
  {
    name: 'projects',
    conflictKey: 'id',
    columns: ['id', 'user_id', 'name', 'created_at', 'updated_at'],
  },
  {
    name: 'maps',
    conflictKey: 'id',
    columns: [
      'id', 'user_id', 'project_id', 'name', 'notes', 'url', 'root_data', 'orphans_data',
      'connections_data', 'colors', 'connection_colors', 'created_at', 'updated_at',
    ],
  },
  {
    name: 'map_versions',
    conflictKey: 'id',
    columns: [
      'id', 'map_id', 'user_id', 'version_number', 'name', 'notes', 'root_data', 'orphans_data',
      'connections_data', 'colors', 'connection_colors', 'created_at',
    ],
  },
  {
    name: 'scan_history',
    conflictKey: 'id',
    columns: [
      'id', 'user_id', 'map_id', 'url', 'hostname', 'title', 'page_count', 'root_data',
      'orphans_data', 'connections_data', 'colors', 'connection_colors', 'scan_options',
      'scan_depth', 'scanned_at',
    ],
  },
  {
    name: 'pages',
    conflictKey: 'url',
    columns: [
      'url', 'title', 'status', 'type', 'severity', 'placement', 'parent_url',
      'discovery_source', 'links_in', 'depth', 'created_at', 'updated_at',
    ],
  },
  {
    name: 'shares',
    conflictKey: 'id',
    columns: [
      'id', 'map_id', 'user_id', 'root_data', 'orphans_data', 'connections_data', 'colors',
      'connection_colors', 'created_at', 'expires_at', 'view_count',
    ],
  },
  {
    name: 'usage_events',
    conflictKey: 'id',
    columns: ['id', 'user_id', 'api_key', 'ip_hash', 'event_type', 'quantity', 'meta', 'created_at'],
  },
  {
    name: 'jobs',
    conflictKey: 'id',
    columns: [
      'id', 'type', 'status', 'created_at', 'started_at', 'finished_at', 'user_id', 'api_key',
      'ip_hash', 'payload', 'progress', 'result', 'error',
    ],
  },
];

const POSTGRES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  notes TEXT,
  url TEXT NOT NULL,
  root_data TEXT NOT NULL,
  orphans_data TEXT,
  connections_data TEXT,
  colors TEXT,
  connection_colors TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS map_versions (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT,
  notes TEXT,
  root_data TEXT NOT NULL,
  orphans_data TEXT,
  connections_data TEXT,
  colors TEXT,
  connection_colors TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scan_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_id TEXT,
  url TEXT NOT NULL,
  hostname TEXT NOT NULL,
  title TEXT,
  page_count INTEGER,
  root_data TEXT NOT NULL,
  orphans_data TEXT,
  connections_data TEXT,
  colors TEXT,
  connection_colors TEXT,
  scan_options TEXT,
  scan_depth INTEGER,
  scanned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
  url TEXT PRIMARY KEY,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  type TEXT,
  severity TEXT NOT NULL DEFAULT 'Healthy',
  placement TEXT NOT NULL DEFAULT 'Primary',
  parent_url TEXT,
  discovery_source TEXT NOT NULL DEFAULT 'crawl',
  links_in INTEGER NOT NULL DEFAULT 0,
  depth INTEGER,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  map_id TEXT REFERENCES maps(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  root_data TEXT NOT NULL,
  orphans_data TEXT,
  connections_data TEXT,
  colors TEXT,
  connection_colors TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  api_key TEXT,
  ip_hash TEXT,
  event_type TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  meta TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  user_id TEXT,
  api_key TEXT,
  ip_hash TEXT,
  payload TEXT,
  progress TEXT,
  result TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_maps_user ON maps(user_id);
CREATE INDEX IF NOT EXISTS idx_maps_project ON maps(project_id);
CREATE INDEX IF NOT EXISTS idx_map_versions_map ON map_versions(map_id);
CREATE INDEX IF NOT EXISTS idx_map_versions_created ON map_versions(map_id, created_at);
CREATE INDEX IF NOT EXISTS idx_history_user ON scan_history(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_type_time ON usage_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_url);
CREATE INDEX IF NOT EXISTS idx_pages_placement ON pages(placement);
`;

const qIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;

const buildUpsertSQL = ({ table, columns, conflictKey }) => {
  const quotedColumns = columns.map(qIdent);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const updateColumns = columns.filter((col) => col !== conflictKey);
  const updateClause = updateColumns
    .map((col) => `${qIdent(col)} = EXCLUDED.${qIdent(col)}`)
    .join(', ');

  return `
    INSERT INTO ${qIdent(table)} (${quotedColumns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (${qIdent(conflictKey)}) DO UPDATE
    SET ${updateClause};
  `;
};

const truncateTargets = async (client) => {
  const reverseOrder = [...TABLES].reverse().map((table) => qIdent(table.name)).join(', ');
  await client.query(`TRUNCATE TABLE ${reverseOrder} CASCADE;`);
};

const getSqliteRowCount = (sqliteDb, tableName) => {
  const row = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
  return Number(row?.count || 0);
};

const copyTable = async (sqliteDb, pgClient, table) => {
  const sourceRows = sqliteDb.prepare(`SELECT * FROM ${table.name}`).all();
  if (!sourceRows.length) return { copied: 0, source: 0 };

  const upsertSql = buildUpsertSQL({
    table: table.name,
    columns: table.columns,
    conflictKey: table.conflictKey,
  });

  let copied = 0;
  for (const row of sourceRows) {
    const values = table.columns.map((column) => {
      const value = row[column];
      return value === undefined ? null : value;
    });
    await pgClient.query(upsertSql, values);
    copied += 1;
  }

  return { copied, source: sourceRows.length };
};

const run = async () => {
  const sqliteDb = new Database(SQLITE_DB_PATH, { readonly: true });
  const pgClient = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  console.log(`[migrate] SQLite source: ${SQLITE_DB_PATH}`);
  console.log('[migrate] Connecting to PostgreSQL...');
  await pgClient.connect();

  try {
    await pgClient.query('BEGIN');
    await pgClient.query(POSTGRES_SCHEMA_SQL);

    if (MIGRATION_TRUNCATE) {
      console.log('[migrate] Truncating PostgreSQL target tables...');
      await truncateTargets(pgClient);
    }

    const summary = [];
    for (const table of TABLES) {
      const sourceCount = getSqliteRowCount(sqliteDb, table.name);
      const { copied } = await copyTable(sqliteDb, pgClient, table);
      summary.push({ table: table.name, source: sourceCount, copied });
      console.log(`[migrate] ${table.name}: copied ${copied}/${sourceCount}`);
    }

    await pgClient.query('COMMIT');
    console.log('[migrate] Migration complete.');
    console.table(summary);
  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('[migrate] Migration failed. Rolled back transaction.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqliteDb.close();
    await pgClient.end();
  }
};

run();
