const { v4: uuidv4 } = require('uuid');
const jobStore = require('../stores/jobStore');
const emailDeliveryStore = require('../stores/emailDeliveryStore');
const { getEmailConfigSnapshot, sendEmailAsync } = require('./emailProvider');
const { EMAIL_TEMPLATE_KEYS, getDefaultAppBaseUrl, renderTemplatedEmail } = require('./emailTemplates');

const JOB_TYPES = Object.freeze({
  EMAIL: 'email',
});

const JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
});

function parseJsonSafe(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeRecipients(recipients) {
  const seen = new Set();
  return (Array.isArray(recipients) ? recipients : [])
    .map((recipient) => {
      const email = String(recipient?.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) return null;
      seen.add(email);
      return {
        email,
        userId: recipient?.userId || null,
        mapId: recipient?.mapId || null,
        inviteId: recipient?.inviteId || null,
        payload: recipient?.payload || {},
      };
    })
    .filter(Boolean);
}

async function queueTemplatedEmailAsync({
  templateKey,
  toEmail,
  payload,
  userId = null,
  mapId = null,
  inviteId = null,
  replyToEmail = undefined,
  suppressDefaultReplyTo = false,
}) {
  await emailDeliveryStore.ensureEmailDeliverySchemaAsync();

  const config = getEmailConfigSnapshot();
  const rendered = renderTemplatedEmail({ templateKey, payload });
  const delivery = await emailDeliveryStore.createEmailDeliveryAsync({
    templateKey,
    toEmail,
    fromEmail: config.fromAddress,
    replyToEmail: replyToEmail === undefined ? config.replyToAddress : replyToEmail,
    subject: rendered.subject,
    provider: config.provider,
    payload,
    mapId,
    inviteId,
  });

  const jobId = uuidv4();
  await jobStore.insertJobAsync({
    id: jobId,
    type: JOB_TYPES.EMAIL,
    status: JOB_STATUS.QUEUED,
    userId,
    apiKey: null,
    ipHash: null,
    payload: JSON.stringify({
      deliveryId: delivery.id,
      suppressDefaultReplyTo: Boolean(suppressDefaultReplyTo),
    }),
  });

  const updatedDelivery = await emailDeliveryStore.setEmailDeliveryJobIdAsync(delivery.id, jobId);
  return {
    delivery: updatedDelivery,
    jobId,
  };
}

async function queueCollaborationInviteEmailAsync({
  map,
  invite,
  inviter,
}) {
  if (!map?.id || !invite?.id || !invite?.invitee_email) {
    throw new Error('Map, invite, and invitee email are required to queue invite email.');
  }

  return queueTemplatedEmailAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_INVITE,
    toEmail: invite.invitee_email,
    payload: {
      appBaseUrl: getDefaultAppBaseUrl(),
      mapId: map.id,
      mapName: map.name || 'Untitled map',
      mapUrl: map.url || null,
      inviteId: invite.id,
      inviteToken: invite.token || null,
      inviteeEmail: invite.invitee_email,
      inviterEmail: inviter?.email || null,
      inviterName: inviter?.name || null,
      role: invite.role || 'viewer',
      expiresAt: invite.expires_at || null,
    },
    userId: inviter?.id || invite.inviter_user_id || null,
    mapId: map.id,
    inviteId: invite.id,
  });
}

async function queueTemplatedEmailsAsync({
  templateKey,
  recipients,
}) {
  const normalizedRecipients = normalizeRecipients(recipients);
  const results = await Promise.all(normalizedRecipients.map((recipient) => queueTemplatedEmailAsync({
    templateKey,
    toEmail: recipient.email,
    payload: recipient.payload,
    userId: recipient.userId,
    mapId: recipient.mapId,
    inviteId: recipient.inviteId,
  })));
  return results;
}

async function queueAccessRequestCreatedEmailsAsync({
  map,
  request,
  requester,
  ownerRecipients,
}) {
  return queueTemplatedEmailsAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_CREATED,
    recipients: ownerRecipients.map((owner) => ({
      email: owner.email,
      userId: owner.userId || null,
      mapId: map.id,
      payload: {
        appBaseUrl: getDefaultAppBaseUrl(),
        mapId: map.id,
        mapName: map.name || 'Untitled map',
        requesterEmail: requester?.email || request.requester_email || null,
        requesterName: requester?.name || request.requester_name || null,
        requestedRole: request.requested_role || 'viewer',
        message: request.message || null,
      },
    })),
  });
}

async function queueAccessRequestDecisionEmailAsync({
  map,
  request,
  decisionUser,
  approved,
}) {
  const requesterEmail = String(request?.requester_email || '').trim().toLowerCase();
  if (!requesterEmail) return [];

  return queueTemplatedEmailsAsync({
    templateKey: approved
      ? EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_APPROVED
      : EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_DENIED,
    recipients: [{
      email: requesterEmail,
      userId: request.requester_user_id || null,
      mapId: map.id,
      payload: {
        appBaseUrl: getDefaultAppBaseUrl(),
        mapId: map.id,
        mapName: map.name || 'Untitled map',
        requestedRole: request.requested_role || 'viewer',
        decisionRole: request.decision_role || request.requested_role || null,
        decisionUserEmail: decisionUser?.email || null,
        decisionUserName: decisionUser?.name || null,
      },
    }],
  });
}

async function queueMembershipRoleChangedEmailAsync({
  map,
  membershipUser,
  actorUser,
  previousRole,
  nextRole,
}) {
  const userEmail = String(membershipUser?.email || '').trim().toLowerCase();
  if (!userEmail) return [];

  return queueTemplatedEmailsAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_ROLE_CHANGED,
    recipients: [{
      email: userEmail,
      userId: membershipUser.id || null,
      mapId: map.id,
      payload: {
        appBaseUrl: getDefaultAppBaseUrl(),
        mapId: map.id,
        mapName: map.name || 'Untitled map',
        actorEmail: actorUser?.email || null,
        actorName: actorUser?.name || null,
        previousRole: previousRole || null,
        role: nextRole || null,
      },
    }],
  });
}

async function queueMembershipRemovedEmailAsync({
  map,
  membershipUser,
  actorUser,
  previousRole,
}) {
  const userEmail = String(membershipUser?.email || '').trim().toLowerCase();
  if (!userEmail) return [];

  return queueTemplatedEmailsAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REMOVED,
    recipients: [{
      email: userEmail,
      userId: membershipUser.id || null,
      mapId: map.id,
      payload: {
        appBaseUrl: getDefaultAppBaseUrl(),
        mapId: map.id,
        mapName: map.name || 'Untitled map',
        actorEmail: actorUser?.email || null,
        actorName: actorUser?.name || null,
        previousRole: previousRole || null,
      },
    }],
  });
}

function serializePromoCodesForEmail(codes) {
  return (Array.isArray(codes) ? codes : [])
    .map((code) => {
      const value = String(code?.code || '').trim();
      if (!value) return null;
      return {
        code: value,
        offerLabel: String(code?.offerLabel || code?.offer_label || '').trim() || 'Vellic promo',
        provider: String(code?.provider || '').trim().toLowerCase() || 'stripe',
        firstTimeOrderOnly: Boolean(code?.firstTimeOrderOnly || Number(code?.first_time_order_only || 0) > 0),
        maxRedemptions: code?.maxRedemptions ?? code?.max_redemptions ?? null,
      };
    })
    .filter(Boolean);
}

async function queuePromoCodeSharedEmailAsync({
  recipientEmail,
  codes,
  actorUser = null,
  campaignKey = '',
}) {
  const normalizedRecipientEmail = String(recipientEmail || '').trim().toLowerCase();
  const emailCodes = serializePromoCodesForEmail(codes);
  if (!normalizedRecipientEmail || emailCodes.length === 0) {
    throw new Error('Recipient email and at least one promo code are required.');
  }

  return queueTemplatedEmailAsync({
    templateKey: EMAIL_TEMPLATE_KEYS.PROMO_CODE_SHARED,
    toEmail: normalizedRecipientEmail,
    payload: {
      appBaseUrl: getDefaultAppBaseUrl(),
      offerLabel: emailCodes[0]?.offerLabel || 'Vellic promo',
      codes: emailCodes,
      campaignKey: String(campaignKey || '').trim() || null,
      actorEmail: actorUser?.email || null,
      actorName: actorUser?.name || null,
    },
    userId: actorUser?.id || actorUser?.userId || null,
    mapId: null,
    inviteId: null,
  });
}

const FEEDBACK_RECIPIENTS = Object.freeze({
  broken: 'support@vellic.io',
  confusing: 'support@vellic.io',
  idea: 'hello@vellic.io',
  like: 'hello@vellic.io',
  dislike: 'hello@vellic.io',
});

function getFeedbackRecipientEmail(intent) {
  return FEEDBACK_RECIPIENTS[String(intent || '').trim().toLowerCase()] || null;
}

function serializeFeedbackForEmail(feedback, screenshotUrl = null) {
  return {
    appBaseUrl: getDefaultAppBaseUrl(),
    intent: feedback.intent,
    scope: feedback.scope,
    rating: feedback.rating,
    message: feedback.message || null,
    actorName: feedback.actor_name || 'Anonymous',
    actorEmail: feedback.actor_email || null,
    surface: feedback.surface || null,
    routePath: feedback.route_path || null,
    routeSection: feedback.route_section || null,
    mapId: feedback.map_id || null,
    shareId: feedback.share_id || null,
    componentKey: feedback.component_key || null,
    componentLabel: feedback.component_label || null,
    screenshotUrl: screenshotUrl || feedback.screenshot_path || null,
    allowFollowUp: Number(feedback.allow_follow_up || 0) > 0,
    context: parseJsonSafe(feedback.context_json) || null,
    submittedAt: feedback.created_at || null,
  };
}

async function queueFeedbackSubmissionEmailsAsync({ feedback, screenshotUrl = null }) {
  const intent = String(feedback?.intent || '').trim().toLowerCase();
  const recipientEmail = getFeedbackRecipientEmail(intent);
  if (!feedback?.id || !recipientEmail) {
    throw new Error('Stored feedback with a supported intent is required to queue feedback email.');
  }

  const payload = serializeFeedbackForEmail(feedback, screenshotUrl);
  const allowFollowUp = Boolean(payload.allowFollowUp && payload.actorEmail);
  const tasks = [{
    kind: 'internal',
    promise: queueTemplatedEmailAsync({
      templateKey: EMAIL_TEMPLATE_KEYS.FEEDBACK_INTERNAL,
      toEmail: recipientEmail,
      payload,
      userId: feedback.actor_user_id || null,
      mapId: feedback.map_id || null,
      replyToEmail: allowFollowUp ? payload.actorEmail : null,
      suppressDefaultReplyTo: !allowFollowUp,
    }),
  }];

  if (allowFollowUp) {
    tasks.push({
      kind: 'confirmation',
      promise: queueTemplatedEmailAsync({
        templateKey: EMAIL_TEMPLATE_KEYS.FEEDBACK_CONFIRMATION,
        toEmail: payload.actorEmail,
        payload,
        userId: feedback.actor_user_id || null,
        mapId: feedback.map_id || null,
      }),
    });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  return settled.map((result, index) => ({
    kind: tasks[index].kind,
    status: result.status,
    value: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason?.message || 'Failed to queue email.' : null,
  }));
}

async function processEmailDeliveryJobAsync(job) {
  const payload = parseJsonSafe(job?.payload) || {};
  const deliveryId = String(payload.deliveryId || '').trim();
  if (!deliveryId) {
    throw new Error('Email job is missing deliveryId.');
  }

  await emailDeliveryStore.ensureEmailDeliverySchemaAsync();
  const delivery = await emailDeliveryStore.getEmailDeliveryByIdAsync(deliveryId);
  if (!delivery) {
    throw new Error(`Email delivery not found: ${deliveryId}`);
  }

  if (['sent', 'skipped'].includes(String(delivery.status || '').trim().toLowerCase())) {
    return {
      deliveryId,
      status: delivery.status,
      alreadyProcessed: true,
    };
  }

  const templatePayload = parseJsonSafe(delivery.payload) || {};
  const rendered = renderTemplatedEmail({
    templateKey: delivery.template_key,
    payload: templatePayload,
  });

  const config = getEmailConfigSnapshot();
  await emailDeliveryStore.markEmailDeliveryAttemptAsync({
    deliveryId,
    provider: config.provider,
  });

  try {
    const result = await sendEmailAsync({
      toEmail: delivery.to_email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      replyToEmail: delivery.reply_to_email || null,
      suppressDefaultReplyTo: Boolean(payload.suppressDefaultReplyTo),
      metadata: {
        deliveryId,
        jobId: job?.id || null,
        templateKey: delivery.template_key,
        mapId: delivery.map_id || null,
        inviteId: delivery.invite_id || null,
      },
    });

    if (result.status === 'skipped') {
      await emailDeliveryStore.markEmailDeliverySkippedAsync({
        deliveryId,
        provider: result.provider || config.provider,
        providerResponse: result.providerResponse || null,
      });
      return result;
    }

    await emailDeliveryStore.markEmailDeliverySentAsync({
      deliveryId,
      provider: result.provider || config.provider,
      providerMessageId: result.providerMessageId || null,
      providerResponse: result.providerResponse || null,
    });
    return result;
  } catch (error) {
    await emailDeliveryStore.markEmailDeliveryFailedAsync({
      deliveryId,
      provider: config.provider,
      errorText: error?.message || 'Email delivery failed',
      providerResponse: error?.providerResponse || null,
    });
    throw error;
  }
}

module.exports = {
  JOB_TYPES,
  queueTemplatedEmailAsync,
  queueTemplatedEmailsAsync,
  queueCollaborationInviteEmailAsync,
  queueAccessRequestCreatedEmailsAsync,
  queueAccessRequestDecisionEmailAsync,
  queueMembershipRoleChangedEmailAsync,
  queueMembershipRemovedEmailAsync,
  queuePromoCodeSharedEmailAsync,
  queueFeedbackSubmissionEmailsAsync,
  getFeedbackRecipientEmail,
  processEmailDeliveryJobAsync,
};
