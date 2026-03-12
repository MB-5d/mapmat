const adapter = require('./dbAdapter');

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

function createProjectAsync({ id, userId, name }) {
  return adapter.executeAsync(`
    INSERT INTO projects (id, user_id, name)
    VALUES (?, ?, ?)
  `, [id, userId, name]);
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
  listProjectsByUserAsync,
  countProjectsByUserAsync,
  createProjectAsync,
  getProjectForUserAsync,
  getProjectByIdAsync,
  updateProjectNameAsync,
  countMapsByProjectAsync,
  deleteProjectAsync,
};
