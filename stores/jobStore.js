const adapter = require('./dbAdapter');

let ensureJobSchemaPromise = null;
const JOB_IDENTITY_COLUMNS = new Set(['user_id', 'api_key', 'ip_hash']);

async function ensureColumnAsync(table, column, type) {
  if (adapter.runtime?.activeProvider === 'postgres') {
    await adapter.executeAsync(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
    return;
  }

  const rows = await adapter.queryAllAsync(`PRAGMA table_info(${table})`);
  const columns = rows.map((row) => row.column_name || row.name).filter(Boolean);
  if (!columns.includes(column)) {
    await adapter.executeAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

async function ensureJobSchemaAsync() {
  if (ensureJobSchemaPromise) return ensureJobSchemaPromise;

  ensureJobSchemaPromise = (async () => {
    await ensureColumnAsync('jobs', 'idempotency_key', 'TEXT');
    await ensureColumnAsync('jobs', 'request_url', 'TEXT');
    await adapter.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_jobs_user_idempotency
      ON jobs(type, user_id, idempotency_key, request_url, status)
      WHERE idempotency_key IS NOT NULL AND user_id IS NOT NULL
    `);
    await adapter.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_jobs_api_key_idempotency
      ON jobs(type, api_key, idempotency_key, request_url, status)
      WHERE idempotency_key IS NOT NULL AND api_key IS NOT NULL
    `);
    await adapter.executeAsync(`
      CREATE INDEX IF NOT EXISTS idx_jobs_ip_idempotency
      ON jobs(type, ip_hash, idempotency_key, request_url, status)
      WHERE idempotency_key IS NOT NULL AND ip_hash IS NOT NULL
    `);
  })();

  try {
    await ensureJobSchemaPromise;
  } catch (error) {
    ensureJobSchemaPromise = null;
    throw error;
  }
}

function getJobByIdAsync(id) {
  return adapter.queryOneAsync('SELECT * FROM jobs WHERE id = ?', [id]);
}

function listJobPayloadsByTypeAndStatusesAsync(type, statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return Promise.resolve([]);
  const placeholders = statuses.map(() => '?').join(', ');
  return adapter.queryAllAsync(`
    SELECT id, type, status, created_at, started_at, user_id, api_key, ip_hash, payload, progress, result, error
    FROM jobs
    WHERE type = ? AND status IN (${placeholders})
    ORDER BY created_at ASC
  `, [type, ...statuses]);
}

async function insertJobAsync({
  id,
  type,
  status,
  startedAt,
  userId,
  apiKey,
  ipHash,
  payload,
  idempotencyKey,
  requestUrl,
}) {
  await ensureJobSchemaAsync();
  return adapter.executeAsync(`
    INSERT INTO jobs (
      id, type, status, started_at, user_id, api_key, ip_hash, payload,
      idempotency_key, request_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    type,
    status,
    startedAt || null,
    userId || null,
    apiKey || null,
    ipHash || null,
    payload || null,
    idempotencyKey || null,
    requestUrl || null,
  ]);
}

async function findJobByIdempotencyAsync({
  type,
  statuses,
  identityColumn,
  identityValue,
  idempotencyKey,
  requestUrl,
}) {
  if (
    !type
    || !Array.isArray(statuses)
    || statuses.length === 0
    || !JOB_IDENTITY_COLUMNS.has(identityColumn)
    || !identityValue
    || !idempotencyKey
    || !requestUrl
  ) {
    return null;
  }
  await ensureJobSchemaAsync();
  const placeholders = adapter.placeholders(statuses.length);
  return adapter.queryOneAsync(`
    SELECT id, type, status, created_at, started_at, finished_at,
      user_id, api_key, ip_hash, payload, progress, error
    FROM jobs
    WHERE type = ?
      AND status IN (${placeholders})
      AND ${identityColumn} = ?
      AND idempotency_key = ?
      AND request_url = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [type, ...statuses, identityValue, idempotencyKey, requestUrl]);
}

const takeNextQueuedJobAsync = adapter.transactionAsync(async ({
  queuedStatus,
  stoppingStatus,
  runningStatus,
  types = null,
}) => {
  const allowedTypes = Array.isArray(types)
    ? types.filter(Boolean)
    : null;
  if (allowedTypes && allowedTypes.length === 0) return null;
  const typeClause = allowedTypes
    ? `AND type IN (${adapter.placeholders(allowedTypes.length)})`
    : '';
  const job = await adapter.queryOneAsync(`
    SELECT * FROM jobs
    WHERE status IN (?, ?)
    ${typeClause}
    ORDER BY created_at ASC
    LIMIT 1
  `, [queuedStatus, stoppingStatus, ...(allowedTypes || [])]);
  if (!job) return null;

  const nextStatus = job.status === queuedStatus ? runningStatus : stoppingStatus;
  const updated = await adapter.executeAsync(`
    UPDATE jobs
    SET status = ?, started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
    WHERE id = ? AND status = ?
  `, [nextStatus, job.id, job.status]);

  if (updated.changes !== 1) return null;
  return { ...job, status: nextStatus };
});

function updateJobProgressAsync(id, progressJson) {
  return adapter.executeAsync('UPDATE jobs SET progress = ? WHERE id = ?', [progressJson, id]);
}

function markJobCompleteAsync(id, completeStatus, resultJson, ...activeStatuses) {
  const statuses = normalizeStatuses(activeStatuses);
  if (statuses.length === 0) {
    return adapter.executeAsync(`
      UPDATE jobs
      SET status = ?, result = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [completeStatus, resultJson, id]);
  }
  const placeholders = adapter.placeholders(statuses.length);
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?, result = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN (${placeholders})
  `, [completeStatus, resultJson, id, ...statuses]);
}

function markJobFailedAsync(id, failedStatus, errorText) {
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [failedStatus, errorText, id]);
}

function normalizeStatuses(statuses) {
  return statuses.flat().map((status) => String(status || '').trim()).filter(Boolean);
}

function updateJobStatusAsync(id, nextStatus, allowedStatuses = []) {
  const statuses = normalizeStatuses(Array.isArray(allowedStatuses) ? allowedStatuses : [allowedStatuses]);
  if (statuses.length === 0) {
    return adapter.executeAsync('UPDATE jobs SET status = ? WHERE id = ?', [nextStatus, id]);
  }
  const placeholders = adapter.placeholders(statuses.length);
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?
    WHERE id = ? AND status IN (${placeholders})
  `, [nextStatus, id, ...statuses]);
}

function markJobCanceledAsync(id, canceledStatus, ...activeStatuses) {
  const statuses = normalizeStatuses(activeStatuses);
  if (statuses.length === 0) {
    return adapter.executeAsync(`
      UPDATE jobs
      SET status = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [canceledStatus, id]);
  }
  const placeholders = adapter.placeholders(statuses.length);
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN (${placeholders})
  `, [canceledStatus, id, ...statuses]);
}

function markJobStoppingAsync(id, stoppingStatus, ...activeStatuses) {
  const statuses = normalizeStatuses(activeStatuses);
  if (statuses.length === 0) {
    return adapter.executeAsync('UPDATE jobs SET status = ? WHERE id = ?', [stoppingStatus, id]);
  }
  const placeholders = adapter.placeholders(statuses.length);
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?
    WHERE id = ? AND status IN (${placeholders})
  `, [stoppingStatus, id, ...statuses]);
}

async function getJobStatusAsync(id) {
  return (await adapter.queryOneAsync('SELECT status FROM jobs WHERE id = ?', [id]))?.status || null;
}

function summarizeJobsByTypeAndStatusAsync() {
  return adapter.queryAllAsync(`
    SELECT type, status, COUNT(*) AS count
    FROM jobs
    GROUP BY type, status
    ORDER BY type ASC, status ASC
  `);
}

function listRecentJobsByTypeAsync(type, limit = 10) {
  return adapter.queryAllAsync(`
    SELECT id, type, status, created_at, started_at, finished_at, payload, error
    FROM jobs
    WHERE type = ?
    ORDER BY COALESCE(finished_at, started_at, created_at) DESC
    LIMIT ?
  `, [type, Math.max(1, Math.min(50, Number(limit) || 10))]);
}

module.exports = {
  ensureJobSchemaAsync,
  getJobByIdAsync,
  listJobPayloadsByTypeAndStatusesAsync,
  insertJobAsync,
  findJobByIdempotencyAsync,
  takeNextQueuedJobAsync,
  updateJobProgressAsync,
  updateJobStatusAsync,
  markJobCompleteAsync,
  markJobFailedAsync,
  markJobCanceledAsync,
  markJobStoppingAsync,
  getJobStatusAsync,
  summarizeJobsByTypeAndStatusAsync,
  listRecentJobsByTypeAsync,
};
