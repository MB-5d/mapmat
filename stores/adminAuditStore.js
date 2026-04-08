const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

async function ensureColumnAsync(table, column, type) {
  let rows = [];

  if (adapter.runtime?.activeProvider === 'postgres') {
    rows = await adapter.queryAllAsync(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ?
    `, [table]);
  } else {
    rows = await adapter.queryAllAsync(`PRAGMA table_info(${table})`);
  }

  const columns = rows.map((row) => row.column_name || row.name).filter(Boolean);
  if (!columns.includes(column)) {
    await adapter.executeAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

async function ensureAdminAuditSchemaAsync() {
  if (ensureSchemaPromise) return ensureSchemaPromise;

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        actor_label TEXT NOT NULL,
        actor_ip TEXT,
        action TEXT NOT NULL,
        target_user_id TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
      `);
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_created ON admin_audit_logs(target_user_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at)'
    );
    await ensureColumnAsync('admin_audit_logs', 'actor_ip', 'TEXT');
    await ensureColumnAsync('admin_audit_logs', 'target_user_id', 'TEXT');
    await ensureColumnAsync('admin_audit_logs', 'metadata', 'TEXT');
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

async function logAdminActionAsync({
  actorLabel,
  actorIp = null,
  action,
  targetUserId = null,
  metadata = null,
}) {
  await ensureAdminAuditSchemaAsync();
  const id = uuidv4();
  const serializedMetadata = metadata ? JSON.stringify(metadata) : null;
  await adapter.executeAsync(
    `
      INSERT INTO admin_audit_logs (
        id,
        actor_label,
        actor_ip,
        action,
        target_user_id,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [id, actorLabel, actorIp, action, targetUserId, serializedMetadata]
  );
  return id;
}

module.exports = {
  ensureAdminAuditSchemaAsync,
  logAdminActionAsync,
};
