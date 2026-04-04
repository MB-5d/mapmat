const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');
const db = require('../db');

let ensureSchemaPromise = null;

async function ensureAdminAuditSchemaAsync() {
  if (ensureSchemaPromise) return ensureSchemaPromise;

  ensureSchemaPromise = (async () => {
    if (adapter.runtime?.activeProvider === 'postgres') {
      await adapter.executeAsync(`
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id TEXT PRIMARY KEY,
          actor_label TEXT NOT NULL,
          actor_ip TEXT,
          action TEXT NOT NULL,
          target_user_id TEXT,
          metadata TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await adapter.executeAsync('ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS actor_ip TEXT');
      await adapter.executeAsync('ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS target_user_id TEXT');
      await adapter.executeAsync('ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS metadata TEXT');
      await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_created ON admin_audit_logs(target_user_id, created_at)');
      await adapter.executeAsync('CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at)');
      return;
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        actor_label TEXT NOT NULL,
        actor_ip TEXT,
        action TEXT NOT NULL,
        target_user_id TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_created
      ON admin_audit_logs(target_user_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
      ON admin_audit_logs(created_at);
    `);

    const columns = db.prepare('PRAGMA table_info(admin_audit_logs)').all().map((column) => column.name);
    if (!columns.includes('actor_ip')) {
      db.exec('ALTER TABLE admin_audit_logs ADD COLUMN actor_ip TEXT');
    }
    if (!columns.includes('target_user_id')) {
      db.exec('ALTER TABLE admin_audit_logs ADD COLUMN target_user_id TEXT');
    }
    if (!columns.includes('metadata')) {
      db.exec('ALTER TABLE admin_audit_logs ADD COLUMN metadata TEXT');
    }
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
