#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.AUTH_CHECK_PORT || 4311);
const API_BASE = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.AUTH_CHECK_DB_PATH || path.join(os.tmpdir(), `vellic-auth-check-${process.pid}.db`);
const START_TIMEOUT_MS = 30000;
const WAIT_STEP_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomEmail() {
  return `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function randomPassword() {
  return `pw_${Math.random().toString(36).slice(2, 10)}A1`;
}

function buildHeaders(options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  return headers;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options),
    redirect: 'manual',
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed with ${response.status}`);
    error.status = response.status;
    error.code = data?.code || null;
    error.payload = data;
    throw error;
  }

  return data;
}

function extractCodeFromText(text) {
  const match = String(text || '').match(/Your code:\s*(\d{4,8})/i);
  return match ? match[1] : null;
}

function parseEmailLog(line) {
  const prefix = '[email] ';
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith(prefix)) return null;
  try {
    return JSON.parse(trimmed.slice(prefix.length));
  } catch {
    return null;
  }
}

async function waitFor(predicate, {
  timeoutMs = 10000,
  stepMs = WAIT_STEP_MS,
  failureMessage = 'Timed out waiting for condition',
} = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await predicate();
    if (result) return result;
    await sleep(stepMs);
  }
  throw new Error(failureMessage);
}

async function startServer() {
  const emailLogs = [];
  let stoppingRequested = false;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      RUN_MODE: 'both',
      TEST_AUTH_ENABLED: 'false',
      AUTH_HEADER_FALLBACK: 'true',
      EMAIL_PROVIDER: 'log',
      DB_PATH,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REDIRECT_URI: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  const stdoutLines = [];
  const stderrLines = [];

  child.stdout.on('data', (chunk) => {
    const text = String(chunk || '');
    stdoutLines.push(text);
    text.split(/\r?\n/).forEach((line) => {
      const parsed = parseEmailLog(line);
      if (parsed) {
        emailLogs.push({
          ts: Date.now(),
          payload: parsed,
        });
      }
    });
  });

  child.stderr.on('data', (chunk) => {
    stderrLines.push(String(chunk || ''));
  });

  child.on('exit', (code, signal) => {
    if (!stoppingRequested && code !== 0) {
      console.error('[auth-flow-check] Server exited early.', {
        code,
        signal,
        stdout: stdoutLines.join(''),
        stderr: stderrLines.join(''),
      });
    }
  });

  await waitFor(async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (!response.ok) return false;
      const payload = await response.json();
      return payload?.ok === true;
    } catch {
      return false;
    }
  }, {
    timeoutMs: START_TIMEOUT_MS,
    failureMessage: 'Timed out waiting for local auth test server',
  });

  return {
    child,
    emailLogs,
    async stop() {
      if (child.exitCode !== null) return;
      stoppingRequested = true;
      child.kill('SIGTERM');
      await waitFor(() => child.exitCode !== null, {
        timeoutMs: 5000,
        failureMessage: 'Timed out waiting for auth test server to stop',
      }).catch(() => {
        child.kill('SIGKILL');
      });
    },
  };
}

async function waitForEmailCode(emailLogs, {
  templateKey,
  toEmail,
  afterTs = 0,
}) {
  return waitFor(() => {
    const match = emailLogs.find((entry) => (
      entry.ts >= afterTs
      && entry.payload?.toEmail === toEmail
      && entry.payload?.metadata?.templateKey === templateKey
      && extractCodeFromText(entry.payload?.text)
    ));
    if (!match) return null;
    return {
      code: extractCodeFromText(match.payload?.text),
      sentAt: match.ts,
    };
  }, {
    timeoutMs: 15000,
    failureMessage: `Timed out waiting for ${templateKey} code email`,
  });
}

async function run() {
  const server = await startServer();
  const email = randomEmail();
  const originalPassword = randomPassword();
  const nextPassword = randomPassword();

  try {
    const authConfig = await fetchJson(`${API_BASE}/auth/config`);
    assert.strictEqual(
      authConfig.googleAuthEnabled,
      false,
      'google auth should stay disabled when Google env vars are missing'
    );

    const signupStartedAt = Date.now();
    const signup = await fetchJson(`${API_BASE}/auth/signup`, {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: originalPassword,
        name: 'Auth Check',
      }),
    });

    assert.strictEqual(signup.pendingVerification, true, 'signup should require verification');
    assert.strictEqual(signup.email, email, 'signup should echo email');
    assert.strictEqual(signup.codeLength, 6, 'signup should use a 6-digit code');

    const verificationEmail = await waitForEmailCode(server.emailLogs, {
      templateKey: 'auth.email_verification',
      toEmail: email,
      afterTs: signupStartedAt,
    });
    assert.match(verificationEmail.code, /^\d{6}$/, 'verification code should be 6 digits');

    let loginError = null;
    try {
      await fetchJson(`${API_BASE}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password: originalPassword }),
      });
    } catch (error) {
      loginError = error;
    }
    assert(loginError, 'login before verification should fail');
    assert.strictEqual(loginError.status, 403, 'unverified login should return 403');
    assert.strictEqual(loginError.code, 'EMAIL_NOT_VERIFIED', 'unverified login should expose EMAIL_NOT_VERIFIED');

    let verifyError = null;
    try {
      await fetchJson(`${API_BASE}/auth/verify-email`, {
        method: 'POST',
        body: JSON.stringify({ email, code: '000000' }),
      });
    } catch (error) {
      verifyError = error;
    }
    assert(verifyError, 'wrong verification code should fail');
    assert.strictEqual(verifyError.code, 'AUTH_CODE_INVALID', 'wrong verification code should expose AUTH_CODE_INVALID');

    const resendStartedAt = Date.now();
    const resend = await fetchJson(`${API_BASE}/auth/resend-verification`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    assert.strictEqual(resend.success, true, 'resend verification should succeed');
    const resentVerificationEmail = await waitForEmailCode(server.emailLogs, {
      templateKey: 'auth.email_verification',
      toEmail: email,
      afterTs: resendStartedAt,
    });
    assert.match(resentVerificationEmail.code, /^\d{6}$/, 'resent verification code should be 6 digits');
    assert.notStrictEqual(
      resentVerificationEmail.code,
      verificationEmail.code,
      'resend should invalidate the previous verification code'
    );

    let staleVerifyError = null;
    try {
      await fetchJson(`${API_BASE}/auth/verify-email`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          code: verificationEmail.code,
        }),
      });
    } catch (error) {
      staleVerifyError = error;
    }
    assert(staleVerifyError, 'stale verification code should fail after resend');
    assert.strictEqual(staleVerifyError.code, 'AUTH_CODE_INVALID', 'stale verification code should be invalid');

    const verified = await fetchJson(`${API_BASE}/auth/verify-email`, {
      method: 'POST',
      body: JSON.stringify({
        email,
        code: resentVerificationEmail.code,
      }),
    });
    assert.strictEqual(verified.user?.email, email, 'verify response should return the user');
    assert.strictEqual(verified.user?.emailVerified, true, 'verified user should be marked verified');
    assert(verified.token, 'verify response should return an auth token');

    const me = await fetchJson(`${API_BASE}/auth/me`, {
      headers: {},
      token: verified.token,
    });
    assert.strictEqual(me.user?.emailVerified, true, '/auth/me should show verified email');
    assert.strictEqual(me.user?.hasPassword, true, '/auth/me should show password login enabled');

    const resetStartedAt = Date.now();
    const forgot = await fetchJson(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    assert.strictEqual(forgot.success, true, 'forgot-password should succeed');

    const resetEmail = await waitForEmailCode(server.emailLogs, {
      templateKey: 'auth.password_reset',
      toEmail: email,
      afterTs: resetStartedAt,
    });
    assert.match(resetEmail.code, /^\d{6}$/, 'reset code should be 6 digits');

    let resetError = null;
    try {
      await fetchJson(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          code: '111111',
          newPassword: nextPassword,
        }),
      });
    } catch (error) {
      resetError = error;
    }
    assert(resetError, 'wrong reset code should fail');
    assert.strictEqual(resetError.code, 'AUTH_CODE_INVALID', 'wrong reset code should expose AUTH_CODE_INVALID');

    const reset = await fetchJson(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      body: JSON.stringify({
        email,
        code: resetEmail.code,
        newPassword: nextPassword,
      }),
    });
    assert.strictEqual(reset.user?.email, email, 'reset should return the user');
    assert.strictEqual(reset.user?.emailVerified, true, 'reset should preserve verified state');

    let reusedResetError = null;
    try {
      await fetchJson(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          code: resetEmail.code,
          newPassword: randomPassword(),
        }),
      });
    } catch (error) {
      reusedResetError = error;
    }
    assert(reusedResetError, 'used reset code should fail if reused');
    assert.strictEqual(reusedResetError.code, 'AUTH_CODE_REQUIRED', 'used reset code should require a fresh code');

    const login = await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password: nextPassword }),
    });
    assert.strictEqual(login.user?.email, email, 'login after reset should work');

    console.log('[auth-flow-check] Passed.', JSON.stringify({
      email,
      verificationCodeLength: verificationEmail.code.length,
      resetCodeLength: resetEmail.code.length,
      verified: verified.user?.emailVerified === true,
      passwordReset: true,
    }));
  } finally {
    await server.stop();
  }
}

run().catch((error) => {
  console.error('[auth-flow-check] Failed:', error);
  process.exit(1);
});
