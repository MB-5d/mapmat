const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeMentions(mentions) {
  if (!Array.isArray(mentions)) return [];
  return mentions
    .map((mention) => normalizeNullableString(mention))
    .filter(Boolean);
}

async function ensureMapCommentSchemaAsync() {
  if (ensureSchemaPromise) {
    return ensureSchemaPromise;
  }

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS map_comments (
        id TEXT PRIMARY KEY,
        map_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        parent_comment_id TEXT,
        author_user_id TEXT,
        author_name TEXT,
        author_email TEXT,
        text TEXT NOT NULL,
        mentions TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        completed_by_user_id TEXT,
        completed_by_name TEXT,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES map_comments(id) ON DELETE CASCADE,
        FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_comments_map_created ON map_comments(map_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_comments_node_created ON map_comments(map_id, node_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_map_comments_parent_created ON map_comments(parent_comment_id, created_at)'
    );
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

function serializeStoredMentions(mentions) {
  return JSON.stringify(normalizeMentions(mentions));
}

function listCommentsByMapAsync(mapId) {
  return adapter.queryAllAsync(`
    SELECT *
    FROM map_comments
    WHERE map_id = ?
    ORDER BY created_at ASC, id ASC
  `, [mapId]);
}

function getCommentByIdAsync(commentId) {
  return adapter.queryOneAsync('SELECT * FROM map_comments WHERE id = ?', [commentId]);
}

async function countCommentsByMapAsync(mapId) {
  const row = await adapter.queryOneAsync(
    'SELECT COUNT(*) AS count FROM map_comments WHERE map_id = ?',
    [mapId]
  );
  return Number(row?.count || 0);
}

async function createCommentAsync({
  id = null,
  mapId,
  nodeId,
  parentCommentId = null,
  authorUserId = null,
  authorName = null,
  authorEmail = null,
  text,
  mentions = [],
  completed = false,
  completedByUserId = null,
  completedByName = null,
  completedAt = null,
  createdAt = null,
  updatedAt = null,
}) {
  const commentId = id || uuidv4();
  const effectiveCreatedAt = createdAt || new Date().toISOString();
  const effectiveUpdatedAt = updatedAt || effectiveCreatedAt;

  await adapter.executeAsync(`
    INSERT INTO map_comments (
      id, map_id, node_id, parent_comment_id, author_user_id, author_name, author_email,
      text, mentions, completed, completed_by_user_id, completed_by_name, completed_at,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    commentId,
    mapId,
    nodeId,
    normalizeNullableString(parentCommentId),
    normalizeNullableString(authorUserId),
    normalizeNullableString(authorName),
    normalizeNullableString(authorEmail),
    String(text || '').trim(),
    serializeStoredMentions(mentions),
    completed ? 1 : 0,
    normalizeNullableString(completedByUserId),
    normalizeNullableString(completedByName),
    normalizeNullableString(completedAt),
    effectiveCreatedAt,
    effectiveUpdatedAt,
  ]);

  return getCommentByIdAsync(commentId);
}

async function replaceCommentTextAsync({ commentId, text, mentions = [] }) {
  await adapter.executeAsync(`
    UPDATE map_comments
    SET text = ?,
      mentions = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [String(text || '').trim(), serializeStoredMentions(mentions), commentId]);

  return getCommentByIdAsync(commentId);
}

async function setCommentCompletedAsync({
  commentId,
  completed,
  completedByUserId = null,
  completedByName = null,
  completedAt = null,
}) {
  await adapter.executeAsync(`
    UPDATE map_comments
    SET completed = ?,
      completed_by_user_id = ?,
      completed_by_name = ?,
      completed_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    completed ? 1 : 0,
    completed ? normalizeNullableString(completedByUserId) : null,
    completed ? normalizeNullableString(completedByName) : null,
    completed ? normalizeNullableString(completedAt || new Date().toISOString()) : null,
    commentId,
  ]);

  return getCommentByIdAsync(commentId);
}

async function listCommentThreadIdsAsync(commentId, mapId) {
  const rows = await adapter.queryAllAsync(`
    WITH RECURSIVE thread(id) AS (
      SELECT id
      FROM map_comments
      WHERE id = ? AND map_id = ?
      UNION ALL
      SELECT c.id
      FROM map_comments c
      INNER JOIN thread t ON c.parent_comment_id = t.id
      WHERE c.map_id = ?
    )
    SELECT id FROM thread
  `, [commentId, mapId, mapId]);
  return rows.map((row) => row.id);
}

async function deleteCommentThreadAsync(commentId, mapId) {
  const ids = await listCommentThreadIdsAsync(commentId, mapId);
  if (ids.length === 0) return 0;
  const placeholders = adapter.placeholders(ids.length);
  return (await adapter.executeAsync(
    `DELETE FROM map_comments WHERE id IN (${placeholders})`,
    ids
  )).changes || 0;
}

const importLegacyCommentsAsync = adapter.transactionAsync(async ({
  mapId,
  comments,
}) => {
  for (const comment of comments) {
    await createCommentAsync(comment);
  }
  return countCommentsByMapAsync(mapId);
});

module.exports = {
  ensureMapCommentSchemaAsync,
  listCommentsByMapAsync,
  getCommentByIdAsync,
  countCommentsByMapAsync,
  createCommentAsync,
  replaceCommentTextAsync,
  setCommentCompletedAsync,
  deleteCommentThreadAsync,
  importLegacyCommentsAsync,
};
