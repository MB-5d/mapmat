const crypto = require('crypto');
const emailDeliveryStore = require('../stores/emailDeliveryStore');

const RESEND_WEBHOOK_TOLERANCE_SEC = 5 * 60;
const POSTMARK_TOKEN_HEADER = 'x-postmark-webhook-token';

class EmailWebhookError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'EmailWebhookError';
    this.statusCode = statusCode;
  }
}

function normalizeOptionalText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeOptionalEmail(value) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function safeJsonParse(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getRawBodyString(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');
  if (typeof rawBody === 'string') return rawBody;
  if (rawBody && typeof rawBody === 'object') {
    return JSON.stringify(rawBody);
  }
  return '';
}

function timingSafeCompare(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const direct = headers[name];
  if (Array.isArray(direct)) return direct[0] || null;
  if (direct !== undefined) return direct;

  const normalizedName = String(name || '').toLowerCase();
  const matchKey = Object.keys(headers).find((key) => key.toLowerCase() === normalizedName);
  if (!matchKey) return null;
  const value = headers[matchKey];
  return Array.isArray(value) ? value[0] || null : value;
}

function normalizeIsoTimestamp(value) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function normalizeHeaderSnapshot(provider, headers) {
  if (provider === 'resend') {
    return {
      svixId: normalizeOptionalText(getHeader(headers, 'svix-id') || getHeader(headers, 'webhook-id')),
      svixTimestamp: normalizeOptionalText(
        getHeader(headers, 'svix-timestamp') || getHeader(headers, 'webhook-timestamp')
      ),
    };
  }

  if (provider === 'postmark') {
    return {
      contentType: normalizeOptionalText(getHeader(headers, 'content-type')),
      userAgent: normalizeOptionalText(getHeader(headers, 'user-agent')),
    };
  }

  return null;
}

function getResendWebhookSecretCandidates() {
  const configured = normalizeOptionalText(process.env.RESEND_WEBHOOK_SECRET);
  if (!configured) return [];
  const secretPortion = configured.startsWith('whsec_') ? configured.slice(6) : configured;
  const candidates = [];

  try {
    const decoded = Buffer.from(secretPortion, 'base64');
    if (decoded.length > 0) {
      candidates.push(decoded);
    }
  } catch {
    // Fall through to raw-string fallback.
  }

  candidates.push(Buffer.from(secretPortion, 'utf8'));

  const unique = [];
  const seen = new Set();
  candidates.forEach((candidate) => {
    const key = candidate.toString('hex');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(candidate);
    }
  });
  return unique;
}

function verifyResendWebhookSignature({ rawBody, headers }) {
  const secretCandidates = getResendWebhookSecretCandidates();
  if (!secretCandidates.length) {
    throw new EmailWebhookError('Resend webhook secret is not configured', 503);
  }

  const webhookId = normalizeOptionalText(
    getHeader(headers, 'svix-id') || getHeader(headers, 'webhook-id')
  );
  const timestampRaw = normalizeOptionalText(
    getHeader(headers, 'svix-timestamp') || getHeader(headers, 'webhook-timestamp')
  );
  const signatureHeader = normalizeOptionalText(
    getHeader(headers, 'svix-signature') || getHeader(headers, 'webhook-signature')
  );

  if (!webhookId || !timestampRaw || !signatureHeader) {
    throw new EmailWebhookError('Missing required Resend webhook signature headers', 401);
  }

  const timestamp = Number.parseInt(timestampRaw, 10);
  if (!Number.isFinite(timestamp)) {
    throw new EmailWebhookError('Invalid Resend webhook timestamp', 401);
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > RESEND_WEBHOOK_TOLERANCE_SEC) {
    throw new EmailWebhookError('Resend webhook timestamp outside allowed tolerance', 401);
  }

  const rawBodyString = getRawBodyString(rawBody);
  const signedContent = `${webhookId}.${timestampRaw}.${rawBodyString}`;
  const signatures = signatureHeader
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(','))
    .filter((parts) => parts.length === 2 && parts[0] === 'v1')
    .map((parts) => parts[1]);

  if (!signatures.length) {
    throw new EmailWebhookError('Unsupported Resend webhook signature format', 401);
  }

  const verified = secretCandidates.some((secret) => {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signedContent)
      .digest('base64');
    return signatures.some((signature) => timingSafeCompare(signature, expected));
  });

  if (!verified) {
    throw new EmailWebhookError('Invalid Resend webhook signature', 401);
  }

  return {
    webhookId,
    timestamp: timestampRaw,
  };
}

function getPostmarkWebhookAuthConfig() {
  const username = normalizeOptionalText(process.env.POSTMARK_WEBHOOK_BASIC_USERNAME);
  const password = normalizeOptionalText(process.env.POSTMARK_WEBHOOK_BASIC_PASSWORD);
  const token = normalizeOptionalText(process.env.POSTMARK_WEBHOOK_TOKEN);
  const tokenHeaderName = normalizeOptionalText(process.env.POSTMARK_WEBHOOK_TOKEN_HEADER)
    || POSTMARK_TOKEN_HEADER;

  return {
    basicConfigured: !!(username && password),
    tokenConfigured: !!token,
    username,
    password,
    token,
    tokenHeaderName: tokenHeaderName.toLowerCase(),
  };
}

function verifyPostmarkWebhookAuth(headers) {
  const config = getPostmarkWebhookAuthConfig();
  if (!config.basicConfigured && !config.tokenConfigured) {
    throw new EmailWebhookError('Postmark webhook auth is not configured', 503);
  }

  if (config.basicConfigured) {
    const authHeader = normalizeOptionalText(getHeader(headers, 'authorization'));
    if (!authHeader || !authHeader.toLowerCase().startsWith('basic ')) {
      throw new EmailWebhookError('Missing Postmark webhook basic auth', 401);
    }
    const encoded = authHeader.slice(6).trim();
    let decoded = '';
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      throw new EmailWebhookError('Invalid Postmark webhook basic auth encoding', 401);
    }
    const separatorIndex = decoded.indexOf(':');
    const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
    const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';
    if (!timingSafeCompare(username, config.username) || !timingSafeCompare(password, config.password)) {
      throw new EmailWebhookError('Invalid Postmark webhook basic auth', 401);
    }
    return {
      authMode: 'basic',
    };
  }

  const token = normalizeOptionalText(getHeader(headers, config.tokenHeaderName));
  if (!token || !timingSafeCompare(token, config.token)) {
    throw new EmailWebhookError('Invalid Postmark webhook token', 401);
  }

  return {
    authMode: 'token',
    tokenHeaderName: config.tokenHeaderName,
  };
}

function normalizeResendRecipient(data) {
  const raw = Array.isArray(data?.to) ? data.to[0] : data?.to;
  if (!raw) return null;
  if (typeof raw === 'string') return normalizeOptionalEmail(raw);
  if (typeof raw === 'object') {
    return normalizeOptionalEmail(raw.email || raw.address || null);
  }
  return null;
}

function mapResendWebhookPayload(payload) {
  const eventType = normalizeOptionalText(payload?.type) || 'unknown';
  const data = payload?.data || {};
  const deliveryStatus = ({
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delayed',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
    'email.suppressed': 'suppressed',
  })[eventType] || null;

  return {
    eventType,
    deliveryStatus,
    providerMessageId: normalizeOptionalText(data.email_id || data.emailId || payload?.email_id),
    recipientEmail: normalizeResendRecipient(data),
    occurredAt: normalizeIsoTimestamp(payload?.created_at || data?.created_at || data?.updated_at),
  };
}

function mapPostmarkWebhookPayload(payload) {
  const recordType = normalizeOptionalText(payload?.RecordType) || 'Unknown';
  const normalizedRecordType = recordType.toLowerCase().replace(/\s+/g, '_');
  const eventType = `postmark.${normalizedRecordType}`;
  const deliveryStatus = ({
    Delivery: 'delivered',
    Bounce: 'bounced',
    SpamComplaint: 'complained',
  })[recordType] || null;

  return {
    eventType,
    deliveryStatus,
    providerMessageId: normalizeOptionalText(payload?.MessageID),
    recipientEmail: normalizeOptionalEmail(payload?.Recipient || payload?.Email),
    occurredAt: normalizeIsoTimestamp(
      payload?.DeliveredAt
      || payload?.BouncedAt
      || payload?.ReceivedAt
      || payload?.RecordedAt
      || payload?.SubmittedAt
    ),
    eventSourceId: normalizeOptionalText(payload?.ID),
  };
}

async function persistWebhookEventAsync({
  provider,
  dedupeKey,
  eventSourceId = null,
  deliveryLookupMessageId = null,
  eventType,
  deliveryStatus = null,
  recipientEmail = null,
  occurredAt = null,
  payload,
  headers,
}) {
  const delivery = deliveryLookupMessageId
    ? await emailDeliveryStore.getEmailDeliveryByProviderMessageIdAsync(deliveryLookupMessageId)
    : null;

  const recorded = await emailDeliveryStore.recordEmailDeliveryEventAsync({
    provider,
    dedupeKey,
    eventSourceId,
    deliveryId: delivery?.id || null,
    providerMessageId: deliveryLookupMessageId || null,
    eventType,
    deliveryStatus,
    recipientEmail,
    occurredAt,
    payload,
    headers,
  });

  let updatedDelivery = delivery;
  if (recorded.created && delivery?.id && deliveryStatus) {
    updatedDelivery = await emailDeliveryStore.markEmailDeliveryWebhookStatusAsync({
      deliveryId: delivery.id,
      provider,
      providerMessageId: deliveryLookupMessageId || null,
      status: deliveryStatus,
      eventType,
      occurredAt,
    });
  }

  return {
    provider,
    duplicate: !recorded.created,
    deliveryId: updatedDelivery?.id || delivery?.id || null,
    providerMessageId: deliveryLookupMessageId || null,
    eventType,
    deliveryStatus,
    occurredAt,
  };
}

async function processResendWebhookAsync({ rawBody, headers }) {
  const verification = verifyResendWebhookSignature({ rawBody, headers });
  const rawBodyString = getRawBodyString(rawBody);
  const payload = safeJsonParse(rawBodyString);
  if (!payload || typeof payload !== 'object') {
    throw new EmailWebhookError('Invalid Resend webhook payload', 400);
  }

  const mapped = mapResendWebhookPayload(payload);

  return persistWebhookEventAsync({
    provider: 'resend',
    dedupeKey: `resend:${verification.webhookId}`,
    eventSourceId: verification.webhookId,
    deliveryLookupMessageId: mapped.providerMessageId,
    eventType: mapped.eventType,
    deliveryStatus: mapped.deliveryStatus,
    recipientEmail: mapped.recipientEmail,
    occurredAt: mapped.occurredAt,
    payload,
    headers: normalizeHeaderSnapshot('resend', headers),
  });
}

async function processPostmarkWebhookAsync({ rawBody, headers }) {
  verifyPostmarkWebhookAuth(headers);

  const rawBodyString = getRawBodyString(rawBody);
  const payload = safeJsonParse(rawBodyString);
  if (!payload || typeof payload !== 'object') {
    throw new EmailWebhookError('Invalid Postmark webhook payload', 400);
  }

  const mapped = mapPostmarkWebhookPayload(payload);
  const dedupeKey = mapped.eventSourceId
    ? `postmark:${mapped.eventType}:${mapped.eventSourceId}`
    : `postmark:${mapped.eventType}:${mapped.providerMessageId || 'none'}:${mapped.recipientEmail || 'none'}:${mapped.occurredAt || 'none'}`;

  return persistWebhookEventAsync({
    provider: 'postmark',
    dedupeKey,
    eventSourceId: mapped.eventSourceId,
    deliveryLookupMessageId: mapped.providerMessageId,
    eventType: mapped.eventType,
    deliveryStatus: mapped.deliveryStatus,
    recipientEmail: mapped.recipientEmail,
    occurredAt: mapped.occurredAt,
    payload,
    headers: normalizeHeaderSnapshot('postmark', headers),
  });
}

module.exports = {
  EmailWebhookError,
  getPostmarkWebhookAuthConfig,
  getResendWebhookSecretCandidates,
  processResendWebhookAsync,
  processPostmarkWebhookAsync,
};
