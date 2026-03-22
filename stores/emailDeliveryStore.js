const { v4: uuidv4 } = require('uuid');
const adapter = require('./dbAdapter');

let ensureSchemaPromise = null;

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_SUMMARY_DAYS = 30;
const MAX_SUMMARY_DAYS = 365;
const DEFAULT_EVENT_LIST_LIMIT = 100;
const MAX_EVENT_LIST_LIMIT = 500;

function normalizeNullableText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function serializeJson(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

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

function normalizeLimit(value, {
  fallback = DEFAULT_LIST_LIMIT,
  max = MAX_LIST_LIMIT,
} = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

function normalizeOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeDayWindow(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SUMMARY_DAYS;
  return Math.min(Math.max(parsed, 1), MAX_SUMMARY_DAYS);
}

function toCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildFilterQuery(filters = {}) {
  const clauses = [];
  const params = [];

  const normalizedStatus = normalizeNullableText(filters.status);
  if (normalizedStatus) {
    clauses.push('status = ?');
    params.push(normalizedStatus);
  }

  const normalizedProvider = normalizeNullableText(filters.provider);
  if (normalizedProvider) {
    clauses.push('provider = ?');
    params.push(normalizedProvider);
  }

  const normalizedTemplateKey = normalizeNullableText(filters.templateKey);
  if (normalizedTemplateKey) {
    clauses.push('template_key = ?');
    params.push(normalizedTemplateKey);
  }

  const normalizedToEmail = normalizeNullableText(filters.toEmail);
  if (normalizedToEmail) {
    clauses.push('to_email = ?');
    params.push(String(normalizedToEmail).toLowerCase());
  }

  const normalizedJobId = normalizeNullableText(filters.jobId);
  if (normalizedJobId) {
    clauses.push('job_id = ?');
    params.push(normalizedJobId);
  }

  const normalizedMapId = normalizeNullableText(filters.mapId);
  if (normalizedMapId) {
    clauses.push('map_id = ?');
    params.push(normalizedMapId);
  }

  const normalizedInviteId = normalizeNullableText(filters.inviteId);
  if (normalizedInviteId) {
    clauses.push('invite_id = ?');
    params.push(normalizedInviteId);
  }

  const normalizedProviderMessageId = normalizeNullableText(filters.providerMessageId);
  if (normalizedProviderMessageId) {
    clauses.push('provider_message_id = ?');
    params.push(normalizedProviderMessageId);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
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

    await ensureColumnAsync('email_deliveries', 'last_webhook_event_type', 'TEXT');
    await ensureColumnAsync('email_deliveries', 'last_webhook_event_at', 'TIMESTAMP');

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
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_email_deliveries_provider_message_id ON email_deliveries(provider_message_id)'
    );

    await adapter.executeAsync(`
      CREATE TABLE IF NOT EXISTS email_delivery_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        event_source_id TEXT,
        delivery_id TEXT,
        provider_message_id TEXT,
        event_type TEXT NOT NULL,
        delivery_status TEXT,
        recipient_email TEXT,
        occurred_at TIMESTAMP,
        payload TEXT,
        headers TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.executeAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_email_delivery_events_dedupe ON email_delivery_events(dedupe_key)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_email_delivery_events_delivery_created ON email_delivery_events(delivery_id, created_at)'
    );
    await adapter.executeAsync(
      'CREATE INDEX IF NOT EXISTS idx_email_delivery_events_provider_message ON email_delivery_events(provider_message_id, created_at)'
    );
  })();

  try {
    await ensureSchemaPromise;
  } catch (error) {
    ensureSchemaPromise = null;
    throw error;
  }
}

async function getEmailDeliveryByIdAsync(deliveryId) {
  await ensureEmailDeliverySchemaAsync();
  return adapter.queryOneAsync('SELECT * FROM email_deliveries WHERE id = ?', [deliveryId]);
}

async function listEmailDeliveriesByInviteAsync(inviteId, { limit = 20, offset = 0 } = {}) {
  await ensureEmailDeliverySchemaAsync();
  return adapter.queryAllAsync(`
    SELECT *
    FROM email_deliveries
    WHERE invite_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [inviteId, limit, offset]);
}

async function listEmailDeliveriesByMapAsync(mapId, { limit = 100, offset = 0 } = {}) {
  await ensureEmailDeliverySchemaAsync();
  return adapter.queryAllAsync(`
    SELECT *
    FROM email_deliveries
    WHERE map_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [mapId, limit, offset]);
}

async function listEmailDeliveriesAsync(filters = {}, { limit = DEFAULT_LIST_LIMIT, offset = 0 } = {}) {
  await ensureEmailDeliverySchemaAsync();

  const { whereSql, params } = buildFilterQuery(filters);
  return adapter.queryAllAsync(`
    SELECT
      id,
      job_id,
      map_id,
      invite_id,
      template_key,
      to_email,
      from_email,
      reply_to_email,
      subject,
      provider,
      status,
      attempts,
      last_attempt_at,
      sent_at,
      failed_at,
      provider_message_id,
      last_webhook_event_type,
      last_webhook_event_at,
      error,
      created_at,
      updated_at
    FROM email_deliveries
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, normalizeLimit(limit), normalizeOffset(offset)]);
}

async function countEmailDeliveriesAsync(filters = {}) {
  await ensureEmailDeliverySchemaAsync();

  const { whereSql, params } = buildFilterQuery(filters);
  const row = await adapter.queryOneAsync(`
    SELECT COUNT(*) AS total
    FROM email_deliveries
    ${whereSql}
  `, params);
  return toCount(row?.total);
}

async function summarizeEmailDeliveriesAsync({
  days = DEFAULT_SUMMARY_DAYS,
  recentFailureLimit = 10,
} = {}) {
  await ensureEmailDeliverySchemaAsync();

  const safeDays = normalizeDayWindow(days);
  const safeFailureLimit = normalizeLimit(recentFailureLimit, {
    fallback: 10,
    max: 50,
  });
  const since = new Date(Date.now() - (safeDays * 24 * 60 * 60 * 1000)).toISOString();

  const [totalsRow, statusRows, providerRows, templateRows, recentFailures] = await Promise.all([
    adapter.queryOneAsync(`
      SELECT
        COUNT(*) AS total,
        MAX(created_at) AS latest_created_at,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
        SUM(CASE WHEN status = 'sending' THEN 1 ELSE 0 END) AS sending,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) AS bounced,
        SUM(CASE WHEN status = 'complained' THEN 1 ELSE 0 END) AS complained,
        SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) AS delayed,
        SUM(CASE WHEN status = 'suppressed' THEN 1 ELSE 0 END) AS suppressed
      FROM email_deliveries
      WHERE created_at >= ?
    `, [since]),
    adapter.queryAllAsync(`
      SELECT status, COUNT(*) AS count
      FROM email_deliveries
      WHERE created_at >= ?
      GROUP BY status
      ORDER BY count DESC, status ASC
    `, [since]),
    adapter.queryAllAsync(`
      SELECT COALESCE(provider, 'unknown') AS provider, COUNT(*) AS count
      FROM email_deliveries
      WHERE created_at >= ?
      GROUP BY COALESCE(provider, 'unknown')
      ORDER BY count DESC, provider ASC
    `, [since]),
    adapter.queryAllAsync(`
      SELECT template_key, COUNT(*) AS count
      FROM email_deliveries
      WHERE created_at >= ?
      GROUP BY template_key
      ORDER BY count DESC, template_key ASC
    `, [since]),
    adapter.queryAllAsync(`
      SELECT
        id,
        job_id,
        map_id,
        invite_id,
        template_key,
        to_email,
        provider,
        status,
        attempts,
        last_attempt_at,
        failed_at,
        error,
        created_at
      FROM email_deliveries
      WHERE status = 'failed' AND created_at >= ?
      ORDER BY COALESCE(failed_at, last_attempt_at, created_at) DESC, created_at DESC
      LIMIT ?
    `, [since, safeFailureLimit]),
  ]);

  return {
    days: safeDays,
    since,
    totals: {
      total: toCount(totalsRow?.total),
      queued: toCount(totalsRow?.queued),
      sending: toCount(totalsRow?.sending),
      sent: toCount(totalsRow?.sent),
      delivered: toCount(totalsRow?.delivered),
      skipped: toCount(totalsRow?.skipped),
      failed: toCount(totalsRow?.failed),
      bounced: toCount(totalsRow?.bounced),
      complained: toCount(totalsRow?.complained),
      delayed: toCount(totalsRow?.delayed),
      suppressed: toCount(totalsRow?.suppressed),
      latestCreatedAt: totalsRow?.latest_created_at || null,
    },
    byStatus: statusRows.map((row) => ({
      status: row.status || 'unknown',
      count: toCount(row.count),
    })),
    byProvider: providerRows.map((row) => ({
      provider: row.provider || 'unknown',
      count: toCount(row.count),
    })),
    byTemplate: templateRows.map((row) => ({
      templateKey: row.template_key || 'unknown',
      count: toCount(row.count),
    })),
    recentFailures,
  };
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
  await ensureEmailDeliverySchemaAsync();
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

async function getEmailDeliveryByProviderMessageIdAsync(providerMessageId) {
  await ensureEmailDeliverySchemaAsync();
  const normalized = normalizeNullableText(providerMessageId);
  if (!normalized) return null;
  return adapter.queryOneAsync(`
    SELECT *
    FROM email_deliveries
    WHERE provider_message_id = ?
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `, [normalized]);
}

async function setEmailDeliveryJobIdAsync(deliveryId, jobId) {
  await ensureEmailDeliverySchemaAsync();
  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET job_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [normalizeNullableText(jobId), deliveryId]);
  return getEmailDeliveryByIdAsync(deliveryId);
}

async function markEmailDeliveryAttemptAsync({ deliveryId, provider = null }) {
  await ensureEmailDeliverySchemaAsync();
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
  await ensureEmailDeliverySchemaAsync();
  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET status = 'sent',
      provider = COALESCE(?, provider),
      provider_message_id = ?,
      provider_response = ?,
      last_webhook_event_type = NULL,
      last_webhook_event_at = NULL,
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
  await ensureEmailDeliverySchemaAsync();
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
  await ensureEmailDeliverySchemaAsync();
  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET status = 'failed',
      provider = COALESCE(?, provider),
      provider_response = ?,
      error = ?,
      last_webhook_event_type = NULL,
      last_webhook_event_at = NULL,
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

async function markEmailDeliveryWebhookStatusAsync({
  deliveryId,
  provider = null,
  providerMessageId = null,
  status = null,
  eventType = null,
  occurredAt = null,
}) {
  await ensureEmailDeliverySchemaAsync();

  const normalizedStatus = normalizeNullableText(status);
  const normalizedEventType = normalizeNullableText(eventType);
  const normalizedOccurredAt = normalizeNullableText(occurredAt);

  await adapter.executeAsync(`
    UPDATE email_deliveries
    SET status = COALESCE(?, status),
      provider = COALESCE(?, provider),
      provider_message_id = COALESCE(?, provider_message_id),
      last_webhook_event_type = COALESCE(?, last_webhook_event_type),
      last_webhook_event_at = COALESCE(?, last_webhook_event_at),
      failed_at = CASE
        WHEN ? IN ('failed', 'bounced', 'complained', 'suppressed') THEN COALESCE(?, CURRENT_TIMESTAMP)
        ELSE failed_at
      END,
      sent_at = CASE
        WHEN ? IN ('sent', 'delivered') AND sent_at IS NULL THEN COALESCE(?, CURRENT_TIMESTAMP)
        ELSE sent_at
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    normalizedStatus,
    normalizeNullableText(provider),
    normalizeNullableText(providerMessageId),
    normalizedEventType,
    normalizedOccurredAt,
    normalizedStatus,
    normalizedOccurredAt,
    normalizedStatus,
    normalizedOccurredAt,
    deliveryId,
  ]);
  return getEmailDeliveryByIdAsync(deliveryId);
}

const recordEmailDeliveryEventTransactionAsync = adapter.transactionAsync(async ({
  id,
  provider,
  dedupeKey,
  eventSourceId = null,
  deliveryId = null,
  providerMessageId = null,
  eventType,
  deliveryStatus = null,
  recipientEmail = null,
  occurredAt = null,
  payload = null,
  headers = null,
}) => {
  const existing = await adapter.queryOneAsync(
    'SELECT * FROM email_delivery_events WHERE dedupe_key = ?',
    [dedupeKey]
  );
  if (existing) {
    return { event: existing, created: false };
  }

  await adapter.executeAsync(`
    INSERT INTO email_delivery_events (
      id,
      provider,
      dedupe_key,
      event_source_id,
      delivery_id,
      provider_message_id,
      event_type,
      delivery_status,
      recipient_email,
      occurred_at,
      payload,
      headers
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    String(provider || '').trim(),
    String(dedupeKey || '').trim(),
    normalizeNullableText(eventSourceId),
    normalizeNullableText(deliveryId),
    normalizeNullableText(providerMessageId),
    String(eventType || '').trim(),
    normalizeNullableText(deliveryStatus),
    normalizeNullableText(recipientEmail),
    normalizeNullableText(occurredAt),
    serializeJson(payload),
    serializeJson(headers),
  ]);

  const event = await adapter.queryOneAsync(
    'SELECT * FROM email_delivery_events WHERE id = ?',
    [id]
  );
  return { event, created: true };
});

async function recordEmailDeliveryEventAsync({
  provider,
  dedupeKey,
  eventSourceId = null,
  deliveryId = null,
  providerMessageId = null,
  eventType,
  deliveryStatus = null,
  recipientEmail = null,
  occurredAt = null,
  payload = null,
  headers = null,
}) {
  await ensureEmailDeliverySchemaAsync();
  return recordEmailDeliveryEventTransactionAsync({
    id: uuidv4(),
    provider,
    dedupeKey,
    eventSourceId,
    deliveryId,
    providerMessageId,
    eventType,
    deliveryStatus,
    recipientEmail,
    occurredAt,
    payload,
    headers,
  });
}

async function listEmailDeliveryEventsByDeliveryAsync(
  deliveryId,
  { limit = DEFAULT_EVENT_LIST_LIMIT, offset = 0 } = {}
) {
  await ensureEmailDeliverySchemaAsync();
  return adapter.queryAllAsync(`
    SELECT *
    FROM email_delivery_events
    WHERE delivery_id = ?
    ORDER BY COALESCE(occurred_at, created_at) DESC, created_at DESC
    LIMIT ? OFFSET ?
  `, [
    deliveryId,
    normalizeLimit(limit, {
      fallback: DEFAULT_EVENT_LIST_LIMIT,
      max: MAX_EVENT_LIST_LIMIT,
    }),
    normalizeOffset(offset),
  ]);
}

module.exports = {
  ensureEmailDeliverySchemaAsync,
  getEmailDeliveryByIdAsync,
  getEmailDeliveryByProviderMessageIdAsync,
  listEmailDeliveriesByInviteAsync,
  listEmailDeliveriesByMapAsync,
  listEmailDeliveriesAsync,
  countEmailDeliveriesAsync,
  summarizeEmailDeliveriesAsync,
  listEmailDeliveryEventsByDeliveryAsync,
  recordEmailDeliveryEventAsync,
  createEmailDeliveryAsync,
  setEmailDeliveryJobIdAsync,
  markEmailDeliveryAttemptAsync,
  markEmailDeliverySentAsync,
  markEmailDeliverySkippedAsync,
  markEmailDeliveryFailedAsync,
  markEmailDeliveryWebhookStatusAsync,
};
