const EMAIL_TEMPLATE_KEYS = Object.freeze({
  COLLABORATION_INVITE: 'collaboration.invite',
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

  const safeSubject = escapeHtml(subject);
  const safeInviterLabel = escapeHtml(inviterLabel);
  const safeMapName = escapeHtml(mapName);
  const safeRoleLabel = escapeHtml(roleLabel);
  const safeAppBaseUrl = escapeHtml(appBaseUrl);
  const safeMapUrlLabel = mapUrlLabel ? escapeHtml(mapUrlLabel) : null;
  const safeExpiresLabel = expiresLabel ? escapeHtml(expiresLabel) : null;
  const safeInviteeEmail = inviteeEmail ? escapeHtml(inviteeEmail) : null;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937; line-height: 1.5;">
      <h1 style="font-size: 22px; margin-bottom: 16px;">${safeSubject}</h1>
      <p style="margin: 0 0 12px;">${safeInviterLabel} invited you to collaborate on <strong>${safeMapName}</strong> as <strong>${safeRoleLabel}</strong> in Map Mat.</p>
      ${safeMapUrlLabel ? `<p style="margin: 0 0 8px;"><strong>Map URL:</strong> ${safeMapUrlLabel}</p>` : ''}
      ${safeExpiresLabel ? `<p style="margin: 0 0 8px;"><strong>Invite expires:</strong> ${safeExpiresLabel}</p>` : ''}
      ${safeInviteeEmail ? `<p style="margin: 0 0 16px;"><strong>Invite email:</strong> ${safeInviteeEmail}</p>` : ''}
      <p style="margin: 0 0 16px;">To accept or decline this invite, sign in to Map Mat and open <strong>Account &gt; Invites</strong>.</p>
      <p style="margin: 0 0 20px;">
        <a href="${safeAppBaseUrl}" style="display: inline-block; padding: 10px 16px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px;">Open Map Mat</a>
      </p>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">If you were not expecting this invite, you can safely ignore this email.</p>
    </div>
  `.trim();

  return {
    subject,
    text: textLines.join('\n'),
    html,
  };
}

function renderTemplatedEmail({ templateKey, payload }) {
  switch (String(templateKey || '').trim()) {
    case EMAIL_TEMPLATE_KEYS.COLLABORATION_INVITE:
      return renderCollaborationInviteEmail(payload);
    default:
      throw new Error(`Unknown email template: ${templateKey}`);
  }
}

module.exports = {
  EMAIL_TEMPLATE_KEYS,
  getDefaultAppBaseUrl,
  renderTemplatedEmail,
};
