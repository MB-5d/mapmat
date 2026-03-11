const adapter = require('./dbAdapter');

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

  return adapter.queryAll(query, params);
}

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

function countMapsByUser({ userId, projectId }) {
  if (projectId) {
    return adapter.queryOne(
      'SELECT COUNT(*) as count FROM maps WHERE user_id = ? AND project_id = ?',
      [userId, projectId]
    )?.count || 0;
  }
  return adapter.queryOne('SELECT COUNT(*) as count FROM maps WHERE user_id = ?', [userId])?.count || 0;
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

function getMapWithProjectForUser(mapId, userId) {
  return adapter.queryOne(`
    SELECT m.*, p.name as project_name
    FROM maps m
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE m.id = ? AND m.user_id = ?
  `, [mapId, userId]);
}

function getMapWithProjectForUserAsync(mapId, userId) {
  return adapter.queryOneAsync(`
    SELECT m.*, p.name as project_name
    FROM maps m
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE m.id = ? AND m.user_id = ?
  `, [mapId, userId]);
}

function getMapForUser(mapId, userId) {
  return adapter.queryOne('SELECT * FROM maps WHERE id = ? AND user_id = ?', [mapId, userId]);
}

function getMapForUserAsync(mapId, userId) {
  return adapter.queryOneAsync('SELECT * FROM maps WHERE id = ? AND user_id = ?', [mapId, userId]);
}

function getMapById(mapId) {
  return adapter.queryOne('SELECT * FROM maps WHERE id = ?', [mapId]);
}

function getMapByIdAsync(mapId) {
  return adapter.queryOneAsync('SELECT * FROM maps WHERE id = ?', [mapId]);
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
  adapter.execute(`
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
  adapter.execute(`UPDATE maps SET ${updates.join(', ')} WHERE id = ?`, params);
  return true;
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

function deleteMapById(mapId) {
  adapter.execute('DELETE FROM maps WHERE id = ?', [mapId]);
}

function deleteMapByIdAsync(mapId) {
  return adapter.executeAsync('DELETE FROM maps WHERE id = ?', [mapId]);
}

function listMapVersionsForUserMap(mapId, userId, limit = 25) {
  return adapter.queryAll(`
    SELECT * FROM map_versions
    WHERE map_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [mapId, userId, limit]);
}

function listMapVersionsForUserMapAsync(mapId, userId, limit = 25) {
  return adapter.queryAllAsync(`
    SELECT * FROM map_versions
    WHERE map_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [mapId, userId, limit]);
}

function getNextMapVersionNumber(mapId, userId) {
  const row = adapter.queryOne(`
    SELECT MAX(version_number) as maxVersion
    FROM map_versions
    WHERE map_id = ? AND user_id = ?
  `, [mapId, userId]);
  return (row?.maxVersion || 0) + 1;
}

async function getNextMapVersionNumberAsync(mapId, userId) {
  const row = await adapter.queryOneAsync(`
    SELECT MAX(version_number) as maxVersion
    FROM map_versions
    WHERE map_id = ? AND user_id = ?
  `, [mapId, userId]);
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
  adapter.execute(`
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

function listMapVersionIdsForUserMap(mapId, userId) {
  return adapter.queryAll(`
    SELECT id FROM map_versions
    WHERE map_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `, [mapId, userId]);
}

function listMapVersionIdsForUserMapAsync(mapId, userId) {
  return adapter.queryAllAsync(`
    SELECT id FROM map_versions
    WHERE map_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `, [mapId, userId]);
}

function deleteMapVersionsByIds(ids) {
  if (!ids || ids.length === 0) return 0;
  const placeholders = adapter.placeholders(ids.length);
  return adapter.execute(`DELETE FROM map_versions WHERE id IN (${placeholders})`, ids).changes || 0;
}

async function deleteMapVersionsByIdsAsync(ids) {
  if (!ids || ids.length === 0) return 0;
  const placeholders = adapter.placeholders(ids.length);
  return (await adapter.executeAsync(`DELETE FROM map_versions WHERE id IN (${placeholders})`, ids)).changes || 0;
}

function getMapVersionById(versionId) {
  return adapter.queryOne('SELECT * FROM map_versions WHERE id = ?', [versionId]);
}

function getMapVersionByIdAsync(versionId) {
  return adapter.queryOneAsync('SELECT * FROM map_versions WHERE id = ?', [versionId]);
}

module.exports = {
  listMapsByUser,
  listMapsByUserAsync,
  countMapsByUser,
  countMapsByUserAsync,
  getMapWithProjectForUser,
  getMapWithProjectForUserAsync,
  getMapForUser,
  getMapForUserAsync,
  getMapById,
  getMapByIdAsync,
  createMap,
  createMapAsync,
  updateMapById,
  updateMapByIdAsync,
  deleteMapById,
  deleteMapByIdAsync,
  listMapVersionsForUserMap,
  listMapVersionsForUserMapAsync,
  getNextMapVersionNumber,
  getNextMapVersionNumberAsync,
  createMapVersion,
  createMapVersionAsync,
  listMapVersionIdsForUserMap,
  listMapVersionIdsForUserMapAsync,
  deleteMapVersionsByIds,
  deleteMapVersionsByIdsAsync,
  getMapVersionById,
  getMapVersionByIdAsync,
};
