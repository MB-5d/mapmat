const { EMAIL_TEMPLATE_KEYS, getDefaultAppBaseUrl } = require('./emailTemplates');

const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_PUBLIC_DOMAIN;
const SUPPORTED_EMAIL_PROVIDERS = new Set(['disabled', 'log', 'resend', 'postmark']);
const SUPPORTED_COPY_MODES = new Set(['cc', 'bcc']);
const COPY_BLOCKED_TEMPLATE_KEYS = new Set([
  EMAIL_TEMPLATE_KEYS.AUTH_EMAIL_VERIFICATION,
  EMAIL_TEMPLATE_KEYS.AUTH_PASSWORD_RESET,
]);

function normalizeProviderName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return isProd ? 'disabled' : 'log';
  return SUPPORTED_EMAIL_PROVIDERS.has(normalized) ? normalized : 'disabled';
}

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase() || null;
}

function normalizeEmailAddressList(value) {
  const seen = new Set();
  return String(value || '')
    .split(/[,\n]/)
    .map((entry) => normalizeEmailAddress(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function normalizeOptionalText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeCopyMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPPORTED_COPY_MODES.has(normalized) ? normalized : 'bcc';
}

function getEmailConfigSnapshot() {
  const provider = normalizeProviderName(process.env.EMAIL_PROVIDER);
  const fromAddress = normalizeEmailAddress(process.env.EMAIL_FROM_ADDRESS || 'noreply@vellic.local');
  const fromName = normalizeOptionalText(process.env.EMAIL_FROM_NAME || 'Vellic');
  const replyToAddress = normalizeEmailAddress(process.env.EMAIL_REPLY_TO_ADDRESS || '');
  const appBaseUrl = getDefaultAppBaseUrl();
  const resendWebhookSecret = normalizeOptionalText(process.env.RESEND_WEBHOOK_SECRET);
  const postmarkWebhookBasicUsername = normalizeOptionalText(process.env.POSTMARK_WEBHOOK_BASIC_USERNAME);
  const postmarkWebhookBasicPassword = normalizeOptionalText(process.env.POSTMARK_WEBHOOK_BASIC_PASSWORD);
  const postmarkWebhookToken = normalizeOptionalText(process.env.POSTMARK_WEBHOOK_TOKEN);
  const postmarkWebhookTokenHeader = normalizeOptionalText(process.env.POSTMARK_WEBHOOK_TOKEN_HEADER)
    || 'x-postmark-webhook-token';
  const copyToAddresses = normalizeEmailAddressList(process.env.EMAIL_COPY_TO_ADDRESSES);
  const copyMode = normalizeCopyMode(process.env.EMAIL_COPY_MODE);
  const recipientOverrideAddresses = normalizeEmailAddressList(process.env.EMAIL_RECIPIENT_OVERRIDE_ADDRESSES);

  return {
    provider,
    fromAddress,
    fromName,
    replyToAddress,
    appBaseUrl,
    resendApiKeyConfigured: !!normalizeOptionalText(process.env.RESEND_API_KEY),
    postmarkServerTokenConfigured: !!normalizeOptionalText(process.env.POSTMARK_SERVER_TOKEN),
    resendWebhookSecretConfigured: !!resendWebhookSecret,
    postmarkWebhookBasicAuthConfigured: !!(postmarkWebhookBasicUsername && postmarkWebhookBasicPassword),
    postmarkWebhookTokenConfigured: !!postmarkWebhookToken,
    postmarkWebhookTokenHeader,
    copyToConfigured: copyToAddresses.length > 0,
    copyToCount: copyToAddresses.length,
    copyMode,
    copyToAddresses,
    recipientOverrideConfigured: recipientOverrideAddresses.length > 0,
    recipientOverrideCount: recipientOverrideAddresses.length,
    recipientOverrideAddresses,
  };
}

function getFromHeader(config) {
  if (!config.fromAddress) {
    throw new Error('EMAIL_FROM_ADDRESS is required for email delivery.');
  }
  if (!config.fromName) return config.fromAddress;
  const escapedName = config.fromName.replace(/"/g, '\\"');
  return `"${escapedName}" <${config.fromAddress}>`;
}

function buildHealthSnapshot() {
  const config = getEmailConfigSnapshot();
  return {
    ok: true,
    provider: config.provider,
    fromAddressConfigured: !!config.fromAddress,
    replyToConfigured: !!config.replyToAddress,
    appBaseUrl: config.appBaseUrl,
    resendWebhookSecretConfigured: config.resendWebhookSecretConfigured,
    postmarkWebhookBasicAuthConfigured: config.postmarkWebhookBasicAuthConfigured,
    postmarkWebhookTokenConfigured: config.postmarkWebhookTokenConfigured,
    postmarkWebhookTokenHeader: config.postmarkWebhookTokenHeader,
    copyToConfigured: config.copyToConfigured,
    copyToCount: config.copyToCount,
    copyMode: config.copyMode,
    recipientOverrideConfigured: config.recipientOverrideConfigured,
    recipientOverrideCount: config.recipientOverrideCount,
    providerConfigured:
      config.provider === 'log'
      || config.provider === 'disabled'
      || (config.provider === 'resend' && config.resendApiKeyConfigured)
      || (config.provider === 'postmark' && config.postmarkServerTokenConfigured),
    providerWebhookConfigured:
      config.provider === 'log'
      || config.provider === 'disabled'
      || (config.provider === 'resend' && config.resendWebhookSecretConfigured)
      || (
        config.provider === 'postmark'
        && (config.postmarkWebhookBasicAuthConfigured || config.postmarkWebhookTokenConfigured)
      ),
  };
}

function shouldSuppressCopies(metadata) {
  const templateKey = String(metadata?.templateKey || '').trim();
  return COPY_BLOCKED_TEMPLATE_KEYS.has(templateKey);
}

function resolveDeliveryRecipients({ config, toEmail, metadata = null }) {
  const toEmails = config.recipientOverrideAddresses.length > 0
    ? config.recipientOverrideAddresses
    : [toEmail];
  const toSet = new Set(toEmails);
  const copySuppressed = shouldSuppressCopies(metadata);
  const copyEmails = copySuppressed
    ? []
    : config.copyToAddresses.filter((email) => !toSet.has(email));
  const ccEmails = config.copyMode === 'cc' ? copyEmails : [];
  const bccEmails = config.copyMode === 'bcc' ? copyEmails : [];

  return {
    originalToEmail: toEmail,
    toEmails,
    ccEmails,
    bccEmails,
    copied: copyEmails.length > 0,
    copySuppressed,
    overridden: config.recipientOverrideAddresses.length > 0,
  };
}

function joinPostmarkRecipients(emails) {
  return Array.isArray(emails) && emails.length > 0 ? emails.join(',') : undefined;
}

async function sendViaResendAsync({ config, recipients, subject, text, html, replyToEmail = null }) {
  if (!config.resendApiKeyConfigured) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
  }
  const resolvedReplyToEmail = normalizeEmailAddress(replyToEmail) || config.replyToAddress;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromHeader(config),
      to: recipients.toEmails,
      cc: recipients.ccEmails.length > 0 ? recipients.ccEmails : undefined,
      bcc: recipients.bccEmails.length > 0 ? recipients.bccEmails : undefined,
      subject,
      text,
      html,
      reply_to: resolvedReplyToEmail || undefined,
    }),
  });

  const responseText = await response.text();
  let parsed = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const error = new Error(parsed?.message || responseText || 'Resend send failed');
    error.providerResponse = {
      status: response.status,
      body: parsed || responseText || null,
    };
    throw error;
  }

  return {
    status: 'sent',
    provider: 'resend',
    providerMessageId: parsed?.id || null,
    providerResponse: {
      status: response.status,
      body: parsed || null,
    },
  };
}

async function sendViaPostmarkAsync({ config, recipients, subject, text, html, replyToEmail = null }) {
  if (!config.postmarkServerTokenConfigured) {
    throw new Error('POSTMARK_SERVER_TOKEN is required when EMAIL_PROVIDER=postmark.');
  }
  const resolvedReplyToEmail = normalizeEmailAddress(replyToEmail) || config.replyToAddress;

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: getFromHeader(config),
      To: joinPostmarkRecipients(recipients.toEmails),
      Cc: joinPostmarkRecipients(recipients.ccEmails),
      Bcc: joinPostmarkRecipients(recipients.bccEmails),
      Subject: subject,
      TextBody: text,
      HtmlBody: html,
      ReplyTo: resolvedReplyToEmail || undefined,
    }),
  });

  const responseText = await response.text();
  let parsed = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const error = new Error(parsed?.Message || responseText || 'Postmark send failed');
    error.providerResponse = {
      status: response.status,
      body: parsed || responseText || null,
    };
    throw error;
  }

  return {
    status: 'sent',
    provider: 'postmark',
    providerMessageId: parsed?.MessageID || null,
    providerResponse: {
      status: response.status,
      body: parsed || null,
    },
  };
}

async function sendEmailAsync({
  toEmail,
  subject,
  text,
  html,
  replyToEmail = null,
  metadata = null,
}) {
  const config = getEmailConfigSnapshot();
  const normalizedToEmail = normalizeEmailAddress(toEmail);
  const normalizedReplyToEmail = normalizeEmailAddress(replyToEmail);
  if (!normalizedToEmail) {
    throw new Error('A valid recipient email is required for email delivery.');
  }
  const recipients = resolveDeliveryRecipients({ config, toEmail: normalizedToEmail, metadata });

  const normalizedSubject = String(subject || '').trim();
  if (!normalizedSubject) {
    throw new Error('Email subject is required for email delivery.');
  }

  if (config.provider === 'disabled') {
    return {
      status: 'skipped',
      provider: 'disabled',
      providerMessageId: null,
      providerResponse: {
        reason: 'provider_disabled',
        metadata: metadata || null,
        originalToEmail: recipients.originalToEmail,
        toEmails: recipients.toEmails,
        ccEmails: recipients.ccEmails,
        bccEmails: recipients.bccEmails,
        copySuppressed: recipients.copySuppressed,
        recipientOverridden: recipients.overridden,
      },
    };
  }

  if (config.provider === 'log') {
    console.log('[email]', JSON.stringify({
      provider: 'log',
      toEmail: normalizedToEmail,
      toEmails: recipients.toEmails,
      ccEmails: recipients.ccEmails,
      bccEmails: recipients.bccEmails,
      copySuppressed: recipients.copySuppressed,
      recipientOverridden: recipients.overridden,
      subject: normalizedSubject,
      replyTo: normalizedReplyToEmail || config.replyToAddress,
      metadata: metadata || null,
      text: String(text || '').trim(),
    }));
    return {
      status: 'sent',
      provider: 'log',
      providerMessageId: null,
      providerResponse: {
        logged: true,
        originalToEmail: recipients.originalToEmail,
        toEmails: recipients.toEmails,
        ccEmails: recipients.ccEmails,
        bccEmails: recipients.bccEmails,
        copySuppressed: recipients.copySuppressed,
        recipientOverridden: recipients.overridden,
      },
    };
  }

  if (config.provider === 'resend') {
    return sendViaResendAsync({
      config,
      recipients,
      subject: normalizedSubject,
      text,
      html,
      replyToEmail: normalizedReplyToEmail,
    });
  }

  if (config.provider === 'postmark') {
    return sendViaPostmarkAsync({
      config,
      recipients,
      subject: normalizedSubject,
      text,
      html,
      replyToEmail: normalizedReplyToEmail,
    });
  }

  throw new Error(`Unsupported email provider: ${config.provider}`);
}

module.exports = {
  getEmailConfigSnapshot,
  buildHealthSnapshot,
  sendEmailAsync,
};
