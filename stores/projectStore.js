const adapter = require('./dbAdapter');

let ensureProjectBillingSchemaPromise = null;

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

async function ensureProjectBillingSchemaAsync() {
  if (ensureProjectBillingSchemaPromise) return ensureProjectBillingSchemaPromise;
  ensureProjectBillingSchemaPromise = (async () => {
    await ensureColumnAsync('projects', 'account_id', 'TEXT');
    await ensureColumnAsync('projects', 'status', "TEXT NOT NULL DEFAULT 'active'");
    await ensureColumnAsync('projects', 'archived_at', 'TIMESTAMP');
  })();
  try {
    await ensureProjectBillingSchemaPromise;
  } catch (error) {
    ensureProjectBillingSchemaPromise = null;
    throw error;
  }
}

function listProjectsByUserAsync(userId, { limit, offset }) {
  return adapter.queryAllAsync(`
    SELECT p.*,
      (SELECT COUNT(*) FROM maps WHERE project_id = p.id) as map_count
    FROM projects p
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, limit, offset]);
}

async function countProjectsByUserAsync(userId) {
  return (await adapter.queryOneAsync('SELECT COUNT(*) as count FROM projects WHERE user_id = ?', [userId]))?.count || 0;
}

async function createProjectAsync({ id, userId, accountId = null, name }) {
  await ensureProjectBillingSchemaAsync();
  return adapter.executeAsync(`
    INSERT INTO projects (id, user_id, account_id, name)
    VALUES (?, ?, ?, ?)
  `, [id, userId, accountId, name]);
}

function getProjectForUserAsync(projectId, userId) {
  return adapter.queryOneAsync('SELECT * FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
}

function getProjectByIdAsync(projectId) {
  return adapter.queryOneAsync('SELECT * FROM projects WHERE id = ?', [projectId]);
}

function updateProjectNameAsync(projectId, name) {
  return adapter.executeAsync(`
    UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, projectId]);
}

async function countMapsByProjectAsync(projectId) {
  return (await adapter.queryOneAsync('SELECT COUNT(*) as count FROM maps WHERE project_id = ?', [projectId]))?.count || 0;
}

function deleteProjectAsync(projectId) {
  return adapter.executeAsync('DELETE FROM projects WHERE id = ?', [projectId]);
}

module.exports = {
  ensureProjectBillingSchemaAsync,
  listProjectsByUserAsync,
  countProjectsByUserAsync,
  createProjectAsync,
  getProjectForUserAsync,
  getProjectByIdAsync,
  updateProjectNameAsync,
  countMapsByProjectAsync,
  deleteProjectAsync,
};
