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
    let response;
    if (url.pathname === '/') {
      response = html({
        title: 'Fixture Home',
        body: [
          '<h1>Fixture Home</h1>',
          '<a href="/private-a">Private A</a>',
          '<a href="/private-b">Private B</a>',
        ].join(''),
      });
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

async function main() {
  let backend = null;
  let fixture = null;
  let tempDir = null;

  if (!process.env.API_BASE) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-scan-auth-'));
    backend = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_PATH: path.join(tempDir, 'vellic.db'),
        HOST: '127.0.0.1',
        PORT: String(BACKEND_PORT),
        RUN_MODE: 'web',
        ALLOW_PRIVATE_NETWORKS: 'true',
        SCREENSHOT_STORAGE_PROVIDER: 'local',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    backend.stdout.on('data', (chunk) => process.stdout.write(chunk));
    backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
  }

  try {
    fixture = await createFixtureServer();
    const fixtureBase = getServerUrl(fixture);
    await waitForHealth();

    const precheck = await fetchJson(`${API_BASE}/scan-auth/precheck`, {
      method: 'POST',
      body: JSON.stringify({ url: `${fixtureBase}/` }),
    });
    assert.strictEqual(precheck.authRequired, true, 'precheck should find login-gated pages');
    assert.strictEqual(precheck.authCount, 2, 'precheck should find both protected pages');

    const session = await fetchJson(`${API_BASE}/scan-auth/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        url: `${fixtureBase}/`,
        storageState: {
          cookies: [{
            name: 'fixture_session',
            value: 'ok',
            domain: '127.0.0.1',
            path: '/',
            httpOnly: false,
            secure: false,
            sameSite: 'Lax',
          }],
          origins: [],
        },
      }),
    });
    assert.strictEqual(session.status, 'ready', 'storage state should create a ready auth session');

    const screenshot = await fetchJson(
      `${API_BASE}/screenshot?url=${encodeURIComponent(`${fixtureBase}/private-b`)}&type=thumb&authSessionId=${session.sessionId}`
    );
    assert.ok(screenshot.thumbnailUrl, 'same auth session should capture another protected page');

    const created = await fetchJson(`${API_BASE}/scan-jobs`, {
      method: 'POST',
      body: JSON.stringify({
        url: `${fixtureBase}/private-a`,
        maxPages: 10,
        options: { authenticatedPages: true },
        authSessionId: session.sessionId,
      }),
    });
    const result = await pollScanJob(created.jobId, created.jobAccessToken);
    const nodes = flattenTree(result.root);
    const privateA = nodes.find((node) => node.url === `${fixtureBase}/private-a`);
    assert.ok(privateA, 'authenticated scan should include private A');
    assert.strictEqual(privateA.authRequired, false, 'private A should not remain auth-gated');
    assert.strictEqual(privateA.title, 'Private A');

    let deleted = false;
    try {
      await fetchJson(`${API_BASE}/scan-auth/sessions/${session.sessionId}`);
    } catch (error) {
      deleted = /failed 404/.test(error.message);
    }
    assert.strictEqual(deleted, true, 'scan auth session should be deleted after job completion');

    console.log('[scan-auth-session] Passed.');
  } finally {
    if (fixture) await new Promise((resolve) => fixture.close(resolve));
    if (backend) backend.kill('SIGTERM');
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[scan-auth-session] Failed: ${error.message}`);
    process.exit(1);
  });
