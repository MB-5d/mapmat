/**
 * Database setup for Map Mat
 * Uses SQLite for simplicity - can migrate to PostgreSQL later
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'mapmat.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

function ensureColumn(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(col => col.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// Create tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Projects table (folders for organizing maps)
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Maps table (saved sitemaps)
  CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    root_data TEXT NOT NULL,
    colors TEXT,
    connection_colors TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  -- Map Versions table (version history)
  CREATE TABLE IF NOT EXISTS map_versions (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    name TEXT,
    notes TEXT,
    root_data TEXT NOT NULL,
    orphans_data TEXT,
    connections_data TEXT,
    colors TEXT,
    connection_colors TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Scan history table
  CREATE TABLE IF NOT EXISTS scan_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    hostname TEXT NOT NULL,
    title TEXT,
    page_count INTEGER,
    root_data TEXT NOT NULL,
    colors TEXT,
    connection_colors TEXT,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Pages table (for IA features)
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Shares table (for sharing maps via link)
  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    map_id TEXT,
    user_id TEXT NOT NULL,
    root_data TEXT NOT NULL,
    colors TEXT,
    connection_colors TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    view_count INTEGER DEFAULT 0,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Usage events (for metering)
  CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    api_key TEXT,
    ip_hash TEXT,
    event_type TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    meta TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- Background jobs (scan/screenshot)
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    finished_at DATETIME,
    user_id TEXT,
    api_key TEXT,
    ip_hash TEXT,
    payload TEXT,
    progress TEXT,
    result TEXT,
    error TEXT
  );

  -- Create indexes for faster queries
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
`);

// Backfill new columns without full migrations
ensureColumn('maps', 'orphans_data', 'TEXT');
ensureColumn('maps', 'connections_data', 'TEXT');
ensureColumn('maps', 'connection_colors', 'TEXT');
ensureColumn('map_versions', 'orphans_data', 'TEXT');
ensureColumn('map_versions', 'connections_data', 'TEXT');
ensureColumn('map_versions', 'connection_colors', 'TEXT');
ensureColumn('map_versions', 'notes', 'TEXT');
ensureColumn('shares', 'orphans_data', 'TEXT');
ensureColumn('shares', 'connections_data', 'TEXT');
ensureColumn('shares', 'connection_colors', 'TEXT');
ensureColumn('scan_history', 'orphans_data', 'TEXT');
ensureColumn('scan_history', 'connections_data', 'TEXT');
ensureColumn('scan_history', 'connection_colors', 'TEXT');
ensureColumn('scan_history', 'scan_options', 'TEXT');
ensureColumn('scan_history', 'scan_depth', 'INTEGER');
ensureColumn('scan_history', 'map_id', 'TEXT');
ensureColumn('usage_events', 'meta', 'TEXT');
ensureColumn('pages', 'placement', "TEXT NOT NULL DEFAULT 'Primary'");
ensureColumn('pages', 'status', "TEXT NOT NULL DEFAULT 'Active'");
ensureColumn('pages', 'severity', "TEXT NOT NULL DEFAULT 'Healthy'");
ensureColumn('pages', 'parent_url', 'TEXT');
ensureColumn('pages', 'discovery_source', "TEXT NOT NULL DEFAULT 'crawl'");
ensureColumn('pages', 'links_in', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('pages', 'depth', 'INTEGER');

db.prepare("UPDATE pages SET placement = 'Primary' WHERE placement IS NULL OR placement = ''").run();
db.prepare("UPDATE pages SET status = 'Active' WHERE status IS NULL OR status = ''").run();
db.prepare("UPDATE pages SET severity = 'Healthy' WHERE severity IS NULL OR severity = ''").run();
db.prepare("UPDATE pages SET discovery_source = 'crawl' WHERE discovery_source IS NULL OR discovery_source = ''").run();
db.prepare("UPDATE pages SET links_in = 0 WHERE links_in IS NULL").run();

console.log('Database initialized successfully');

module.exports = db;
