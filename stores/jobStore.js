const adapter = require('./dbAdapter');

function getJobByIdAsync(id) {
  return adapter.queryOneAsync('SELECT * FROM jobs WHERE id = ?', [id]);
}

function listJobPayloadsByTypeAndStatusesAsync(type, statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return Promise.resolve([]);
  const placeholders = statuses.map(() => '?').join(', ');
  return adapter.queryAllAsync(`
    SELECT id, type, status, user_id, api_key, ip_hash, payload
    FROM jobs
    WHERE type = ? AND status IN (${placeholders})
    ORDER BY created_at ASC
  `, [type, ...statuses]);
}

function insertJobAsync({
  id,
  type,
  status,
  userId,
  apiKey,
  ipHash,
  payload,
}) {
  return adapter.executeAsync(`
    INSERT INTO jobs (id, type, status, user_id, api_key, ip_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    type,
    status,
    userId || null,
    apiKey || null,
    ipHash || null,
    payload || null,
  ]);
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

function markJobCompleteAsync(id, completeStatus, resultJson) {
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?, result = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [completeStatus, resultJson, id]);
}

function markJobFailedAsync(id, failedStatus, errorText) {
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [failedStatus, errorText, id]);
}

function markJobCanceledAsync(id, canceledStatus, queuedStatus, runningStatus) {
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN (?, ?)
  `, [canceledStatus, id, queuedStatus, runningStatus]);
}

function markJobStoppingAsync(id, stoppingStatus, queuedStatus, runningStatus) {
  return adapter.executeAsync(`
    UPDATE jobs
    SET status = ?
    WHERE id = ? AND status IN (?, ?)
  `, [stoppingStatus, id, queuedStatus, runningStatus]);
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

module.exports = {
  getJobByIdAsync,
  listJobPayloadsByTypeAndStatusesAsync,
  insertJobAsync,
  takeNextQueuedJobAsync,
  updateJobProgressAsync,
  markJobCompleteAsync,
  markJobFailedAsync,
  markJobCanceledAsync,
  markJobStoppingAsync,
  getJobStatusAsync,
  summarizeJobsByTypeAndStatusAsync,
};
