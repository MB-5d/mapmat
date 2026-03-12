const adapter = require('./dbAdapter');

function listMapsByUserAsync({ userId, projectId, limit, offset }) {
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

  return adapter.queryAllAsync(query, params);
}

async function countMapsByUserAsync({ userId, projectId }) {
  if (projectId) {
    return (await adapter.queryOneAsync(
      'SELECT COUNT(*) as count FROM maps WHERE user_id = ? AND project_id = ?',
      [userId, projectId]
    ))?.count || 0;
  }
  return (await adapter.queryOneAsync('SELECT COUNT(*) as count FROM maps WHERE user_id = ?', [userId]))?.count || 0;
}

function getMapWithProjectForUserAsync(mapId, userId) {
  return adapter.queryOneAsync(`
    SELECT m.*, p.name as project_name
    FROM maps m
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE m.id = ? AND m.user_id = ?
  `, [mapId, userId]);
}

function getMapForUserAsync(mapId, userId) {
  return adapter.queryOneAsync('SELECT * FROM maps WHERE id = ? AND user_id = ?', [mapId, userId]);
}

function getMapByIdAsync(mapId) {
  return adapter.queryOneAsync('SELECT * FROM maps WHERE id = ?', [mapId]);
}

function createMapAsync({
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
  return adapter.executeAsync(`
    INSERT INTO maps (id, user_id, project_id, name, notes, url, root_data, orphans_data, connections_data, colors, connection_colors)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
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
    connectionColors,
  ]);
}

async function updateMapByIdAsync(mapId, patch) {
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
  await adapter.executeAsync(`UPDATE maps SET ${updates.join(', ')} WHERE id = ?`, params);
  return true;
}

function deleteMapByIdAsync(mapId) {
  return adapter.executeAsync('DELETE FROM maps WHERE id = ?', [mapId]);
}

function listMapVersionsForUserMapAsync(mapId, userId, limit = 25) {
  return adapter.queryAllAsync(`
    SELECT * FROM map_versions
    WHERE map_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [mapId, userId, limit]);
}

async function getNextMapVersionNumberAsync(mapId, userId) {
  const row = await adapter.queryOneAsync(`
    SELECT MAX(version_number) as maxVersion
    FROM map_versions
    WHERE map_id = ? AND user_id = ?
  `, [mapId, userId]);
  return (row?.maxVersion || 0) + 1;
}

function createMapVersionAsync({
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
  return adapter.executeAsync(`
    INSERT INTO map_versions (
      id, map_id, user_id, version_number, name, notes,
      root_data, orphans_data, connections_data, colors, connection_colors
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
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
  ]);
}

function listMapVersionIdsForUserMapAsync(mapId, userId) {
  return adapter.queryAllAsync(`
    SELECT id FROM map_versions
    WHERE map_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `, [mapId, userId]);
}

async function deleteMapVersionsByIdsAsync(ids) {
  if (!ids || ids.length === 0) return 0;
  const placeholders = adapter.placeholders(ids.length);
  return (await adapter.executeAsync(`DELETE FROM map_versions WHERE id IN (${placeholders})`, ids)).changes || 0;
}

function getMapVersionByIdAsync(versionId) {
  return adapter.queryOneAsync('SELECT * FROM map_versions WHERE id = ?', [versionId]);
}

module.exports = {
  listMapsByUserAsync,
  countMapsByUserAsync,
  getMapWithProjectForUserAsync,
  getMapForUserAsync,
  getMapByIdAsync,
  createMapAsync,
  updateMapByIdAsync,
  deleteMapByIdAsync,
  listMapVersionsForUserMapAsync,
  getNextMapVersionNumberAsync,
  createMapVersionAsync,
  listMapVersionIdsForUserMapAsync,
  deleteMapVersionsByIdsAsync,
  getMapVersionByIdAsync,
};
