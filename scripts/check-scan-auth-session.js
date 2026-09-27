/* eslint-disable no-console */
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const BACKEND_PORT = Number(process.env.SCAN_AUTH_BACKEND_PORT || 4326);
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${BACKEND_PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(30000),
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${data?.error || text}`);
  }
  return data;
}

async function fetchRaw(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${url} failed ${response.status}: ${text}`);
  }
  return response;
}

function html({ title, body, status = 200 }) {
  return {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`,
  };
}

function hasSessionCookie(req) {
  return String(req.headers.cookie || '').includes('fixture_session=ok');
}

function createFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.local');
    if (url.pathname === '/login' && req.method === 'POST') {
      req.resume();
      req.on('end', () => {
        res.writeHead(302, {
          location: '/private-a',
          'set-cookie': 'fixture_session=ok; Path=/; SameSite=Lax',
        });
        res.end();
      });
      return;
    }
    if (url.pathname === '/slow') {
      setTimeout(() => {
        if (res.destroyed) return;
        const response = hasSessionCookie(req)
          ? html({ title: 'Slow Private', body: '<h1>Slow Private</h1>' })
          : html({ status: 401, title: 'Login Required', body: '<h1>Sign in</h1>' });
        res.writeHead(response.status, response.headers);
        res.end(response.body);
      }, 10000);
      return;
    }
    let response;
    if (url.pathname === '/') {
      response = html({
        title: 'Fixture Home',
        body: [
          '<h1>Fixture Home</h1>',
          '<a href="/private-a">Private A</a>',
          '<a href="/private-b">Private B</a>',
          '<a href="/still-locked">Still locked</a>',
        ].join(''),
      });
    } else if (url.pathname === '/still-locked') {
      response = html({ status: 401, title: 'Login Required', body: '<h1>Sign in</h1>' });
    } else if (url.pathname === '/private-a' || url.pathname === '/private-b') {
      response = hasSessionCookie(req)
        ? html({
          title: url.pathname === '/private-a' ? 'Private A' : 'Private B',
          body: url.pathname === '/private-a'
            ? '<h1>Private A</h1><a href="/private-b">Private B</a>'
            : '<h1>Private B</h1>',
        })
        : html({
          status: 401,
          title: 'Login Required',
          body: '<h1>Sign in</h1><p>Authentication required.</p>',
        });
    } else if (url.pathname === '/login') {
      response = html({
        title: 'Fixture Login',
        body: [
          '<h1>Fixture Login</h1>',
          '<form method="post" action="/login">',
          '<input name="password" autofocus placeholder="Password">',
          '<button type="submit">Sign in</button>',
          '</form>',
        ].join(''),
      });
    } else {
      response = html({ status: 404, title: 'Not Found', body: '<h1>Not found</h1>' });
    }

    res.writeHead(response.status, response.headers);
    res.end(response.body);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function getServerUrl(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function waitForHealth() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const health = await fetchJson(`${API_BASE}/health`);
      if (health?.ok) return;
    } catch {
      // Wait for server startup.
    }
    await sleep(500);
  }
  throw new Error('Timed out waiting for local backend health');
}

function flattenTree(node, list = []) {
  if (!node) return list;
  list.push(node);
  (node.children || []).forEach((child) => flattenTree(child, list));
  return list;
}

async function pollScanJob(jobId, accessToken) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    const data = await fetchJson(`${API_BASE}/scan-jobs/${jobId}?access_token=${accessToken}`);
    if (data.job?.status === 'complete') return data.job.result;
    if (data.job?.status === 'failed') throw new Error(data.job.error || 'scan job failed');
    await sleep(500);
  }
  throw new Error('Timed out waiting for scan job');
}

function spawnBackend(tempDir) {
  const backend = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DB_PATH: path.join(tempDir, 'vellic.db'),
      HOST: '127.0.0.1',
      PORT: String(BACKEND_PORT),
      RUN_MODE: 'web',
      SCAN_AUTH_FEATURE_ENABLED: 'true',
      ALLOW_PRIVATE_NETWORKS: 'true',
      SCREENSHOT_STORAGE_PROVIDER: 'local',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', (chunk) => process.stdout.write(chunk));
  backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return backend;
}

async function createReadyFixtureSession(fixtureBase, authHeaders, sampleUrls) {
  const session = await fetchJson(`${API_BASE}/scan-auth/sessions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ url: `${fixtureBase}/login`, sampleUrls }),
  });
  await fetchJson(`${API_BASE}/scan-auth/sessions/${session.sessionId}/action`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ action: 'type', text: 'ok' }),
  });
  await fetchJson(`${API_BASE}/scan-auth/sessions/${session.sessionId}/action`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ action: 'press', key: 'Enter' }),
  });
  await fetchJson(`${API_BASE}/scan-auth/sessions/${session.sessionId}/complete`, {
    method: 'POST',
    headers: authHeaders,
  });
  return session;
}

async function main() {
  let backend = null;
  let fixture = null;
  let tempDir = null;

  if (!process.env.API_BASE) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-scan-auth-'));
    backend = spawnBackend(tempDir);
  }

  try {
    fixture = await createFixtureServer();
    const fixtureBase = getServerUrl(fixture);
    await waitForHealth();
    const login = await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@vellic.io', password: 'Admin123' }),
    });
    const authHeaders = { authorization: `Bearer ${login.token}` };

    const precheck = await fetchJson(`${API_BASE}/scan-auth/precheck`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ url: `${fixtureBase}/` }),
    });
    assert.strictEqual(precheck.authRequired, true, 'precheck should find login-gated pages');
    assert.strictEqual(precheck.authCount, 3, 'precheck should find all protected pages');
    assert.strictEqual(precheck.interactiveLoginSupported, true, 'precheck should expose interactive login support');

    const withoutLogin = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ url: `${fixtureBase}/`, maxPages: 100, options: { authenticatedPages: true } }),
    });
    const withoutLoginResult = await pollScanJob(withoutLogin.jobId, withoutLogin.jobAccessToken);
    assert.strictEqual(withoutLoginResult.partialReason, 'auth_required');
    assert.ok(flattenTree(withoutLoginResult.root).some((node) => (
      node.url === `${fixtureBase}/private-a` && node.authRequired
    )), 'continuing without login should label protected pages');

    const interactive = await fetchJson(`${API_BASE}/scan-auth/sessions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ url: `${fixtureBase}/login`, sampleUrls: precheck.sampleUrls }),
    });
    assert.strictEqual(interactive.status, 'interactive', 'login flow should create an interactive browser session');

    let rejectedBeforeLogin = false;
    try {
      await fetchJson(`${API_BASE}/scan-auth/sessions/${interactive.sessionId}/complete`, {
        method: 'POST',
        headers: authHeaders,
      });
    } catch (error) {
      rejectedBeforeLogin = /failed 409/.test(error.message);
    }
    assert.strictEqual(rejectedBeforeLogin, true, 'unfinished login must not be accepted');

    const loginScreen = await fetchRaw(`${API_BASE}/scan-auth/sessions/${interactive.sessionId}/screenshot`, {
      headers: authHeaders,
    });
    assert.ok(
      String(loginScreen.headers.get('content-type') || '').includes('image/jpeg'),
      'interactive login screen should return a browser screenshot'
    );

    await fetchJson(`${API_BASE}/scan-auth/sessions/${interactive.sessionId}/action`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ action: 'type', text: 'ok' }),
    });
    await fetchJson(`${API_BASE}/scan-auth/sessions/${interactive.sessionId}/action`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ action: 'press', key: 'Enter' }),
    });
    await sleep(1000);
    const completedInteractive = await fetchJson(`${API_BASE}/scan-auth/sessions/${interactive.sessionId}/complete`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.strictEqual(completedInteractive.ready, true, 'interactive login should capture a ready storage state');

    const interactiveScreenshot = await fetchJson(
      `${API_BASE}/screenshot?url=${encodeURIComponent(`${fixtureBase}/private-b`)}&type=thumb&authSessionId=${interactive.sessionId}`,
      { headers: authHeaders }
    );
    assert.ok(interactiveScreenshot.thumbnailUrl, 'interactive auth session should capture protected pages');
    const created = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        url: `${fixtureBase}/`,
        maxPages: 100,
        options: { authenticatedPages: true },
        authSessionId: interactive.sessionId,
      }),
    });
    const result = await pollScanJob(created.jobId, created.jobAccessToken);
    const nodes = flattenTree(result.root);
    const privateA = nodes.find((node) => node.url === `${fixtureBase}/private-a`);
    assert.ok(privateA, 'authenticated scan should include private A');
    assert.strictEqual(privateA.authRequired, false, 'private A should not remain auth-gated');
    assert.strictEqual(privateA.title, 'Private A');
    const privateB = nodes.find((node) => node.url === `${fixtureBase}/private-b`);
    assert.ok(privateB && !privateB.authRequired, 'one login should unlock the second protected page');
    assert.strictEqual(result.partial, true, 'a page still locked after login should make the scan partial');
    assert.strictEqual(result.partialReason, 'auth_required');
    assert.ok(result.blockedSections.some((section) => section.url === `${fixtureBase}/still-locked`));

    let deleted = false;
    try {
      await fetchJson(`${API_BASE}/scan-auth/sessions/${interactive.sessionId}`, {
        headers: authHeaders,
      });
    } catch (error) {
      deleted = /failed 404/.test(error.message);
    }
    assert.strictEqual(deleted, true, 'scan auth session should be deleted after job completion');

    await assert.rejects(() => fetchJson(
      `${API_BASE}/screenshot?url=${encodeURIComponent(`${fixtureBase}/private-b`)}&type=thumb&authSessionId=${interactive.sessionId}`,
      { headers: authHeaders }
    ), /failed 410: The temporary login expired/);
    await assert.rejects(() => fetchJson(`${API_BASE}/scan`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ url: `${fixtureBase}/`, authSessionId: interactive.sessionId }),
    }), /failed 410: The temporary login expired/);
    await assert.rejects(() => fetchJson(
      `${API_BASE}/scan-stream?url=${encodeURIComponent(fixtureBase)}&authSessionId=${interactive.sessionId}`,
      { headers: authHeaders }
    ), /failed 410: The temporary login expired/);

    const rescanSession = await createReadyFixtureSession(fixtureBase, authHeaders, precheck.sampleUrls);
    const rescanJob = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        url: `${fixtureBase}/`,
        maxPages: 100,
        options: { authenticatedPages: true },
        authSessionId: rescanSession.sessionId,
      }),
    });
    const rescanResult = await pollScanJob(rescanJob.jobId, rescanJob.jobAccessToken);
    assert.ok(flattenTree(rescanResult.root).some((node) => (
      node.url === `${fixtureBase}/private-b` && !node.authRequired
    )), 'a fresh login should unlock protected pages on a rescan');

    const canceledSession = await createReadyFixtureSession(fixtureBase, authHeaders, precheck.sampleUrls);
    const canceledJob = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        url: `${fixtureBase}/`,
        maxPages: 10,
        options: { authenticatedPages: true },
        authSessionId: canceledSession.sessionId,
      }),
    });
    await fetchJson(`${API_BASE}/scan-jobs/${canceledJob.jobId}/cancel`, {
      method: 'POST',
      headers: authHeaders,
    });
    const canceledStatus = await fetchJson(`${API_BASE}/scan-jobs/${canceledJob.jobId}?access_token=${canceledJob.jobAccessToken}`);
    assert.strictEqual(canceledStatus.job.status, 'canceled', 'canceled scan should not complete');
    let canceledSessionRemoved = false;
    try {
      await fetchJson(`${API_BASE}/scan-auth/sessions/${canceledSession.sessionId}`, { headers: authHeaders });
    } catch (error) {
      canceledSessionRemoved = /failed 404/.test(error.message);
    }
    assert.strictEqual(canceledSessionRemoved, true, 'canceling a scan should discard its login');

    if (backend) {
      console.log('[scan-auth-session] Checking interrupted scan recovery.');
      const restartSession = await createReadyFixtureSession(fixtureBase, authHeaders, precheck.sampleUrls);
      console.log('[scan-auth-session] Restart login ready.');
      console.log('[scan-auth-session] Creating interrupted job.');
      const interruptedJob = await fetchJson(`${API_BASE}/scan-jobs`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          url: `${fixtureBase}/slow`,
          maxPages: 10,
          options: { authenticatedPages: true },
          authSessionId: restartSession.sessionId,
        }),
      });
      console.log('[scan-auth-session] Interrupting job.');
      const exited = new Promise((resolve) => backend.once('exit', resolve));
      assert.strictEqual(backend.kill('SIGKILL'), true, 'fixture backend should accept the stop signal');
      await exited;
      console.log('[scan-auth-session] Initial backend stopped.');
      backend = spawnBackend(tempDir);
      await waitForHealth();
      const interruptedStatus = await fetchJson(
        `${API_BASE}/scan-jobs/${interruptedJob.jobId}?access_token=${interruptedJob.jobAccessToken}`
      );
      assert.strictEqual(interruptedStatus.job.status, 'failed', 'restarted scan must not resume without its login');
      assert.ok(/interrupted/i.test(interruptedStatus.job.error || ''));
    }

    console.log('[scan-auth-session] Passed.');
  } finally {
    if (backend) backend.kill('SIGTERM');
    if (fixture) {
      fixture.closeAllConnections();
      await Promise.race([
        new Promise((resolve) => fixture.close(resolve)),
        sleep(3000),
      ]);
    }
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[scan-auth-session] Failed: ${error.message}`);
    process.exit(1);
  });
