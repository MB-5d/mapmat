const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

function normalizeNullableText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function serializeJson(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

async function ensureEmailDeliverySchemaAsync() {
  if (ensureSchemaPromise) {
    return ensureSchemaPromise;
  }

  ensureSchemaPromise = (async () => {
    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS email_deliveries (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        map_id TEXT,
        invite_id TEXT,
        template_key TEXT NOT NULL,
        to_email TEXT NOT NULL,
        from_email TEXT,
        reply_to_email TEXT,
        subject TEXT,
        provider TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMP,
        sent_at TIMESTAMP,
        failed_at TIMESTAMP,
        provider_message_id TEXT,
        payload TEXT,
        provider_response TEXT,
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_email_deliveries_status_created ON email_deliveries(status, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_email_deliveries_invite_created ON email_deliveries(invite_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_email_deliveries_map_created ON email_deliveries(map_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_email_deliveries_to_created ON email_deliveries(to_email, created_at)'
    );
    await adapter.executeAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_email_deliveries_job ON email_deliveries(job_id) WHERE job_id IS NOT NULL'
    );
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

function getEmailDeliveryByIdAsync(deliveryId) {
  return adapter.queryOneAsync('SELECT * FROM email_deliveries WHERE id = ?', [deliveryId]);
}

function listEmailDeliveriesByInviteAsync(inviteId, { limit = 20, offset = 0 } = {}) {
  return adapter.queryAllAsync(`
    SELECT *
    FROM email_deliveries
    WHERE invite_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [inviteId, limit, offset]);
}

async function createEmailDeliveryAsync({
  id = null,
  jobId = null,
  mapId = null,
  inviteId = null,
  templateKey,
  toEmail,
  fromEmail = null,
  replyToEmail = null,
  subject = null,
  provider = null,
  payload = null,
}) {
  const deliveryId = id || uuidv4();
  await adapter.executeAsync(`
    INSERT INTO email_deliveries (
      id, job_id, map_id, invite_id, template_key, to_email, from_email, reply_to_email,
      subject, provider, status, payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
  `, [
    deliveryId,
    normalizeNullableText(jobId),
    normalizeNullableText(mapId),
    normalizeNullableText(inviteId),
    String(templateKey || '').trim(),
    String(toEmail || '').trim().toLowerCase(),
    normalizeNullableText(fromEmail),
    normalizeNullableText(replyToEmail),
    normalizeNullableText(subject),
    normalizeNullableText(provider),
    serializeJson(payload),
  ]);

  return getEmailDeliveryByIdAsync(deliveryId);
}

async function setEmailDeliveryJobIdAsync(deliveryId, jobId) {
  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET job_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [normalizeNullableText(jobId), deliveryId]);
  return getEmailDeliveryByIdAsync(deliveryId);
}

async function markEmailDeliveryAttemptAsync({ deliveryId, provider = null }) {
  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET status = 'sending',
      provider = COALESCE(?, provider),
      attempts = attempts + 1,
      last_attempt_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP,
      error = NULL
    WHERE id = ?
  `, [normalizeNullableText(provider), deliveryId]);
  return getEmailDeliveryByIdAsync(deliveryId);
}

async function markEmailDeliverySentAsync({
  deliveryId,
  provider = null,
  providerMessageId = null,
  providerResponse = null,
}) {
  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET status = 'sent',
      provider = COALESCE(?, provider),
      provider_message_id = ?,
      provider_response = ?,
      error = NULL,
      sent_at = CURRENT_TIMESTAMP,
      failed_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    normalizeNullableText(provider),
    normalizeNullableText(providerMessageId),
    serializeJson(providerResponse),
    deliveryId,
  ]);
  return getEmailDeliveryByIdAsync(deliveryId);
}

async function markEmailDeliverySkippedAsync({
  deliveryId,
  provider = null,
  providerResponse = null,
}) {
  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET status = 'skipped',
      provider = COALESCE(?, provider),
      provider_response = ?,
      error = NULL,
      failed_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    normalizeNullableText(provider),
    serializeJson(providerResponse),
    deliveryId,
  ]);
  return getEmailDeliveryByIdAsync(deliveryId);
}

async function markEmailDeliveryFailedAsync({
  deliveryId,
  provider = null,
  errorText,
  providerResponse = null,
}) {
  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET status = 'failed',
      provider = COALESCE(?, provider),
      provider_response = ?,
      error = ?,
      failed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    normalizeNullableText(provider),
    serializeJson(providerResponse),
    normalizeNullableText(errorText) || 'Email delivery failed',
    deliveryId,
  ]);
  return getEmailDeliveryByIdAsync(deliveryId);
}

module.exports = {
  ensureEmailDeliverySchemaAsync,
  getEmailDeliveryByIdAsync,
  listEmailDeliveriesByInviteAsync,
  createEmailDeliveryAsync,
  setEmailDeliveryJobIdAsync,
  markEmailDeliveryAttemptAsync,
  markEmailDeliverySentAsync,
  markEmailDeliverySkippedAsync,
  markEmailDeliveryFailedAsync,
};
