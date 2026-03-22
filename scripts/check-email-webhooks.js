#!/usr/bin/env node

/* eslint-disable no-console */

const crypto = require('crypto');
const emailDeliveryStore = require('../stores/emailDeliveryStore');
const {
  createEmailDeliveryAsync,
  getEmailDeliveryByIdAsync,
  listEmailDeliveryEventsByDeliveryAsync,
  markEmailDeliverySentAsync,
} = emailDeliveryStore;
const {
  processResendWebhookAsync,
  processPostmarkWebhookAsync,
} = require('../utils/emailWebhooks');

function buildResendSignature({ secret, webhookId, timestamp, rawBody }) {
  const secretPortion = String(secret || '').replace(/^whsec_/, '');
  const key = Buffer.from(secretPortion, 'base64');
  return crypto
    .createHmac('sha256', key)
    .update(`${webhookId}.${timestamp}.${rawBody}`)
    .digest('base64');
}

async function main() {
  const runId = crypto.randomUUID();
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_TWFwTWF0V2ViaG9va1Rlc3RTZWNyZXQ=';
  process.env.POSTMARK_WEBHOOK_TOKEN = 'postmark-webhook-test-token';

  const resendDelivery = await createEmailDeliveryAsync({
    templateKey: 'test.webhook.resend',
    toEmail: 'qa-resend@example.com',
    provider: 'resend',
    subject: 'Resend webhook test',
    payload: { scope: 'check-email-webhooks' },
  });
  await markEmailDeliverySentAsync({
    deliveryId: resendDelivery.id,
    provider: 'resend',
    providerMessageId: `re_msg_test_${runId}`,
    providerResponse: { source: 'test' },
  });

  const resendPayload = JSON.stringify({
    type: 'email.delivered',
    created_at: new Date().toISOString(),
    data: {
      email_id: `re_msg_test_${runId}`,
      to: ['qa-resend@example.com'],
    },
  });
  const resendWebhookId = `msg_resend_test_${runId}`;
  const resendTimestamp = String(Math.floor(Date.now() / 1000));
  const resendSignature = buildResendSignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    webhookId: resendWebhookId,
    timestamp: resendTimestamp,
    rawBody: resendPayload,
  });

  const resendResult = await processResendWebhookAsync({
    rawBody: resendPayload,
    headers: {
      'svix-id': resendWebhookId,
      'svix-timestamp': resendTimestamp,
      'svix-signature': `v1,${resendSignature}`,
    },
  });
  if (resendResult.deliveryStatus !== 'delivered' || resendResult.duplicate) {
    throw new Error(`Unexpected Resend webhook result: ${JSON.stringify(resendResult)}`);
  }

  const resendDuplicate = await processResendWebhookAsync({
    rawBody: resendPayload,
    headers: {
      'svix-id': resendWebhookId,
      'svix-timestamp': resendTimestamp,
      'svix-signature': `v1,${resendSignature}`,
    },
  });
  if (!resendDuplicate.duplicate) {
    throw new Error('Expected duplicate Resend webhook delivery to be idempotent.');
  }

  const resendDeliveryRow = await getEmailDeliveryByIdAsync(resendDelivery.id);
  if (resendDeliveryRow.status !== 'delivered') {
    throw new Error(`Expected Resend delivery status to be delivered, got ${resendDeliveryRow.status}`);
  }
  const resendEvents = await listEmailDeliveryEventsByDeliveryAsync(resendDelivery.id);
  if (!Array.isArray(resendEvents) || resendEvents.length !== 1) {
    throw new Error(`Expected exactly one stored Resend webhook event, got ${resendEvents.length}`);
  }

  const postmarkDelivery = await createEmailDeliveryAsync({
    templateKey: 'test.webhook.postmark',
    toEmail: 'qa-postmark@example.com',
    provider: 'postmark',
    subject: 'Postmark webhook test',
    payload: { scope: 'check-email-webhooks' },
  });
  await markEmailDeliverySentAsync({
    deliveryId: postmarkDelivery.id,
    provider: 'postmark',
    providerMessageId: `pm_msg_test_${runId}`,
    providerResponse: { source: 'test' },
  });

  const postmarkPayload = JSON.stringify({
    ID: Number.parseInt(runId.replace(/-/g, '').slice(0, 12), 16),
    MessageID: `pm_msg_test_${runId}`,
    Recipient: 'qa-postmark@example.com',
    RecordType: 'Bounce',
    BouncedAt: new Date().toISOString(),
    Type: 'HardBounce',
  });
  const postmarkResult = await processPostmarkWebhookAsync({
    rawBody: postmarkPayload,
    headers: {
      'x-postmark-webhook-token': process.env.POSTMARK_WEBHOOK_TOKEN,
      'content-type': 'application/json',
    },
  });
  if (postmarkResult.deliveryStatus !== 'bounced' || postmarkResult.duplicate) {
    throw new Error(`Unexpected Postmark webhook result: ${JSON.stringify(postmarkResult)}`);
  }

  const postmarkDuplicate = await processPostmarkWebhookAsync({
    rawBody: postmarkPayload,
    headers: {
      'x-postmark-webhook-token': process.env.POSTMARK_WEBHOOK_TOKEN,
      'content-type': 'application/json',
    },
  });
  if (!postmarkDuplicate.duplicate) {
    throw new Error('Expected duplicate Postmark webhook delivery to be idempotent.');
  }

  const postmarkDeliveryRow = await getEmailDeliveryByIdAsync(postmarkDelivery.id);
  if (postmarkDeliveryRow.status !== 'bounced') {
    throw new Error(`Expected Postmark delivery status to be bounced, got ${postmarkDeliveryRow.status}`);
  }
  const postmarkEvents = await listEmailDeliveryEventsByDeliveryAsync(postmarkDelivery.id);
  if (!Array.isArray(postmarkEvents) || postmarkEvents.length !== 1) {
    throw new Error(`Expected exactly one stored Postmark webhook event, got ${postmarkEvents.length}`);
  }

  console.log('[email-webhooks] Passed.', JSON.stringify({
    resend: {
      deliveryId: resendDelivery.id,
      eventId: resendEvents[0].id,
      status: resendDeliveryRow.status,
    },
    postmark: {
      deliveryId: postmarkDelivery.id,
      eventId: postmarkEvents[0].id,
      status: postmarkDeliveryRow.status,
    },
  }));
}

main().catch((error) => {
  console.error('[email-webhooks] Failed:', error);
  process.exit(1);
});
