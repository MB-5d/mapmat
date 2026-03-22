#!/usr/bin/env node

/* eslint-disable no-console */

const jobStore = require('../stores/jobStore');
const emailDeliveryStore = require('../stores/emailDeliveryStore');
const {
  JOB_TYPES,
  processEmailDeliveryJobAsync,
  queueTemplatedEmailAsync,
} = require('../utils/emailDelivery');
const { EMAIL_TEMPLATE_KEYS } = require('../utils/emailTemplates');

async function main() {
  const result = await queueTemplatedEmailAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_INVITE,
    toEmail: 'qa-email@example.com',
    payload: {
      inviterName: 'QA Owner',
      inviterEmail: 'qa-owner@example.com',
      inviteeEmail: 'qa-email@example.com',
      mapName: 'Email QA Map',
      mapUrl: 'https://example.com',
      role: 'viewer',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    userId: null,
    mapId: null,
    inviteId: null,
  });

  const job = await jobStore.getJobByIdAsync(result.jobId);
  if (!job || job.type !== JOB_TYPES.EMAIL) {
    throw new Error('Failed to queue email job.');
  }

  const deliveryResult = await processEmailDeliveryJobAsync(job);
  const delivery = await emailDeliveryStore.getEmailDeliveryByIdAsync(result.delivery.id);
  if (!delivery) {
    throw new Error('Queued email delivery row was not found.');
  }

  if (!['sent', 'skipped'].includes(delivery.status)) {
    throw new Error(`Unexpected email delivery status: ${delivery.status}`);
  }

  console.log('[email-delivery-check] Passed.', JSON.stringify({
    deliveryId: delivery.id,
    jobId: job.id,
    status: delivery.status,
    provider: delivery.provider || null,
    resultStatus: deliveryResult.status || null,
  }));
}

main().catch((error) => {
  console.error('[email-delivery-check] Failed:', error);
  process.exit(1);
});
