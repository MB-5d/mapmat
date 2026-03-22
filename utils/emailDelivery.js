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
}) {
  await emailDeliveryStore.ensureEmailDeliverySchemaAsync();

  const config = getEmailConfigSnapshot();
  const rendered = renderTemplatedEmail({ templateKey, payload });
  const delivery = await emailDeliveryStore.createEmailDeliveryAsync({
    templateKey,
    toEmail,
    fromEmail: config.fromAddress,
    replyToEmail: config.replyToAddress,
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
  processEmailDeliveryJobAsync,
};
