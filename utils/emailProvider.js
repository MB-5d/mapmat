const { getDefaultAppBaseUrl } = require('./emailTemplates');

const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_PUBLIC_DOMAIN;
const SUPPORTED_EMAIL_PROVIDERS = new Set(['disabled', 'log', 'resend', 'postmark']);

function normalizeProviderName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return isProd ? 'disabled' : 'log';
  return SUPPORTED_EMAIL_PROVIDERS.has(normalized) ? normalized : 'disabled';
}

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase() || null;
}

function normalizeOptionalText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
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

async function sendViaResendAsync({ config, toEmail, subject, text, html }) {
  if (!config.resendApiKeyConfigured) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromHeader(config),
      to: [toEmail],
      subject,
      text,
      html,
      reply_to: config.replyToAddress || undefined,
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

async function sendViaPostmarkAsync({ config, toEmail, subject, text, html }) {
  if (!config.postmarkServerTokenConfigured) {
    throw new Error('POSTMARK_SERVER_TOKEN is required when EMAIL_PROVIDER=postmark.');
  }

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: getFromHeader(config),
      To: toEmail,
      Subject: subject,
      TextBody: text,
      HtmlBody: html,
      ReplyTo: config.replyToAddress || undefined,
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
  metadata = null,
}) {
  const config = getEmailConfigSnapshot();
  const normalizedToEmail = normalizeEmailAddress(toEmail);
  if (!normalizedToEmail) {
    throw new Error('A valid recipient email is required for email delivery.');
  }

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
      },
    };
  }

  if (config.provider === 'log') {
    console.log('[email]', JSON.stringify({
      provider: 'log',
      toEmail: normalizedToEmail,
      subject: normalizedSubject,
      replyTo: config.replyToAddress,
      metadata: metadata || null,
      text: String(text || '').trim(),
    }));
    return {
      status: 'sent',
      provider: 'log',
      providerMessageId: null,
      providerResponse: {
        logged: true,
      },
    };
  }

  if (config.provider === 'resend') {
    return sendViaResendAsync({
      config,
      toEmail: normalizedToEmail,
      subject: normalizedSubject,
      text,
      html,
    });
  }

  if (config.provider === 'postmark') {
    return sendViaPostmarkAsync({
      config,
      toEmail: normalizedToEmail,
      subject: normalizedSubject,
      text,
      html,
    });
  }

  throw new Error(`Unsupported email provider: ${config.provider}`);
}

module.exports = {
  getEmailConfigSnapshot,
  buildHealthSnapshot,
  sendEmailAsync,
};
