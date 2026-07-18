const { appSemantics, primitiveColors } = require('../scripts/design-system-source');

const EMAIL_TEMPLATE_KEYS = Object.freeze({
  COLLABORATION_INVITE: 'collaboration.invite',
  COLLABORATION_ACCESS_REQUEST_CREATED: 'collaboration.access_request.created',
  COLLABORATION_ACCESS_REQUEST_APPROVED: 'collaboration.access_request.approved',
  COLLABORATION_ACCESS_REQUEST_DENIED: 'collaboration.access_request.denied',
  COLLABORATION_ROLE_CHANGED: 'collaboration.role.changed',
  COLLABORATION_ACCESS_REMOVED: 'collaboration.access.removed',
  AUTH_EMAIL_VERIFICATION: 'auth.email_verification',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  MARKETING_CONTACT: 'marketing.contact',
  MARKETING_CONTACT_CONFIRMATION: 'marketing.contact.confirmation',
  FEEDBACK_INTERNAL: 'feedback.submitted.internal',
  FEEDBACK_CONFIRMATION: 'feedback.submitted.confirmation',
  PROMO_CODE_SHARED: 'promo_code.shared',
});

// Email clients require inline values. Resolve them from the shared Vellic
// primitives so email markup cannot introduce an independent color palette.
const VELLIC_EMAIL_THEME = Object.freeze({
  background: primitiveColors.neutral['100'],
  card: primitiveColors.neutral.white,
  accentSoft: appSemantics.light['ui-color-accent-soft'],
  text: primitiveColors.neutral['900'],
  secondary: primitiveColors.neutral['600'],
  action: primitiveColors.brand['700'],
  onAction: primitiveColors.neutral.white,
  border: primitiveColors.neutral['300'],
});

function normalizeBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized || null;
}

function buildAppUrl(baseUrl, path = '/') {
  const normalizedBase = normalizeBaseUrl(baseUrl) || getDefaultAppBaseUrl();
  const normalizedPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${String(path || '')}`;
  try {
    return new URL(normalizedPath, `${normalizedBase}/`).toString();
  } catch {
    return `${normalizedBase}${normalizedPath}`;
  }
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

function renderDetailRowsHtml(detailPairs = []) {
  return detailPairs
    .filter((pair) => pair && pair.label && pair.value !== null && pair.value !== undefined && String(pair.value).trim())
    .map((pair) => `
      <tr>
        <td style="padding:8px 12px 8px 0;width:132px;color:${VELLIC_EMAIL_THEME.secondary};font-size:13px;line-height:20px;vertical-align:top;">${escapeHtml(pair.label)}</td>
        <td style="padding:8px 0;color:${VELLIC_EMAIL_THEME.text};font-size:14px;line-height:20px;vertical-align:top;word-break:break-word;">${escapeHtml(pair.value)}</td>
      </tr>`)
    .join('');
}

function renderEmailShell({
  heading,
  preheader = '',
  contentHtml = '',
  footer = 'If you were not expecting this email, you can safely ignore it.',
  appBaseUrl = getDefaultAppBaseUrl(),
}) {
  const normalizedAppBaseUrl = normalizeBaseUrl(appBaseUrl) || getDefaultAppBaseUrl();
  const logoUrl = buildAppUrl(normalizedAppBaseUrl, '/vellic-logo.png');
  const privacyUrl = buildAppUrl(normalizedAppBaseUrl, '/privacy');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${VELLIC_EMAIL_THEME.background};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader || heading)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${VELLIC_EMAIL_THEME.background};">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:${VELLIC_EMAIL_THEME.card};border:1px solid ${VELLIC_EMAIL_THEME.border};border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,.10);">
          <tr><td style="padding:32px;font-family:'Sora',Arial,Helvetica,sans-serif;color:${VELLIC_EMAIL_THEME.text};">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding:0 0 20px;vertical-align:middle;">
                  <img src="${escapeHtml(logoUrl)}" width="124" height="32" alt="Vellic" style="display:block;width:124px;height:32px;border:0;">
                </td>
              </tr>
              <tr><td><h1 style="margin:0 0 20px;font-size:24px;font-weight:600;line-height:32px;color:${VELLIC_EMAIL_THEME.text};">${escapeHtml(heading)}</h1></td></tr>
              <tr><td>${contentHtml}</td></tr>
              <tr><td style="padding-top:24px;">
                <div style="border-top:1px solid ${VELLIC_EMAIL_THEME.border};padding-top:12px;color:${VELLIC_EMAIL_THEME.secondary};font-size:13px;line-height:20px;">
                  ${footer ? `<p style="margin:0 0 12px;">${escapeHtml(footer)}</p>` : ''}
                  <p style="margin:0;">Vellic &middot; <a href="mailto:support@vellic.io" style="color:${VELLIC_EMAIL_THEME.secondary};">Support</a> &middot; <a href="${escapeHtml(privacyUrl)}" style="color:${VELLIC_EMAIL_THEME.secondary};">Privacy</a></p>
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderCtaHtml({ url, label }) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 0;"><tr><td bgcolor="${VELLIC_EMAIL_THEME.action}" style="border-radius:8px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;color:${VELLIC_EMAIL_THEME.onAction};text-decoration:none;font-family:'Sora',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;line-height:20px;">${escapeHtml(label)}</a></td></tr></table>`;
}

function renderMessageHtml(label, message) {
  if (!message) return '';
  return `<div style="margin-top:16px;padding:16px;background:${VELLIC_EMAIL_THEME.background};border:1px solid ${VELLIC_EMAIL_THEME.border};border-radius:8px;"><p style="margin:0 0 8px;color:${VELLIC_EMAIL_THEME.secondary};font-size:12px;font-weight:600;line-height:18px;text-transform:uppercase;">${escapeHtml(label)}</p><p style="margin:0;color:${VELLIC_EMAIL_THEME.text};font-size:14px;line-height:22px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(message)}</p></div>`;
}

function renderActionEmail({
  subject,
  intro,
  detailPairs = [],
  instructions,
  appBaseUrl,
  actionUrl = null,
  actionLabel = 'Open Vellic',
  footer = 'If you were not expecting this email, you can safely ignore it.',
}) {
  const normalizedPairs = detailPairs.filter((pair) => pair && pair.label && pair.value);

  const textLines = [intro];
  normalizedPairs.forEach((pair) => {
    textLines.push(`${pair.label}: ${pair.value}`);
  });
  if (instructions) {
    textLines.push('');
    textLines.push(instructions);
  }
  textLines.push(actionUrl || appBaseUrl);
  if (footer) {
    textLines.push('');
    textLines.push(footer);
  }

  const html = renderEmailShell({
    heading: subject,
    preheader: intro,
    appBaseUrl,
    footer,
    contentHtml: `
      <p style="margin:0 0 12px;font-size:16px;line-height:24px;">${escapeHtml(intro)}</p>
      ${normalizedPairs.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">${renderDetailRowsHtml(normalizedPairs)}</table>` : ''}
      ${instructions ? `<p style="margin:16px 0 0;color:${VELLIC_EMAIL_THEME.secondary};font-size:16px;line-height:24px;">${escapeHtml(instructions)}</p>` : ''}
      ${renderCtaHtml({ url: actionUrl || appBaseUrl, label: actionLabel })}`,
  });

  return {
    subject,
    text: textLines.join('\n'),
    html,
  };
}

function renderCodeEmail({
  subject,
  intro,
  code,
  expiresMinutes,
  instructions = 'Enter this code in Vellic to continue.',
  footer = 'If you were not expecting this email, you can safely ignore it.',
  appBaseUrl = getDefaultAppBaseUrl(),
}) {
  const safeCode = escapeHtml(String(code || '').trim());
  const expiryLabel = Number.isFinite(Number(expiresMinutes)) && Number(expiresMinutes) > 0
    ? `This code expires in ${Number(expiresMinutes)} minutes.`
    : null;

  const textLines = [
    intro,
    '',
    `Your code: ${String(code || '').trim()}`,
  ];

  if (expiryLabel) {
    textLines.push(expiryLabel);
  }

  textLines.push('');
  textLines.push(instructions);
  textLines.push(appBaseUrl);

  if (footer) {
    textLines.push('');
    textLines.push(footer);
  }

  return {
    subject,
    text: textLines.join('\n'),
    html: renderEmailShell({
      heading: subject,
      preheader: intro,
      appBaseUrl,
      footer,
      contentHtml: `
        <p style="margin:0 0 20px;font-size:16px;line-height:24px;">${escapeHtml(intro)}</p>
        <div style="padding:24px;background:${VELLIC_EMAIL_THEME.accentSoft};border-radius:12px;text-align:center;">
          <div style="margin-bottom:8px;color:${VELLIC_EMAIL_THEME.secondary};font-size:12px;font-weight:600;line-height:18px;text-transform:uppercase;">Verification code</div>
          <div style="color:${VELLIC_EMAIL_THEME.text};font-size:32px;font-weight:700;line-height:40px;letter-spacing:.18em;">${safeCode}</div>
          ${expiryLabel ? `<div style="margin-top:8px;color:${VELLIC_EMAIL_THEME.secondary};font-size:13px;line-height:20px;">${escapeHtml(expiryLabel)}</div>` : ''}
        </div>
        <p style="margin:20px 0 0;color:${VELLIC_EMAIL_THEME.secondary};font-size:16px;line-height:24px;">${escapeHtml(instructions)}</p>
        ${renderCtaHtml({ url: appBaseUrl, label: 'Open Vellic' })}`,
    }),
  };
}

function renderCollaborationInviteEmail(payload = {}) {
  const inviterLabel = formatInviterLabel(payload);
  const mapName = trimText(payload.mapName, 120) || 'Untitled map';
  const roleLabel = formatRoleLabel(payload.role);
  const appBaseUrl = normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl();
  const mapUrlLabel = trimText(payload.mapUrl, 160);
  const inviteeEmail = trimText(payload.inviteeEmail, 160);
  const subject = `${inviterLabel} invited you to ${mapName} on Vellic`;
  const actionUrl = buildAppUrl(appBaseUrl, `/app/invites/accept/${encodeURIComponent(String(payload.inviteToken || ''))}`);

  const textLines = [
    `${inviterLabel} invited you to collaborate on "${mapName}" as ${roleLabel} in Vellic.`,
  ];

  if (mapUrlLabel) {
    textLines.push(`Map URL: ${mapUrlLabel}`);
  }
  if (inviteeEmail) {
    textLines.push(`This invite is tied to: ${inviteeEmail}`);
  }

  textLines.push('');
  textLines.push('Use the link below to sign in and accept this invite.');
  textLines.push(actionUrl);
  textLines.push('');
  textLines.push('If you were not expecting this invite, you can safely ignore this email.');

  return renderActionEmail({
    subject,
    intro: `${inviterLabel} invited you to collaborate on "${mapName}" as ${roleLabel} in Vellic.`,
    detailPairs: [
      mapUrlLabel ? { label: 'Map URL', value: mapUrlLabel } : null,
      inviteeEmail ? { label: 'Invite email', value: inviteeEmail } : null,
    ],
    instructions: 'Use the button below to sign in and accept or review this invite.',
    appBaseUrl,
    actionUrl,
    actionLabel: 'Open Invite',
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
    actionUrl: buildAppUrl(normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(), `/app/maps/${encodeURIComponent(String(payload.mapId || ''))}`),
    actionLabel: 'Review Request',
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
      ? 'Open Vellic to access the shared map.'
      : 'If you still need access, you can request it again from Vellic.',
    appBaseUrl: normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(),
    actionUrl: buildAppUrl(normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(), `/app/maps/${encodeURIComponent(String(payload.mapId || ''))}`),
    actionLabel: approved ? 'Open Shared Map' : 'Open Vellic',
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
    instructions: 'Open Vellic to review your updated access.',
    appBaseUrl: normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(),
    actionUrl: buildAppUrl(normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(), `/app/maps/${encodeURIComponent(String(payload.mapId || ''))}`),
    actionLabel: 'Open Shared Map',
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
    instructions: 'If you still need access, open Vellic and submit an access request if the map allows it.',
    appBaseUrl: normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(),
    actionUrl: buildAppUrl(normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl(), `/app/maps/${encodeURIComponent(String(payload.mapId || ''))}`),
    actionLabel: 'Open Map Access',
  });
}

function renderAuthEmailVerificationEmail(payload = {}) {
  const appBaseUrl = normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl();
  const name = trimText(payload.name, 80);
  const intro = name
    ? `${name}, use this code to verify your email address for Vellic.`
    : 'Use this code to verify your email address for Vellic.';

  return renderCodeEmail({
    subject: 'Verify your Vellic email',
    intro,
    code: payload.code,
    expiresMinutes: payload.expiresMinutes,
    instructions: 'Enter this code in the verification step to finish setting up your account.',
    appBaseUrl,
  });
}

function renderAuthPasswordResetEmail(payload = {}) {
  const appBaseUrl = normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl();
  const name = trimText(payload.name, 80);
  const intro = name
    ? `${name}, use this code to reset your Vellic password.`
    : 'Use this code to reset your Vellic password.';

  return renderCodeEmail({
    subject: 'Reset your Vellic password',
    intro,
    code: payload.code,
    expiresMinutes: payload.expiresMinutes,
    instructions: 'Enter this code with your new password to finish resetting your account.',
    appBaseUrl,
  });
}

function renderMarketingContactEmail(payload = {}) {
  const targetKey = String(payload.targetKey || '').trim().toLowerCase() === 'support'
    ? 'support'
    : 'inquiries';
  const targetLabel = targetKey === 'support' ? 'Product support' : 'Inquiries & Feedback';
  const subjectPrefix = targetKey === 'support' ? 'Vellic support' : 'Vellic inquiry';
  const name = trimText(payload.name, 120) || 'Unknown sender';
  const email = trimText(payload.email, 240) || 'No email provided';
  const reason = trimText(payload.reason, 120) || 'General question';
  const reasonDetail = trimText(payload.reasonDetail, 240);
  const message = trimText(payload.message, 4000) || 'No message provided.';
  const submittedAt = formatDateLabel(payload.submittedAt);
  const sourceUrl = trimText(payload.sourceUrl, 500);
  const subject = `${subjectPrefix}: ${reason}`;
  const detailPairs = [
    { label: 'Name', value: name },
    { label: 'Email', value: email },
    { label: 'Inbox', value: targetLabel },
    { label: 'Reason', value: reason },
    reasonDetail ? { label: 'Reason detail', value: reasonDetail } : null,
    submittedAt ? { label: 'Submitted', value: submittedAt } : null,
    sourceUrl ? { label: 'Source page', value: sourceUrl } : null,
  ].filter(Boolean);

  const textLines = [
    `${name} submitted the ${targetLabel} contact form.`,
    ...detailPairs.map((pair) => `${pair.label}: ${pair.value}`),
    '',
    'Message:',
    message,
  ];

  return {
    subject,
    text: textLines.join('\n'),
    html: renderEmailShell({
      heading: subject,
      preheader: `${name} submitted the ${targetLabel} contact form.`,
      contentHtml: `
        <p style="margin:0 0 12px;font-size:16px;line-height:24px;">${escapeHtml(`${name} submitted the ${targetLabel} contact form.`)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${renderDetailRowsHtml(detailPairs)}</table>
        ${renderMessageHtml('Message', message)}
        <p style="margin:16px 0 0;color:${VELLIC_EMAIL_THEME.secondary};font-size:13px;line-height:20px;">Reply directly to this email to follow up.</p>`,
      footer: `This message was submitted through the Vellic ${targetKey === 'support' ? 'support' : 'contact'} form.`,
    }),
  };
}

function renderMarketingContactConfirmationEmail(payload = {}) {
  const targetKey = String(payload.targetKey || '').trim().toLowerCase() === 'support'
    ? 'support'
    : 'inquiries';
  const name = trimText(payload.name, 120);
  const reason = trimText(payload.reason, 120) || 'your message';
  const heading = targetKey === 'support'
    ? 'We received your support request'
    : 'Thanks for contacting Vellic';
  const intro = targetKey === 'support'
    ? `${name ? `${name}, w` : 'W'}e received your support request and will look into it.`
    : `${name ? `${name}, t` : 'T'}hanks for reaching out. Your message is with the Vellic team.`;
  const detailPairs = [{ label: 'Topic', value: reason }];
  const text = [intro, `Topic: ${reason}`, '', 'You can reply to this email if you need to add context.'].join('\n');

  return {
    subject: heading,
    text,
    html: renderEmailShell({
      heading,
      preheader: intro,
      contentHtml: `
        <p style="margin:0 0 12px;font-size:16px;line-height:24px;">${escapeHtml(intro)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${renderDetailRowsHtml(detailPairs)}</table>
        <p style="margin:16px 0 0;color:${VELLIC_EMAIL_THEME.secondary};font-size:16px;line-height:24px;">You can reply to this email if you need to add context.</p>`,
      footer: 'This confirmation was sent because this address was entered in a Vellic contact form.',
    }),
  };
}

const FEEDBACK_INTENT_COPY = Object.freeze({
  broken: {
    heading: 'Something appears to be broken.',
    confirmationHeading: 'We’ll look into this',
    confirmationBody: 'Thanks for the report. We’ll review what happened and look into what broke.',
  },
  confusing: {
    heading: 'A user found something confusing.',
    confirmationHeading: 'Thanks for flagging this',
    confirmationBody: 'We’ll review what felt unclear and use your feedback to make Vellic easier to understand.',
  },
  idea: {
    heading: 'A user shared an idea.',
    confirmationHeading: 'Thanks for the idea',
    confirmationBody: 'Your idea is now with the Vellic team for review.',
  },
  like: {
    heading: 'A user shared something they liked.',
    confirmationHeading: 'Glad to hear it',
    confirmationBody: 'Thanks for telling us what worked well for you.',
  },
  dislike: {
    heading: 'A user shared something they disliked.',
    confirmationHeading: 'Thanks for being direct',
    confirmationBody: 'We’ll review what did not work well for you.',
  },
});

const FEEDBACK_SCOPE_COPY = Object.freeze({
  whole_app: { label: 'Whole app', body: 'This feedback applies across the Vellic app.' },
  flow: { label: 'This flow', body: 'This feedback applies to the flow the user was completing.' },
  specific_thing: { label: 'Specific thing', body: 'This feedback applies to a specific component or element.' },
});

function normalizeFeedbackPayload(payload = {}) {
  const intent = FEEDBACK_INTENT_COPY[payload.intent] ? payload.intent : 'idea';
  const scope = FEEDBACK_SCOPE_COPY[payload.scope] ? payload.scope : 'whole_app';
  const contextValue = payload.context && typeof payload.context === 'object'
    ? JSON.stringify(payload.context)
    : payload.context;
  return {
    intent,
    scope,
    intentCopy: FEEDBACK_INTENT_COPY[intent],
    scopeCopy: FEEDBACK_SCOPE_COPY[scope],
    actorName: trimText(payload.actorName || payload.actor_name, 120) || 'Anonymous',
    actorEmail: trimText(payload.actorEmail || payload.actor_email, 240),
    rating: Number.isFinite(Number(payload.rating)) ? String(Number(payload.rating)) : null,
    message: trimText(payload.message, 4000),
    surface: trimText(payload.surface, 160),
    routePath: trimText(payload.routePath || payload.route_path, 500),
    routeSection: trimText(payload.routeSection || payload.route_section, 240),
    mapId: trimText(payload.mapId || payload.map_id, 160),
    shareId: trimText(payload.shareId || payload.share_id, 160),
    component: trimText(payload.componentLabel || payload.component_label || payload.componentKey || payload.component_key, 240),
    screenshotUrl: trimText(payload.screenshotUrl || payload.screenshot_url || payload.screenshotPath || payload.screenshot_path, 1000),
    context: trimText(contextValue, 1000),
    allowFollowUp: Boolean(payload.allowFollowUp ?? payload.allow_follow_up),
    submittedAt: formatDateLabel(payload.submittedAt || payload.submitted_at || payload.createdAt || payload.created_at),
  };
}

function renderFeedbackInternalEmail(payload = {}) {
  const feedback = normalizeFeedbackPayload(payload);
  const detailPairs = [
    { label: 'Intent', value: feedback.intent },
    { label: 'Scope', value: feedback.scopeCopy.label },
    { label: 'Scope context', value: feedback.scopeCopy.body },
    feedback.rating ? { label: 'Satisfaction', value: `${feedback.rating} / 5` } : null,
    feedback.surface ? { label: 'Surface', value: feedback.surface } : null,
    feedback.routePath ? { label: 'Route', value: feedback.routePath } : null,
    feedback.routeSection ? { label: 'Route section', value: feedback.routeSection } : null,
    feedback.mapId ? { label: 'Map', value: feedback.mapId } : null,
    feedback.shareId ? { label: 'Share', value: feedback.shareId } : null,
    feedback.component ? { label: 'Selected component', value: feedback.component } : null,
    feedback.screenshotUrl ? { label: 'Screenshot', value: feedback.screenshotUrl } : null,
    feedback.context ? { label: 'Additional context', value: feedback.context } : null,
    { label: 'Submitted by', value: feedback.actorName },
    feedback.actorEmail ? { label: 'Contact', value: feedback.actorEmail } : null,
    { label: 'Follow-up', value: feedback.allowFollowUp && feedback.actorEmail ? 'Allowed — reply to this email' : 'Not permitted' },
    feedback.submittedAt ? { label: 'Submitted', value: feedback.submittedAt } : null,
  ].filter(Boolean);
  const textLines = [
    feedback.intentCopy.heading,
    feedback.scopeCopy.body,
    ...detailPairs.map((pair) => `${pair.label}: ${pair.value}`),
  ];
  if (feedback.message) textLines.push('', 'Message:', feedback.message);

  return {
    subject: `Vellic feedback: ${feedback.intentCopy.heading}`,
    text: textLines.join('\n'),
    html: renderEmailShell({
      heading: feedback.intentCopy.heading,
      preheader: feedback.scopeCopy.body,
      contentHtml: `
        <div style="margin-bottom:16px;padding:16px;background:${VELLIC_EMAIL_THEME.accentSoft};border-radius:12px;color:${VELLIC_EMAIL_THEME.text};font-size:14px;line-height:22px;">${escapeHtml(feedback.scopeCopy.body)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${renderDetailRowsHtml(detailPairs)}</table>
        ${renderMessageHtml('Feedback message', feedback.message)}`,
      footer: 'This internal alert was created from the Vellic Feedback tab.',
    }),
  };
}

function renderFeedbackConfirmationEmail(payload = {}) {
  const feedback = normalizeFeedbackPayload(payload);
  const detailPairs = [
    { label: 'Feedback type', value: feedback.intent },
    { label: 'Scope', value: feedback.scopeCopy.label },
  ];
  const text = [
    feedback.intentCopy.confirmationBody,
    ...detailPairs.map((pair) => `${pair.label}: ${pair.value}`),
    '',
    'Because you allowed follow-up, the Vellic team may reply to this address.',
  ].join('\n');

  return {
    subject: feedback.intentCopy.confirmationHeading,
    text,
    html: renderEmailShell({
      heading: feedback.intentCopy.confirmationHeading,
      preheader: feedback.intentCopy.confirmationBody,
      contentHtml: `
        <p style="margin:0 0 12px;font-size:16px;line-height:24px;">${escapeHtml(feedback.intentCopy.confirmationBody)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${renderDetailRowsHtml(detailPairs)}</table>
        <p style="margin:16px 0 0;color:${VELLIC_EMAIL_THEME.secondary};font-size:13px;line-height:20px;">Because you allowed follow-up, the Vellic team may reply to this address.</p>`,
      footer: 'This confirmation was sent because you allowed follow-up on feedback submitted to Vellic.',
    }),
  };
}

function renderPromoCodeSharedEmail(payload = {}) {
  const appBaseUrl = normalizeBaseUrl(payload.appBaseUrl) || getDefaultAppBaseUrl();
  const codes = Array.isArray(payload.codes) ? payload.codes : [];
  const codeLabels = codes
    .map((entry) => trimText(entry?.code, 80))
    .filter(Boolean);
  const offerLabel = trimText(payload.offerLabel, 120)
    || trimText(codes[0]?.offerLabel, 120)
    || 'Vellic promo';
  const campaignKey = trimText(payload.campaignKey, 120);
  const firstTimeOrderOnly = codes.some((entry) => Boolean(entry?.firstTimeOrderOnly));
  const maxRedemptions = codes
    .map((entry) => Number(entry?.maxRedemptions || 0))
    .filter((value) => Number.isFinite(value) && value > 0)[0] || null;
  const codeWord = codeLabels.length === 1 ? 'code' : 'codes';
  const subject = codeLabels.length === 1
    ? `Your Vellic promo code: ${codeLabels[0]}`
    : `Your Vellic promo codes`;
  const intro = `Here ${codeLabels.length === 1 ? 'is' : 'are'} your ${offerLabel} ${codeWord}.`;
  const instructions = codes.some((entry) => entry?.provider === 'stripe')
    ? 'Choose your plan in Vellic, then enter the promo code at Stripe checkout.'
    : 'Open Vellic and contact us if you need help applying this promo to your account.';
  const detailPairs = [
    { label: codeLabels.length === 1 ? 'Promo code' : 'Promo codes', value: codeLabels.join(', ') || 'Unavailable' },
    { label: 'Offer', value: offerLabel },
    campaignKey ? { label: 'Campaign', value: campaignKey } : null,
    firstTimeOrderOnly ? { label: 'First-time order only', value: 'Yes' } : null,
    maxRedemptions ? { label: 'Redemptions', value: String(maxRedemptions) } : null,
  ].filter(Boolean);

  return renderActionEmail({
    subject,
    intro,
    detailPairs,
    instructions,
    appBaseUrl,
    actionUrl: buildAppUrl(appBaseUrl, '/app'),
    actionLabel: 'Open Vellic',
    footer: 'If you were not expecting this promo code, you can safely ignore this email.',
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
    case EMAIL_TEMPLATE_KEYS.AUTH_EMAIL_VERIFICATION:
      return renderAuthEmailVerificationEmail(payload);
    case EMAIL_TEMPLATE_KEYS.AUTH_PASSWORD_RESET:
      return renderAuthPasswordResetEmail(payload);
    case EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT:
      return renderMarketingContactEmail(payload);
    case EMAIL_TEMPLATE_KEYS.MARKETING_CONTACT_CONFIRMATION:
      return renderMarketingContactConfirmationEmail(payload);
    case EMAIL_TEMPLATE_KEYS.FEEDBACK_INTERNAL:
      return renderFeedbackInternalEmail(payload);
    case EMAIL_TEMPLATE_KEYS.FEEDBACK_CONFIRMATION:
      return renderFeedbackConfirmationEmail(payload);
    case EMAIL_TEMPLATE_KEYS.PROMO_CODE_SHARED:
      return renderPromoCodeSharedEmail(payload);
    default:
      throw new Error(`Unknown email template: ${templateKey}`);
  }
}

module.exports = {
  EMAIL_TEMPLATE_KEYS,
  getDefaultAppBaseUrl,
  renderTemplatedEmail,
};
