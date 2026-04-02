const crypto = require('crypto');
const http = require('http');
const https = require('https');

const SENTRY_DSN = String(process.env.SENTRY_DSN || '').trim();
const SENTRY_ENVIRONMENT = String(
  process.env.SENTRY_ENVIRONMENT
  || (process.env.RAILWAY_PUBLIC_DOMAIN?.includes('staging') ? 'staging' : '')
  || process.env.NODE_ENV
  || 'development'
).trim();

function parseDsn(dsn) {
  if (!dsn) return null;
  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean).pop();
    const publicKey = parsed.username;
    if (!projectId || !publicKey) return null;
    return {
      protocol: parsed.protocol,
      host: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      projectId,
      publicKey,
      pathPrefix: parsed.pathname.replace(new RegExp(`${projectId}$`), '').replace(/\/+$/, ''),
    };
  } catch {
    return null;
  }
}

const SENTRY_CONFIG = parseDsn(SENTRY_DSN);

function isBackendSentryEnabled() {
  return !!SENTRY_CONFIG;
}

function buildStorePath() {
  if (!SENTRY_CONFIG) return null;
  const base = SENTRY_CONFIG.pathPrefix ? `${SENTRY_CONFIG.pathPrefix}` : '';
  return `${base}/api/${SENTRY_CONFIG.projectId}/store/?sentry_version=7&sentry_key=${encodeURIComponent(SENTRY_CONFIG.publicKey)}&sentry_client=mapmat-backend/1.0`;
}

function captureBackendException(error, context = {}) {
  if (!SENTRY_CONFIG || !error) return;
  try {
    const payload = JSON.stringify({
      event_id: crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : crypto.randomBytes(16).toString('hex'),
      message: error.message || String(error),
      level: context.level || 'error',
      platform: 'node',
      environment: SENTRY_ENVIRONMENT,
      logger: 'mapmat-backend',
      tags: context.tags || {},
      extra: {
        ...context.extra,
        stack: error.stack || null,
      },
      user: context.user || undefined,
      request: context.request || undefined,
    });
    const transport = SENTRY_CONFIG.protocol === 'https:' ? https : http;
    const req = transport.request({
      method: 'POST',
      host: SENTRY_CONFIG.host,
      port: SENTRY_CONFIG.port,
      path: buildStorePath(),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch {
    // no-op
  }
}

function installBackendSentryProcessHandlers() {
  if (!SENTRY_CONFIG) return;
  process.on('uncaughtExceptionMonitor', (error) => {
    captureBackendException(error, {
      tags: { source: 'uncaughtExceptionMonitor' },
    });
  });
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason || 'Unhandled promise rejection'));
    captureBackendException(error, {
      tags: { source: 'unhandledRejection' },
    });
  });
}

function createExpressSentryErrorMiddleware() {
  return (error, req, res, next) => {
    captureBackendException(error, {
      tags: {
        source: 'express',
        method: req.method,
      },
      request: {
        url: req.originalUrl || req.url,
        headers: {
          host: req.get('host'),
          referer: req.get('referer'),
          user_agent: req.get('user-agent'),
        },
      },
      user: req.user ? {
        id: req.user.id,
        email: req.user.email,
      } : undefined,
    });
    next(error);
  };
}

module.exports = {
  captureBackendException,
  createExpressSentryErrorMiddleware,
  installBackendSentryProcessHandlers,
  isBackendSentryEnabled,
};
