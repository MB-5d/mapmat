const db = require('../db');

function listProjectsByUser(userId, { limit, offset }) {
  return db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM maps WHERE project_id = p.id) as map_count
    FROM projects p
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

function countProjectsByUser(userId) {
  return db.prepare('SELECT COUNT(*) as count FROM projects WHERE user_id = ?').get(userId)?.count || 0;
}

function createProject({ id, userId, name }) {
  db.prepare(`
    INSERT INTO projects (id, user_id, name)
    VALUES (?, ?, ?)
  `).run(id, userId, name);
}

function getProjectForUser(projectId, userId) {
  return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId) || null;
}

function getProjectById(projectId) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) || null;
}

function updateProjectName(projectId, name) {
  db.prepare(`
    UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, projectId);
}

function countMapsByProject(projectId) {
  return db.prepare('SELECT COUNT(*) as count FROM maps WHERE project_id = ?').get(projectId)?.count || 0;
}

function deleteProject(projectId) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
}

module.exports = {
  listProjectsByUser,
  countProjectsByUser,
  createProject,
  getProjectForUser,
  getProjectById,
  updateProjectName,
  countMapsByProject,
  deleteProject,
};
