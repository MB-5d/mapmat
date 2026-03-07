const db = require('../db');

function listMapsByUser({ userId, projectId, limit, offset }) {
  let query = `
    SELECT m.*, p.name as project_name
    FROM maps m
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE m.user_id = ?
  `;
  const params = [userId];

  if (projectId) {
    query += ' AND m.project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY m.updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function countMapsByUser({ userId, projectId }) {
  if (projectId) {
    return db.prepare('SELECT COUNT(*) as count FROM maps WHERE user_id = ? AND project_id = ?')
      .get(userId, projectId)?.count || 0;
  }
  return db.prepare('SELECT COUNT(*) as count FROM maps WHERE user_id = ?')
    .get(userId)?.count || 0;
}

function getMapWithProjectForUser(mapId, userId) {
  return db.prepare(`
    SELECT m.*, p.name as project_name
    FROM maps m
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE m.id = ? AND m.user_id = ?
  `).get(mapId, userId) || null;
}

function getMapForUser(mapId, userId) {
  return db.prepare('SELECT * FROM maps WHERE id = ? AND user_id = ?').get(mapId, userId) || null;
}

function getMapById(mapId) {
  return db.prepare('SELECT * FROM maps WHERE id = ?').get(mapId) || null;
}

function createMap({
  id,
  userId,
  projectId,
  name,
  notes,
  url,
  rootData,
  orphansData,
  connectionsData,
  colors,
  connectionColors,
}) {
  db.prepare(`
    INSERT INTO maps (id, user_id, project_id, name, notes, url, root_data, orphans_data, connections_data, colors, connection_colors)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    projectId || null,
    name,
    notes,
    url,
    rootData,
    orphansData,
    connectionsData,
    colors,
    connectionColors
  );
}

function updateMapById(mapId, patch) {
  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    updates.push('name = ?');
    params.push(patch.name);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
    updates.push('notes = ?');
    params.push(patch.notes);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rootData')) {
    updates.push('root_data = ?');
    params.push(patch.rootData);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orphansData')) {
    updates.push('orphans_data = ?');
    params.push(patch.orphansData);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'connectionsData')) {
    updates.push('connections_data = ?');
    params.push(patch.connectionsData);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'colors')) {
    updates.push('colors = ?');
    params.push(patch.colors);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'connectionColors')) {
    updates.push('connection_colors = ?');
    params.push(patch.connectionColors);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'projectId')) {
    updates.push('project_id = ?');
    params.push(patch.projectId);
  }

  if (updates.length === 0) return false;

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(mapId);
  db.prepare(`UPDATE maps SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return true;
}

function deleteMapById(mapId) {
  db.prepare('DELETE FROM maps WHERE id = ?').run(mapId);
}

function listMapVersionsForUserMap(mapId, userId, limit = 25) {
  return db.prepare(`
    SELECT * FROM map_versions
    WHERE map_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(mapId, userId, limit);
}

function getNextMapVersionNumber(mapId, userId) {
  const row = db.prepare(`
    SELECT MAX(version_number) as maxVersion
    FROM map_versions
    WHERE map_id = ? AND user_id = ?
  `).get(mapId, userId);
  return (row?.maxVersion || 0) + 1;
}

function createMapVersion({
  id,
  mapId,
  userId,
  versionNumber,
  name,
  notes,
  rootData,
  orphansData,
  connectionsData,
  colors,
  connectionColors,
}) {
  db.prepare(`
    INSERT INTO map_versions (
      id, map_id, user_id, version_number, name, notes,
      root_data, orphans_data, connections_data, colors, connection_colors
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    mapId,
    userId,
    versionNumber,
    name,
    notes,
    rootData,
    orphansData,
    connectionsData,
    colors,
    connectionColors
  );
}

function listMapVersionIdsForUserMap(mapId, userId) {
  return db.prepare(`
    SELECT id FROM map_versions
    WHERE map_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).all(mapId, userId);
}

function deleteMapVersionsByIds(ids) {
  if (!ids || ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`DELETE FROM map_versions WHERE id IN (${placeholders})`).run(...ids).changes || 0;
}

function getMapVersionById(versionId) {
  return db.prepare('SELECT * FROM map_versions WHERE id = ?').get(versionId) || null;
}

module.exports = {
  listMapsByUser,
  countMapsByUser,
  getMapWithProjectForUser,
  getMapForUser,
  getMapById,
  createMap,
  updateMapById,
  deleteMapById,
  listMapVersionsForUserMap,
  getNextMapVersionNumber,
  createMapVersion,
  listMapVersionIdsForUserMap,
  deleteMapVersionsByIds,
  getMapVersionById,
};
