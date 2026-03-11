const adapter = require('./dbAdapter');

function listProjectsByUser(userId, { limit, offset }) {
  return adapter.queryAll(`
    SELECT p.*,
      (SELECT COUNT(*) FROM maps WHERE project_id = p.id) as map_count
    FROM projects p
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `, [userId, limit, offset]);
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

function countProjectsByUser(userId) {
  return adapter.queryOne('SELECT COUNT(*) as count FROM projects WHERE user_id = ?', [userId])?.count || 0;
}

async function countProjectsByUserAsync(userId) {
  return (await adapter.queryOneAsync('SELECT COUNT(*) as count FROM projects WHERE user_id = ?', [userId]))?.count || 0;
}

function createProject({ id, userId, name }) {
  adapter.execute(`
    INSERT INTO projects (id, user_id, name)
    VALUES (?, ?, ?)
  `, [id, userId, name]);
}

function createProjectAsync({ id, userId, name }) {
  return adapter.executeAsync(`
    INSERT INTO projects (id, user_id, name)
    VALUES (?, ?, ?)
  `, [id, userId, name]);
}

function getProjectForUser(projectId, userId) {
  return adapter.queryOne('SELECT * FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
}

function getProjectForUserAsync(projectId, userId) {
  return adapter.queryOneAsync('SELECT * FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
}

function getProjectById(projectId) {
  return adapter.queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
}

function getProjectByIdAsync(projectId) {
  return adapter.queryOneAsync('SELECT * FROM projects WHERE id = ?', [projectId]);
}

function updateProjectName(projectId, name) {
  adapter.execute(`
    UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, projectId]);
}

function updateProjectNameAsync(projectId, name) {
  return adapter.executeAsync(`
    UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, projectId]);
}

function countMapsByProject(projectId) {
  return adapter.queryOne('SELECT COUNT(*) as count FROM maps WHERE project_id = ?', [projectId])?.count || 0;
}

async function countMapsByProjectAsync(projectId) {
  return (await adapter.queryOneAsync('SELECT COUNT(*) as count FROM maps WHERE project_id = ?', [projectId]))?.count || 0;
}

function deleteProject(projectId) {
  adapter.execute('DELETE FROM projects WHERE id = ?', [projectId]);
}

function deleteProjectAsync(projectId) {
  return adapter.executeAsync('DELETE FROM projects WHERE id = ?', [projectId]);
}

module.exports = {
  listProjectsByUser,
  listProjectsByUserAsync,
  countProjectsByUser,
  countProjectsByUserAsync,
  createProject,
  createProjectAsync,
  getProjectForUser,
  getProjectForUserAsync,
  getProjectById,
  getProjectByIdAsync,
  updateProjectName,
  updateProjectNameAsync,
  countMapsByProject,
  countMapsByProjectAsync,
  deleteProject,
  deleteProjectAsync,
};
