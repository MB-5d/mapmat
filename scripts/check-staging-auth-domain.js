#!/usr/bin/env node

/* eslint-disable no-console */

const tls = require('tls');

const DEFAULT_API_BASE = 'https://api-staging.vellic.io';
const DEFAULT_FRONTEND_ORIGIN = 'https://staging.vellic.io';
const API_BASE = normalizeBaseUrl(process.env.STAGING_API_BASE || process.env.API_BASE || DEFAULT_API_BASE);
const FRONTEND_ORIGIN = normalizeOrigin(
  process.env.STAGING_FRONTEND_ORIGIN || process.env.FRONTEND_ORIGIN || DEFAULT_FRONTEND_ORIGIN
);
const TIMEOUT_MS = Math.max(1000, Number(process.env.STAGING_AUTH_CHECK_TIMEOUT_MS || 20000));

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('API base URL is required');
  const url = new URL(raw);
  if (url.protocol !== 'https:') {
    throw new Error(`API base URL must use https: ${raw}`);
  }
  return url.toString().replace(/\/+$/, '');
}

function normalizeOrigin(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('Frontend origin is required');
  const url = new URL(raw);
  if (url.protocol !== 'https:') {
    throw new Error(`Frontend origin must use https: ${raw}`);
  }
  return url.origin;
}

function describeFetchError(error) {
  const parts = [error?.message || String(error)];
  let cause = error?.cause;
  while (cause) {
    const detail = [cause.code, cause.reason, cause.message].filter(Boolean).join(': ');
    if (detail) parts.push(detail);
    cause = cause.cause;
  }
  return parts.join(' | ');
}

function summarizeBody(data, text) {
  if (data && typeof data === 'object') {
    return JSON.stringify(data).slice(0, 300);
  }
  return String(text || '').slice(0, 300);
}

function parseJson(text, label) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} did not return JSON: ${String(text || '').slice(0, 200)}`);
  }
}

async function fetchResponse(path, options = {}, label = path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      redirect: 'manual',
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { response, text, data };
  } catch (error) {
    throw new Error(`${label} request failed: ${describeFetchError(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(path, options = {}, label = path) {
  const result = await fetchResponse(path, options, label);
  const { response, text, data } = result;
  const parsed = data || parseJson(text, label);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${summarizeBody(parsed, text)}`);
  }
  return { response, data: parsed };
}

function formatCertificate(cert) {
  const subject = cert?.subject?.CN ? `CN=${cert.subject.CN}` : 'CN=unknown';
  const altNames = cert?.subjectaltname || 'SAN=none';
  const validTo = cert?.valid_to ? `valid_to=${cert.valid_to}` : 'valid_to=unknown';
  return `${subject}; ${altNames}; ${validTo}`;
}

function checkTlsCertificate() {
  const url = new URL(API_BASE);
  const hostname = url.hostname;
  const port = Number(url.port || 443);

  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      rejectUnauthorized: false,
      timeout: TIMEOUT_MS,
    });

    const fail = (error) => {
      socket.destroy();
      reject(error);
    };

    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert || Object.keys(cert).length === 0) {
        fail(new Error(`No TLS certificate was returned for ${hostname}`));
        return;
      }

      const certSummary = formatCertificate(cert);
      const hostnameError = tls.checkServerIdentity(hostname, cert);
      if (hostnameError) {
        fail(new Error(`TLS certificate does not match ${hostname}: ${certSummary}`));
        return;
      }

      if (socket.authorizationError) {
        fail(new Error(`TLS certificate is not trusted for ${hostname}: ${socket.authorizationError}; ${certSummary}`));
        return;
      }

      socket.end();
      resolve(certSummary);
    });

    socket.once('timeout', () => {
      fail(new Error(`TLS check timed out for ${hostname}`));
    });

    socket.once('error', (error) => {
      fail(new Error(`TLS check failed for ${hostname}: ${error.message}`));
    });
  });
}

function assertCorsHeaders(response, label) {
  const allowOrigin = response.headers.get('access-control-allow-origin');
  const allowCredentials = response.headers.get('access-control-allow-credentials');

  if (allowOrigin !== FRONTEND_ORIGIN) {
    throw new Error(`${label} CORS origin mismatch: expected ${FRONTEND_ORIGIN}, got ${allowOrigin || 'none'}`);
  }

  if (String(allowCredentials || '').toLowerCase() !== 'true') {
    throw new Error(`${label} CORS credentials missing or false`);
  }
}

function assertPreflightHeaders(response) {
  assertCorsHeaders(response, 'POST /auth/login preflight');

  const methods = String(response.headers.get('access-control-allow-methods') || '').toLowerCase();
  if (!methods.split(/\s*,\s*/).includes('post')) {
    throw new Error('POST /auth/login preflight does not allow POST');
  }

  const headers = String(response.headers.get('access-control-allow-headers') || '').toLowerCase();
  const allowedHeaders = headers.split(/\s*,\s*/);
  if (!allowedHeaders.includes('content-type') || !allowedHeaders.includes('authorization')) {
    throw new Error('POST /auth/login preflight does not allow Content-Type and Authorization headers');
  }
}

async function run() {
  console.log(`[staging-auth-domain] Checking ${API_BASE}`);
  console.log(`[staging-auth-domain] Frontend origin ${FRONTEND_ORIGIN}`);

  const certSummary = await checkTlsCertificate();
  console.log(`[staging-auth-domain] TLS ok: ${certSummary}`);

  const health = await fetchJson('/health', {}, 'GET /health');
  if (health.data?.ok !== true) {
    throw new Error(`GET /health did not return ok=true: ${JSON.stringify(health.data)}`);
  }
  console.log('[staging-auth-domain] /health ok');

  const authConfig = await fetchJson('/auth/config', {
    headers: { Origin: FRONTEND_ORIGIN },
  }, 'GET /auth/config');
  if (typeof authConfig.data?.googleAuthEnabled !== 'boolean') {
    throw new Error(`GET /auth/config returned an unexpected payload: ${JSON.stringify(authConfig.data)}`);
  }
  assertCorsHeaders(authConfig.response, 'GET /auth/config');
  console.log('[staging-auth-domain] /auth/config and CORS ok');

  const preflight = await fetchResponse('/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: FRONTEND_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  }, 'OPTIONS /auth/login');
  if (!preflight.response.ok) {
    throw new Error(
      `OPTIONS /auth/login failed with HTTP ${preflight.response.status}: ${summarizeBody(preflight.data, preflight.text)}`
    );
  }
  assertPreflightHeaders(preflight.response);
  console.log('[staging-auth-domain] /auth/login preflight ok');

  console.log('[staging-auth-domain] Passed.');
}

run().catch((error) => {
  console.error(`[staging-auth-domain] Failed: ${error.message}`);
  process.exit(1);
});
