#!/usr/bin/env node

/* eslint-disable no-console */

if (String(process.env.DB_PROVIDER || '').toLowerCase() === 'postgres' && !process.env.DATABASE_URL) {
  console.log('[email-delivery-check] Skipped persisted delivery check without DATABASE_URL.');
  process.exit(0);
}

const jobStore = require('../stores/jobStore');
const emailDeliveryStore = require('../stores/emailDeliveryStore');
const {
  JOB_TYPES,
  processEmailDeliveryJobAsync,
  queueFeedbackSubmissionEmailsAsync,
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
    {
      templateKey: EMAIL_TEMPLATE_KEYS.AUTH_EMAIL_VERIFICATION,
      payload: {
        name: 'QA Auth User',
        code: '123456',
        expiresMinutes: 10,
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.AUTH_PASSWORD_RESET,
      payload: {
        name: 'QA Auth User',
        code: '654321',
        expiresMinutes: 15,
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT,
      payload: {
        targetKey: 'inquiries',
        name: 'QA Contact',
        email: 'qa-contact@example.com',
        reason: 'Demo request',
        reasonDetail: 'Email delivery check',
        message: 'Please follow up about Vellic.',
        sourceUrl: 'https://vellic.io/contact',
        submittedAt: new Date().toISOString(),
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT_CONFIRMATION,
      payload: {
        targetKey: 'support',
        name: 'QA Contact',
        reason: 'Delivery check',
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.FEEDBACK_INTERNAL,
      payload: {
        intent: 'broken',
        scope: 'specific_thing',
        actorName: 'QA Feedback User',
        actorEmail: 'qa-feedback@example.com',
        message: 'The share selector did not update.',
        componentLabel: 'Share access selector',
        screenshotUrl: 'https://api.vellic.io/uploads/feedback/qa.png',
        allowFollowUp: true,
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.FEEDBACK_CONFIRMATION,
      payload: {
        intent: 'idea',
        scope: 'whole_app',
        allowFollowUp: true,
      },
    },
    {
      templateKey: EMAIL_TEMPLATE_KEYS.PROMO_CODE_SHARED,
      payload: {
        offerLabel: 'Pro free month',
        campaignKey: 'qa',
        codes: [{
          code: 'VELLICQA',
          offerLabel: 'Pro free month',
          provider: 'stripe',
          firstTimeOrderOnly: true,
          maxRedemptions: 1,
        }],
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

  const anonymousFeedback = await queueFeedbackSubmissionEmailsAsync({
    feedback: {
      id: 'feedback-email-check-anonymous',
      intent: 'confusing',
      scope: 'whole_app',
      actor_name: 'Anonymous',
      actor_email: null,
      allow_follow_up: 0,
      created_at: new Date().toISOString(),
    },
  });
  if (anonymousFeedback.length !== 1 || anonymousFeedback[0].status !== 'fulfilled') {
    throw new Error('Anonymous feedback should queue only the internal notification.');
  }
  const anonymousDelivery = anonymousFeedback[0].value.delivery;
  const anonymousJob = await jobStore.getJobByIdAsync(anonymousFeedback[0].value.jobId);
  if (anonymousDelivery.to_email !== 'support@vellic.io' || anonymousDelivery.reply_to_email) {
    throw new Error('Anonymous confusing feedback must route to support without Reply-To.');
  }
  if (!JSON.parse(anonymousJob.payload).suppressDefaultReplyTo) {
    throw new Error('Anonymous feedback must suppress the default Reply-To header.');
  }
  await processEmailDeliveryJobAsync(anonymousJob);

  const followUpFeedback = await queueFeedbackSubmissionEmailsAsync({
    feedback: {
      id: 'feedback-email-check-follow-up',
      intent: 'idea',
      scope: 'flow',
      actor_name: 'QA Feedback User',
      actor_email: 'qa-feedback@example.com',
      allow_follow_up: 1,
      created_at: new Date().toISOString(),
    },
  });
  if (followUpFeedback.length !== 2 || followUpFeedback.some((entry) => entry.status !== 'fulfilled')) {
    throw new Error('Follow-up feedback should queue internal and confirmation emails.');
  }
  const followUpInternal = followUpFeedback.find((entry) => entry.kind === 'internal').value;
  if (followUpInternal.delivery.to_email !== 'hello@vellic.io'
    || followUpInternal.delivery.reply_to_email !== 'qa-feedback@example.com') {
    throw new Error('Idea feedback with permission must route to hello with submitter Reply-To.');
  }
  for (const entry of followUpFeedback) {
    await processEmailDeliveryJobAsync(await jobStore.getJobByIdAsync(entry.value.jobId));
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
