const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

const ITEM_STATUSES = new Set(['new', 'reviewed', 'themed', 'archived']);
const THEME_STATUSES = new Set(['watching', 'planned', 'in_progress', 'done', 'closed']);
const PRIORITY_BUCKETS = new Set(['low', 'medium', 'high', 'critical']);
const SEVERITY_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const ITEM_INTENTS = new Set(['broken', 'confusing', 'idea', 'like', 'dislike']);
const ITEM_SCOPES = new Set(['whole_app', 'flow', 'specific_thing']);

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

function normalizeNullableString(value, { maxLength = null } = {}) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeRequiredString(value, { maxLength = null } = {}) {
  const normalized = normalizeNullableString(value, { maxLength });
  return normalized || '';
}

function normalizeEnum(value, allowedSet, fallback) {
  const normalized = normalizeNullableString(value, { maxLength: 64 });
  if (!normalized) return fallback;
  return allowedSet.has(normalized) ? normalized : fallback;
}

function normalizeRating(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, 1), 5);
}

function serializeJson(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  return JSON.stringify(value);
}

function buildItemWhereClause(filters = {}, params = []) {
  const clauses = [];
  const query = normalizeNullableString(filters.query);

  if (filters.triageStatus) {
    clauses.push('i.triage_status = ?');
    params.push(filters.triageStatus);
  }

  if (filters.intent) {
    clauses.push('i.intent = ?');
    params.push(filters.intent);
  }

  if (filters.scope) {
    clauses.push('i.scope = ?');
    params.push(filters.scope);
  }

  if (filters.componentKey) {
    clauses.push('i.component_key = ?');
    params.push(filters.componentKey);
  }

  if (filters.themeId) {
    clauses.push('i.theme_id = ?');
    params.push(filters.themeId);
  }

  if (filters.hasTheme === true) {
    clauses.push('i.theme_id IS NOT NULL');
  } else if (filters.hasTheme === false) {
    clauses.push('i.theme_id IS NULL');
  }

  if (query) {
    const like = `%${query.toLowerCase()}%`;
    clauses.push(`(
      LOWER(COALESCE(i.message, '')) LIKE ?
      OR LOWER(COALESCE(i.actor_name, '')) LIKE ?
      OR LOWER(COALESCE(i.actor_email, '')) LIKE ?
      OR LOWER(COALESCE(i.component_label, '')) LIKE ?
      OR LOWER(COALESCE(i.component_key, '')) LIKE ?
      OR LOWER(COALESCE(i.route_path, '')) LIKE ?
      OR LOWER(COALESCE(t.title, '')) LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

function buildThemeWhereClause(filters = {}, params = []) {
  const clauses = [];
  const query = normalizeNullableString(filters.query);

  if (filters.status) {
    clauses.push('t.status = ?');
    params.push(filters.status);
  }

  if (filters.priorityBucket) {
    clauses.push('t.priority_bucket = ?');
    params.push(filters.priorityBucket);
  }

  if (filters.severity) {
    clauses.push('t.severity = ?');
    params.push(filters.severity);
  }

  if (query) {
    const like = `%${query.toLowerCase()}%`;
    clauses.push(`(
      LOWER(COALESCE(t.title, '')) LIKE ?
      OR LOWER(COALESCE(t.summary, '')) LIKE ?
      OR LOWER(COALESCE(t.owner_label, '')) LIKE ?
      OR LOWER(COALESCE(t.external_tracker_url, '')) LIKE ?
    )`);
    params.push(like, like, like, like);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

async function ensureFeedbackSchemaAsync() {
  if (ensureSchemaPromise) {
    return ensureSchemaPromise;
  }

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS feedback_themes (
        id TEXT PRIMARY KEY,
        normalized_title TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        severity TEXT NOT NULL DEFAULT 'medium',
        feedback_count INTEGER NOT NULL DEFAULT 0,
        priority_bucket TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'watching',
        owner_label TEXT,
        external_tracker_type TEXT,
        external_tracker_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS feedback_items (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        actor_name TEXT,
        actor_email TEXT,
        surface TEXT NOT NULL,
        route_path TEXT,
        route_section TEXT,
        map_id TEXT,
        share_id TEXT,
        scope TEXT NOT NULL,
        intent TEXT NOT NULL,
        rating INTEGER,
        message TEXT NOT NULL,
        component_key TEXT,
        component_label TEXT,
        dom_hint_json TEXT,
        screenshot_path TEXT,
        allow_follow_up INTEGER NOT NULL DEFAULT 0,
        triage_status TEXT NOT NULL DEFAULT 'new',
        theme_id TEXT,
        context_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE SET NULL,
        FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE SET NULL,
        FOREIGN KEY (theme_id) REFERENCES feedback_themes(id) ON DELETE SET NULL
      )
    `);

    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_feedback_items_created ON feedback_items(created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_feedback_items_status_created ON feedback_items(triage_status, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_feedback_items_theme_created ON feedback_items(theme_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_feedback_items_component_created ON feedback_items(component_key, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_feedback_themes_status_priority ON feedback_themes(status, priority_bucket, feedback_count)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_feedback_themes_normalized_title ON feedback_themes(normalized_title)'
    );

    await ensureColumnAsync('feedback_themes', 'feedback_count', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumnAsync('feedback_themes', 'external_tracker_type', 'TEXT');
    await ensureColumnAsync('feedback_themes', 'external_tracker_url', 'TEXT');
    await ensureColumnAsync('feedback_items', 'theme_id', 'TEXT');
    await ensureColumnAsync('feedback_items', 'context_json', 'TEXT');
    await ensureColumnAsync('feedback_items', 'dom_hint_json', 'TEXT');
    await ensureColumnAsync('feedback_items', 'screenshot_path', 'TEXT');
    await ensureColumnAsync('feedback_items', 'allow_follow_up', 'INTEGER NOT NULL DEFAULT 0');
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

async function createFeedbackItemAsync({
  id = null,
  actorUserId = null,
  actorName = null,
  actorEmail = null,
  surface,
  routePath = null,
  routeSection = null,
  mapId = null,
  shareId = null,
  scope = 'whole_app',
  intent = 'idea',
  rating = null,
  message,
  componentKey = null,
  componentLabel = null,
  domHint = null,
  screenshotPath = null,
  allowFollowUp = false,
  triageStatus = 'new',
  themeId = null,
  context = null,
  createdAt = null,
  updatedAt = null,
}) {
  const itemId = id || uuidv4();
  const effectiveCreatedAt = createdAt || new Date().toISOString();
  const effectiveUpdatedAt = updatedAt || effectiveCreatedAt;

  await adapter.executeAsync(`
    INSERT INTO feedback_items (
      id,
      actor_user_id,
      actor_name,
      actor_email,
      surface,
      route_path,
      route_section,
      map_id,
      share_id,
      scope,
      intent,
      rating,
      message,
      component_key,
      component_label,
      dom_hint_json,
      screenshot_path,
      allow_follow_up,
      triage_status,
      theme_id,
      context_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    itemId,
    normalizeNullableString(actorUserId, { maxLength: 120 }),
    normalizeNullableString(actorName, { maxLength: 160 }),
    normalizeNullableString(actorEmail, { maxLength: 240 }),
    normalizeRequiredString(surface, { maxLength: 64 }),
    normalizeNullableString(routePath, { maxLength: 512 }),
    normalizeNullableString(routeSection, { maxLength: 64 }),
    normalizeNullableString(mapId, { maxLength: 120 }),
    normalizeNullableString(shareId, { maxLength: 120 }),
    normalizeEnum(scope, ITEM_SCOPES, 'whole_app'),
    normalizeEnum(intent, ITEM_INTENTS, 'idea'),
    normalizeRating(rating),
    normalizeRequiredString(message, { maxLength: 4000 }),
    normalizeNullableString(componentKey, { maxLength: 160 }),
    normalizeNullableString(componentLabel, { maxLength: 240 }),
    serializeJson(domHint),
    normalizeNullableString(screenshotPath, { maxLength: 512 }),
    allowFollowUp ? 1 : 0,
    normalizeEnum(triageStatus, ITEM_STATUSES, 'new'),
    normalizeNullableString(themeId, { maxLength: 120 }),
    serializeJson(context),
    effectiveCreatedAt,
    effectiveUpdatedAt,
  ]);

  if (themeId) {
    await syncFeedbackThemeCountsAsync([themeId]);
  }

  return getFeedbackItemByIdAsync(itemId);
}

function buildFeedbackItemUpdateSql(updates = {}) {
  const statements = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(updates, 'triageStatus')) {
    statements.push('triage_status = ?');
    params.push(normalizeEnum(updates.triageStatus, ITEM_STATUSES, 'new'));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'themeId')) {
    statements.push('theme_id = ?');
    params.push(normalizeNullableString(updates.themeId, { maxLength: 120 }));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'componentKey')) {
    statements.push('component_key = ?');
    params.push(normalizeNullableString(updates.componentKey, { maxLength: 160 }));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'componentLabel')) {
    statements.push('component_label = ?');
    params.push(normalizeNullableString(updates.componentLabel, { maxLength: 240 }));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'domHint')) {
    statements.push('dom_hint_json = ?');
    params.push(serializeJson(updates.domHint));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'context')) {
    statements.push('context_json = ?');
    params.push(serializeJson(updates.context));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'screenshotPath')) {
    statements.push('screenshot_path = ?');
    params.push(normalizeNullableString(updates.screenshotPath, { maxLength: 512 }));
  }

  if (statements.length === 0) return null;
  statements.push('updated_at = ?');
  params.push(new Date().toISOString());
  return { statements, params };
}

async function updateFeedbackItemAsync(itemId, updates = {}) {
  const compiled = buildFeedbackItemUpdateSql(updates);
  if (!compiled) return getFeedbackItemByIdAsync(itemId);

  const { statements, params } = compiled;
  params.push(itemId);
  await adapter.executeAsync(`
    UPDATE feedback_items
    SET ${statements.join(', ')}
    WHERE id = ?
  `, params);

  return getFeedbackItemByIdAsync(itemId);
}

function buildFeedbackThemeUpdateSql(updates = {}) {
  const statements = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(updates, 'title')) {
    const title = normalizeRequiredString(updates.title, { maxLength: 180 });
    statements.push('title = ?');
    statements.push('normalized_title = ?');
    params.push(title, title.toLowerCase());
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'summary')) {
    statements.push('summary = ?');
    params.push(normalizeNullableString(updates.summary, { maxLength: 2000 }));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'severity')) {
    statements.push('severity = ?');
    params.push(normalizeEnum(updates.severity, SEVERITY_LEVELS, 'medium'));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'priorityBucket')) {
    statements.push('priority_bucket = ?');
    params.push(normalizeEnum(updates.priorityBucket, PRIORITY_BUCKETS, 'medium'));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    statements.push('status = ?');
    params.push(normalizeEnum(updates.status, THEME_STATUSES, 'watching'));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'ownerLabel')) {
    statements.push('owner_label = ?');
    params.push(normalizeNullableString(updates.ownerLabel, { maxLength: 180 }));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'externalTrackerType')) {
    statements.push('external_tracker_type = ?');
    params.push(normalizeNullableString(updates.externalTrackerType, { maxLength: 64 }));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'externalTrackerUrl')) {
    statements.push('external_tracker_url = ?');
    params.push(normalizeNullableString(updates.externalTrackerUrl, { maxLength: 512 }));
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'feedbackCount')) {
    const nextCount = Number.parseInt(updates.feedbackCount, 10);
    statements.push('feedback_count = ?');
    params.push(Number.isFinite(nextCount) ? Math.max(nextCount, 0) : 0);
  }

  if (statements.length === 0) return null;
  statements.push('updated_at = ?');
  params.push(new Date().toISOString());
  return { statements, params };
}

async function createFeedbackThemeAsync({
  id = null,
  title,
  summary = null,
  severity = 'medium',
  feedbackCount = 0,
  priorityBucket = 'medium',
  status = 'watching',
  ownerLabel = null,
  externalTrackerType = null,
  externalTrackerUrl = null,
  createdAt = null,
  updatedAt = null,
}) {
  const themeId = id || uuidv4();
  const normalizedTitle = normalizeRequiredString(title, { maxLength: 180 });
  const effectiveCreatedAt = createdAt || new Date().toISOString();
  const effectiveUpdatedAt = updatedAt || effectiveCreatedAt;

  await adapter.executeAsync(`
    INSERT INTO feedback_themes (
      id,
      normalized_title,
      title,
      summary,
      severity,
      feedback_count,
      priority_bucket,
      status,
      owner_label,
      external_tracker_type,
      external_tracker_url,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    themeId,
    normalizedTitle.toLowerCase(),
    normalizedTitle,
    normalizeNullableString(summary, { maxLength: 2000 }),
    normalizeEnum(severity, SEVERITY_LEVELS, 'medium'),
    Math.max(Number.parseInt(feedbackCount, 10) || 0, 0),
    normalizeEnum(priorityBucket, PRIORITY_BUCKETS, 'medium'),
    normalizeEnum(status, THEME_STATUSES, 'watching'),
    normalizeNullableString(ownerLabel, { maxLength: 180 }),
    normalizeNullableString(externalTrackerType, { maxLength: 64 }),
    normalizeNullableString(externalTrackerUrl, { maxLength: 512 }),
    effectiveCreatedAt,
    effectiveUpdatedAt,
  ]);

  return getFeedbackThemeByIdAsync(themeId);
}

async function updateFeedbackThemeAsync(themeId, updates = {}) {
  const compiled = buildFeedbackThemeUpdateSql(updates);
  if (!compiled) return getFeedbackThemeByIdAsync(themeId);

  const { statements, params } = compiled;
  params.push(themeId);
  await adapter.executeAsync(`
    UPDATE feedback_themes
    SET ${statements.join(', ')}
    WHERE id = ?
  `, params);

  return getFeedbackThemeByIdAsync(themeId);
}

async function getFeedbackItemByIdAsync(itemId) {
  return adapter.queryOneAsync(`
    SELECT
      i.*,
      t.title AS theme_title,
      t.status AS theme_status,
      t.priority_bucket AS theme_priority_bucket
    FROM feedback_items i
    LEFT JOIN feedback_themes t ON t.id = i.theme_id
    WHERE i.id = ?
  `, [itemId]);
}

async function getFeedbackThemeByIdAsync(themeId) {
  return adapter.queryOneAsync(`
    SELECT
      t.*,
      MAX(i.created_at) AS last_feedback_at,
      AVG(CASE WHEN i.rating BETWEEN 1 AND 5 THEN i.rating END) AS average_rating
    FROM feedback_themes t
    LEFT JOIN feedback_items i ON i.theme_id = t.id
    WHERE t.id = ?
    GROUP BY
      t.id,
      t.normalized_title,
      t.title,
      t.summary,
      t.severity,
      t.feedback_count,
      t.priority_bucket,
      t.status,
      t.owner_label,
      t.external_tracker_type,
      t.external_tracker_url,
      t.created_at,
      t.updated_at
  `, [themeId]);
}

async function listFeedbackItemsAsync(filters = {}) {
  const params = [];
  const whereClause = buildItemWhereClause(filters, params);
  const limit = filters.limit !== undefined && filters.limit !== null
    ? Math.min(Math.max(Number.parseInt(filters.limit, 10) || 0, 1), 1000)
    : null;
  const offset = Number.isFinite(Number.parseInt(filters.offset, 10))
    ? Math.max(Number.parseInt(filters.offset, 10), 0)
    : 0;

  let sql = `
    SELECT
      i.*,
      t.title AS theme_title,
      t.status AS theme_status,
      t.priority_bucket AS theme_priority_bucket
    FROM feedback_items i
    LEFT JOIN feedback_themes t ON t.id = i.theme_id
    ${whereClause}
    ORDER BY i.created_at DESC, i.id DESC
  `;

  if (limit) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  return adapter.queryAllAsync(sql, params);
}

async function countFeedbackItemsAsync(filters = {}) {
  const params = [];
  const whereClause = buildItemWhereClause(filters, params);
  const row = await adapter.queryOneAsync(`
    SELECT COUNT(*) AS count
    FROM feedback_items i
    LEFT JOIN feedback_themes t ON t.id = i.theme_id
    ${whereClause}
  `, params);
  return Number(row?.count || 0);
}

async function listFeedbackThemesAsync(filters = {}) {
  const params = [];
  const whereClause = buildThemeWhereClause(filters, params);
  const limit = filters.limit !== undefined && filters.limit !== null
    ? Math.min(Math.max(Number.parseInt(filters.limit, 10) || 0, 1), 1000)
    : null;
  const offset = Number.isFinite(Number.parseInt(filters.offset, 10))
    ? Math.max(Number.parseInt(filters.offset, 10), 0)
    : 0;

  let sql = `
    SELECT
      t.*,
      MAX(i.created_at) AS last_feedback_at,
      AVG(CASE WHEN i.rating BETWEEN 1 AND 5 THEN i.rating END) AS average_rating
    FROM feedback_themes t
    LEFT JOIN feedback_items i ON i.theme_id = t.id
    ${whereClause}
    GROUP BY
      t.id,
      t.normalized_title,
      t.title,
      t.summary,
      t.severity,
      t.feedback_count,
      t.priority_bucket,
      t.status,
      t.owner_label,
      t.external_tracker_type,
      t.external_tracker_url,
      t.created_at,
      t.updated_at
    ORDER BY t.feedback_count DESC, t.updated_at DESC, t.id DESC
  `;

  if (limit) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  return adapter.queryAllAsync(sql, params);
}

async function countFeedbackThemesAsync(filters = {}) {
  const params = [];
  const whereClause = buildThemeWhereClause(filters, params);
  const row = await adapter.queryOneAsync(`
    SELECT COUNT(*) AS count
    FROM feedback_themes t
    ${whereClause}
  `, params);
  return Number(row?.count || 0);
}

async function countFeedbackItemsForThemeAsync(themeId) {
  const row = await adapter.queryOneAsync(
    'SELECT COUNT(*) AS count FROM feedback_items WHERE theme_id = ?',
    [themeId]
  );
  return Number(row?.count || 0);
}

async function syncFeedbackThemeCountsAsync(themeIds = []) {
  const uniqueThemeIds = Array.from(new Set(
    (Array.isArray(themeIds) ? themeIds : [themeIds])
      .map((value) => normalizeNullableString(value, { maxLength: 120 }))
      .filter(Boolean)
  ));

  for (const themeId of uniqueThemeIds) {
    const count = await countFeedbackItemsForThemeAsync(themeId);
    await updateFeedbackThemeAsync(themeId, { feedbackCount: count });
  }
}

module.exports = {
  ITEM_STATUSES,
  THEME_STATUSES,
  PRIORITY_BUCKETS,
  SEVERITY_LEVELS,
  ITEM_INTENTS,
  ITEM_SCOPES,
  ensureFeedbackSchemaAsync,
  createFeedbackItemAsync,
  updateFeedbackItemAsync,
  getFeedbackItemByIdAsync,
  listFeedbackItemsAsync,
  countFeedbackItemsAsync,
  createFeedbackThemeAsync,
  updateFeedbackThemeAsync,
  getFeedbackThemeByIdAsync,
  listFeedbackThemesAsync,
  countFeedbackThemesAsync,
  syncFeedbackThemeCountsAsync,
};
