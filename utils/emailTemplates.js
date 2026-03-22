const EMAIL_TEMPLATE_KEYS = Object.freeze({
  COLLABORATION_INVITE: 'collaboration.invite',
  COLLABORATION_ACCESS_REQUEST_CREATED: 'collaboration.access_request.created',
  COLLABORATION_ACCESS_REQUEST_APPROVED: 'collaboration.access_request.approved',
  COLLABORATION_ACCESS_REQUEST_DENIED: 'collaboration.access_request.denied',
  COLLABORATION_ROLE_CHANGED: 'collaboration.role.changed',
  COLLABORATION_ACCESS_REMOVED: 'collaboration.access.removed',
});

function normalizeBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized || null;
}

function getDefaultAppBaseUrl() {
  const explicit = normalizeBaseUrl(process.env.APP_BASE_URL);
  if (explicit) return explicit;

  const frontendUrl = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((entry) => normalizeBaseUrl(entry))
    .filter(Boolean)[0];
  if (frontendUrl) return frontendUrl;

  return 'http://localhost:3001';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimText(value, maxLength = 120) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function formatRoleLabel(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return 'collaborator';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDateLabel(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatInviterLabel({ inviterName, inviterEmail }) {
  return trimText(inviterName, 80)
    || trimText(inviterEmail, 120)
    || 'Someone';
}

function renderActionEmail({
  subject,
  intro,
  detailPairs = [],
  instructions,
  appBaseUrl,
  footer = 'If you were not expecting this email, you can safely ignore it.',
}) {
  const safeSubject = escapeHtml(subject);
  const safeIntro = escapeHtml(intro);
  const safeInstructions = instructions ? escapeHtml(instructions) : null;
  const safeAppBaseUrl = escapeHtml(appBaseUrl);
  const safeFooter = footer ? escapeHtml(footer) : null;
  const safePairs = detailPairs
    .filter((pair) => pair && pair.label && pair.value)
    .map((pair) => ({
      label: escapeHtml(pair.label),
      value: escapeHtml(pair.value),
    }));

  const textLines = [intro];
  safePairs.forEach((pair) => {
    textLines.push(`${pair.label}: ${pair.value}`);
  });
  if (instructions) {
    textLines.push('');
    textLines.push(instructions);
  }
  textLines.push(appBaseUrl);
  if (footer) {
    textLines.push('');
    textLines.push(footer);
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937; line-height: 1.5;">
      <h1 style="font-size: 22px; margin-bottom: 16px;">${safeSubject}</h1>
      <p style="margin: 0 0 12px;">${safeIntro}</p>
      ${safePairs.map((pair) => `<p style="margin: 0 0 8px;"><strong>${pair.label}:</strong> ${pair.value}</p>`).join('')}
      ${safeInstructions ? `<p style="margin: 12px 0 16px;">${safeInstructions}</p>` : ''}
      <p style="margin: 0 0 20px;">
        <a href="${safeAppBaseUrl}" style="display: inline-block; padding: 10px 16px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px;">Open Map Mat</a>
      </p>
      ${safeFooter ? `<p style="margin: 0; color: #6b7280; font-size: 14px;">${safeFooter}</p>` : ''}
    </div>
  `.trim();

  return {
    subject,
    text: textLines.join('\n'),
    html,
  };
}

function renderCollaborationInviteEmail(payload = {}) {
  const inviterLabel = formatInviterLabel(payload);
  const mapName = trimText(payload.mapName, 120) || 'Untitled map';
  const roleLabel = formatRoleLabel(payload.role);
  const expiresLabel = formatDateLabel(payload.expiresAt);
  const appBaseUrl = normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl();
  const mapUrlLabel = trimText(payload.mapUrl, 160);
  const inviteeEmail = trimText(payload.inviteeEmail, 160);
  const subject = `${inviterLabel} invited you to ${mapName} on Map Mat`;

  const textLines = [
    `${inviterLabel} invited you to collaborate on "${mapName}" as ${roleLabel} in Map Mat.`,
  ];

  if (mapUrlLabel) {
    textLines.push(`Map URL: ${mapUrlLabel}`);
  }
  if (expiresLabel) {
    textLines.push(`Invite expires: ${expiresLabel}`);
  }
  if (inviteeEmail) {
    textLines.push(`This invite is tied to: ${inviteeEmail}`);
  }

  textLines.push('');
  textLines.push('To accept or decline this invite, sign in to Map Mat and open Account > Invites.');
  textLines.push(appBaseUrl);
  textLines.push('');
  textLines.push('If you were not expecting this invite, you can safely ignore this email.');

  return renderActionEmail({
    subject,
    intro: `${inviterLabel} invited you to collaborate on "${mapName}" as ${roleLabel} in Map Mat.`,
    detailPairs: [
      mapUrlLabel ? { label: 'Map URL', value: mapUrlLabel } : null,
      expiresLabel ? { label: 'Invite expires', value: expiresLabel } : null,
      inviteeEmail ? { label: 'Invite email', value: inviteeEmail } : null,
    ],
    instructions: 'To accept or decline this invite, sign in to Map Mat and open Account > Invites.',
    appBaseUrl,
  });
}

function renderAccessRequestCreatedEmail(payload = {}) {
  const requesterLabel = formatInviterLabel({
    inviterName: payload.requesterName,
    inviterEmail: payload.requesterEmail,
  });
  const mapName = trimText(payload.mapName, 120) || 'Untitled map';
  const requestedRole = formatRoleLabel(payload.requestedRole);
  const message = trimText(payload.message, 500);
  const subject = `${requesterLabel} requested ${requestedRole} access to ${mapName}`;

  return renderActionEmail({
    subject,
    intro: `${requesterLabel} requested ${requestedRole} access to "${mapName}".`,
    detailPairs: [
      message ? { label: 'Message', value: message } : null,
    ],
    instructions: 'To approve or deny this request, open the map Share panel and review Access Requests.',
    appBaseUrl: normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(),
  });
}

function renderAccessRequestDecisionEmail(payload = {}, approved) {
  const actorLabel = formatInviterLabel({
    inviterName: payload.decisionUserName,
    inviterEmail: payload.decisionUserEmail,
  });
  const mapName = trimText(payload.mapName, 120) || 'Untitled map';
  const requestedRole = formatRoleLabel(payload.requestedRole);
  const decisionRole = formatRoleLabel(payload.decisionRole || payload.requestedRole);
  const subject = approved
    ? `${actorLabel} approved your access request for ${mapName}`
    : `${actorLabel} denied your access request for ${mapName}`;

  return renderActionEmail({
    subject,
    intro: approved
      ? `${actorLabel} approved your request for ${decisionRole} access to "${mapName}".`
      : `${actorLabel} denied your request for ${requestedRole} access to "${mapName}".`,
    instructions: approved
      ? 'Open Map Mat to access the shared map.'
      : 'If you still need access, you can request it again from Map Mat.',
    appBaseUrl: normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(),
  });
}

function renderRoleChangedEmail(payload = {}) {
  const actorLabel = formatInviterLabel({
    inviterName: payload.actorName,
    inviterEmail: payload.actorEmail,
  });
  const mapName = trimText(payload.mapName, 120) || 'Untitled map';
  const previousRole = formatRoleLabel(payload.previousRole || 'viewer');
  const nextRole = formatRoleLabel(payload.role || 'viewer');
  const subject = `${actorLabel} changed your access to ${mapName}`;

  return renderActionEmail({
    subject,
    intro: `${actorLabel} changed your access on "${mapName}" from ${previousRole} to ${nextRole}.`,
    instructions: 'Open Map Mat to review your updated access.',
    appBaseUrl: normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(),
  });
}

function renderAccessRemovedEmail(payload = {}) {
  const actorLabel = formatInviterLabel({
    inviterName: payload.actorName,
    inviterEmail: payload.actorEmail,
  });
  const mapName = trimText(payload.mapName, 120) || 'Untitled map';
  const previousRole = formatRoleLabel(payload.previousRole || 'viewer');
  const subject = `${actorLabel} removed your access to ${mapName}`;

  return renderActionEmail({
    subject,
    intro: `${actorLabel} removed your ${previousRole} access to "${mapName}".`,
    instructions: 'If you still need access, open Map Mat and submit an access request if the map allows it.',
    appBaseUrl: normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(),
  });
}

function renderTemplatedEmail({ templateKey, payload }) {
  switch (String(templateKey || '').trim()) {
    case EMAIL_TEMPLATE_KEYS.COLLABORATION_INVITE:
      return renderCollaborationInviteEmail(payload);
    case EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_CREATED:
      return renderAccessRequestCreatedEmail(payload);
    case EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_APPROVED:
      return renderAccessRequestDecisionEmail(payload, true);
    case EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REQUEST_DENIED:
      return renderAccessRequestDecisionEmail(payload, false);
    case EMAIL_TEMPLATE_KEYS.COLLABORATION_ROLE_CHANGED:
      return renderRoleChangedEmail(payload);
    case EMAIL_TEMPLATE_KEYS.COLLABORATION_ACCESS_REMOVED:
      return renderAccessRemovedEmail(payload);
    default:
      throw new Error(`Unknown email template: ${templateKey}`);
  }
}

module.exports = {
  EMAIL_TEMPLATE_KEYS,
  getDefaultAppBaseUrl,
  renderTemplatedEmail,
};
