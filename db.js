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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
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
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Shares table (for sharing maps via link)
  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    map_id TEXT,
    user_id TEXT NOT NULL,
    root_data TEXT NOT NULL,
    colors TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    view_count INTEGER DEFAULT 0,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Create indexes for faster queries
  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
  CREATE INDEX IF NOT EXISTS idx_maps_user ON maps(user_id);
  CREATE INDEX IF NOT EXISTS idx_maps_project ON maps(project_id);
  CREATE INDEX IF NOT EXISTS idx_history_user ON scan_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
`);

console.log('Database initialized successfully');

module.exports = db;
