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
  const scenarios = [
    {
      templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_INVITE,
      payload: {
        inviterName: 'QA Owner',
        inviterEmail: 'qa-owner@example.com',
        inviteeEmail: 'qa-email@example.com',
        mapName: 'Email QA Map',
        mapUrl: 'https://example.com',
        role: 'viewer',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_CREATED,
      payload: {
        requesterName: 'QA Requester',
        requesterEmail: 'qa-requester@example.com',
        mapName: 'Email QA Map',
        requestedRole: 'editor',
        message: 'Please grant access for review.',
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_APPROVED,
      payload: {
        decisionUserName: 'QA Owner',
        decisionUserEmail: 'qa-owner@example.com',
        mapName: 'Email QA Map',
        requestedRole: 'viewer',
        decisionRole: 'commenter',
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_DENIED,
      payload: {
        decisionUserName: 'QA Owner',
        decisionUserEmail: 'qa-owner@example.com',
        mapName: 'Email QA Map',
        requestedRole: 'editor',
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_ROLE_CHANGED,
      payload: {
        actorName: 'QA Owner',
        actorEmail: 'qa-owner@example.com',
        mapName: 'Email QA Map',
        previousRole: 'viewer',
        role: 'editor',
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REMOVED,
      payload: {
        actorName: 'QA Owner',
        actorEmail: 'qa-owner@example.com',
        mapName: 'Email QA Map',
        previousRole: 'commenter',
      },
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    const queued = await queueTemplatedEmailAsync({
      templateKey: scenario.templateKey,
      toEmail: 'qa-email@example.com',
      payload: scenario.payload,
      userId: null,
      mapId: null,
      inviteId: null,
    });

    const job = await jobStore.getJobByIdAsync(queued.jobId);
    if (!job || job.type !== JOB_TYPES.EMAIL) {
      throw new Error(`Failed to queue email job for ${scenario.templateKey}.`);
    }

    const deliveryResult = await processEmailDeliveryJobAsync(job);
    const delivery = await emailDeliveryStore.getEmailDeliveryByIdAsync(queued.delivery.id);
    if (!delivery) {
      throw new Error(`Queued email delivery row was not found for ${scenario.templateKey}.`);
    }

    if (!['sent', 'skipped'].includes(delivery.status)) {
      throw new Error(`Unexpected email delivery status for ${scenario.templateKey}: ${delivery.status}`);
    }

    results.push({
      templateKey: scenario.templateKey,
      deliveryId: delivery.id,
      jobId: job.id,
      status: delivery.status,
      provider: delivery.provider || null,
      resultStatus: deliveryResult.status || null,
    });
  }

  const recentDeliveries = await emailDeliveryStore.listEmailDeliveriesAsync({}, {
    limit: 3,
    offset: 0,
  });
  if (!Array.isArray(recentDeliveries) || recentDeliveries.length === 0) {
    throw new Error('Expected recent email deliveries to be queryable.');
  }

  const inviteDeliveries = await emailDeliveryStore.listEmailDeliveriesAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_INVITE,
  }, {
    limit: 10,
    offset: 0,
  });
  if (!inviteDeliveries.some((delivery) => delivery.template_key === EMAIL_TEMPLATE_KEYS.COLLABORATION_INVITE)) {
    throw new Error('Expected template filtering to return invite deliveries.');
  }

  const totalDeliveries = await emailDeliveryStore.countEmailDeliveriesAsync({});
  if (!Number.isFinite(totalDeliveries) || totalDeliveries < scenarios.length) {
    throw new Error(`Unexpected email delivery total: ${totalDeliveries}`);
  }

  const summary = await emailDeliveryStore.summarizeEmailDeliveriesAsync({
    days: 30,
    recentFailureLimit: 5,
  });
  if (!summary || !summary.totals || summary.totals.total < scenarios.length) {
    throw new Error('Expected email delivery summary totals to include the queued deliveries.');
  }
  if (!Array.isArray(summary.byTemplate) || summary.byTemplate.length === 0) {
    throw new Error('Expected email delivery summary to include template counts.');
  }

  console.log('[email-delivery-check] Passed.', JSON.stringify(results));
}

main().catch((error) => {
  console.error('[email-delivery-check] Failed:', error);
  process.exit(1);
});
