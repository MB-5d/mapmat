const adapter = require('./dbAdapter');

function getJobById(id) {
  return adapter.queryOne('SELECT * FROM jobs WHERE id = ?', [id]);
}

function listJobPayloadsByTypeAndStatuses(type, statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return [];
  const placeholders = statuses.map(() => '?').join(', ');
  return adapter.queryAll(`
    SELECT id, payload
    FROM jobs
    WHERE type = ? AND status IN (${placeholders})
    ORDER BY created_at ASC
  `, [type, ...statuses]);
}

function insertJob({
  id,
  type,
  status,
  userId,
  apiKey,
  ipHash,
  payload,
}) {
  adapter.execute(`
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

const takeNextQueuedJob = adapter.transaction(({ queuedStatus, runningStatus }) => {
  const job = adapter.queryOne(`
    SELECT * FROM jobs
    WHERE status = ?
    ORDER BY created_at ASC
    LIMIT 1
  `, [queuedStatus]);
  if (!job) return null;

  const updated = adapter.execute(`
    UPDATE jobs SET status = ?, started_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
  `, [runningStatus, job.id, queuedStatus]);

  if (updated.changes !== 1) return null;
  return job;
});

function updateJobProgress(id, progressJson) {
  adapter.execute('UPDATE jobs SET progress = ? WHERE id = ?', [progressJson, id]);
}

function markJobComplete(id, completeStatus, resultJson) {
  adapter.execute(`
    UPDATE jobs
    SET status = ?, result = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [completeStatus, resultJson, id]);
}

function markJobFailed(id, failedStatus, errorText) {
  adapter.execute(`
    UPDATE jobs
    SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [failedStatus, errorText, id]);
}

function markJobCanceled(id, canceledStatus, queuedStatus, runningStatus) {
  adapter.execute(`
    UPDATE jobs
    SET status = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN (?, ?)
  `, [canceledStatus, id, queuedStatus, runningStatus]);
}

function getJobStatus(id) {
  return adapter.queryOne('SELECT status FROM jobs WHERE id = ?', [id])?.status || null;
}

module.exports = {
  getJobById,
  listJobPayloadsByTypeAndStatuses,
  insertJob,
  takeNextQueuedJob,
  updateJobProgress,
  markJobComplete,
  markJobFailed,
  markJobCanceled,
  getJobStatus,
};
