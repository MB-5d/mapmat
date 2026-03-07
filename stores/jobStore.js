const db = require('../db');

function getJobById(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) || null;
}

function listJobPayloadsByTypeAndStatuses(type, statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return [];
  const placeholders = statuses.map(() => '?').join(', ');
  return db.prepare(`
    SELECT id, payload
    FROM jobs
    WHERE type = ? AND status IN (${placeholders})
    ORDER BY created_at ASC
  `).all(type, ...statuses);
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
  db.prepare(`
    INSERT INTO jobs (id, type, status, user_id, api_key, ip_hash, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    type,
    status,
    userId || null,
    apiKey || null,
    ipHash || null,
    payload || null
  );
}

const takeNextQueuedJob = db.transaction(({ queuedStatus, runningStatus }) => {
  const job = db.prepare(`
    SELECT * FROM jobs
    WHERE status = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).get(queuedStatus);
  if (!job) return null;

  const updated = db.prepare(`
    UPDATE jobs SET status = ?, started_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
  `).run(runningStatus, job.id, queuedStatus);

  if (updated.changes !== 1) return null;
  return job;
});

function updateJobProgress(id, progressJson) {
  db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(progressJson, id);
}

function markJobComplete(id, completeStatus, resultJson) {
  db.prepare(`
    UPDATE jobs
    SET status = ?, result = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(completeStatus, resultJson, id);
}

function markJobFailed(id, failedStatus, errorText) {
  db.prepare(`
    UPDATE jobs
    SET status = ?, error = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(failedStatus, errorText, id);
}

function markJobCanceled(id, canceledStatus, queuedStatus, runningStatus) {
  db.prepare(`
    UPDATE jobs
    SET status = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status IN (?, ?)
  `).run(canceledStatus, id, queuedStatus, runningStatus);
}

function getJobStatus(id) {
  return db.prepare('SELECT status FROM jobs WHERE id = ?').get(id)?.status || null;
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
