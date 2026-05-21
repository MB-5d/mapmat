/* eslint-disable no-console */
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const BACKEND_PORT = Number(process.env.SCAN_LABELING_BACKEND_PORT || 4317);
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
    body: `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title} description"></head><body>${body}</body></html>`,
  };
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
          '<a href="/server-error">Server error</a>',
          '<a href="/gone">Gone page</a>',
          '<a href="/docs/deep/page">Deep page</a>',
          '<a href="/assets/logo.svg">Logo</a>',
          '<a href="https://external.example/out">External page</a>',
          '<a href="https://cdn.example/assets/manual.pdf">External file</a>',
        ].join(''),
      });
    } else if (url.pathname === '/server-error') {
      response = html({
        status: 500,
        title: 'Status Dashboard',
        body: '<h1>Status Dashboard</h1><p>This error page is still viewable.</p>',
      });
    } else if (url.pathname === '/gone') {
      response = html({
        status: 404,
        title: 'Page not found',
        body: '<h1>Not found</h1>',
      });
    } else if (url.pathname === '/docs/deep/page') {
      response = html({
        title: 'Deep Fixture Page',
        body: '<h1>Deep Fixture Page</h1>',
      });
    } else if (url.pathname === '/assets/logo.svg') {
      response = {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#4f46e5"/></svg>',
      };
    } else {
      response = html({
        status: 404,
        title: 'Page not found',
        body: '<h1>Not found</h1>',
      });
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

function allArtifactUrls(result) {
  return [
    ...flattenTree(result.root).map((node) => node.url),
    ...(result.orphans || []).flatMap((node) => flattenTree(node).map((entry) => entry.url)),
    ...(result.subdomains || []).flatMap((node) => flattenTree(node).map((entry) => entry.url)),
    ...(result.errors || []).map((entry) => entry.url),
    ...(result.inactivePages || []).map((entry) => entry.url),
    ...(result.brokenLinks || []).map((entry) => entry.url),
    ...(result.files || []).map((entry) => entry.url),
  ].filter(Boolean);
}

async function runScan(fixtureBase, files = true) {
  return fetchJson(`${API_BASE}/scan`, {
    method: 'POST',
    body: JSON.stringify({
      url: `${fixtureBase}/`,
      maxPages: 80,
      options: {
        errorPages: true,
        inactivePages: true,
        brokenLinks: true,
        orphanPages: true,
        authenticatedPages: true,
        files,
      },
    }),
  });
}

function assertLabeling(result, fixtureBase) {
  const nodes = flattenTree(result.root);
  const byUrl = new Map(nodes.map((node) => [node.url, node]));

  const viewableError = byUrl.get(`${fixtureBase}/server-error`);
  assert.ok(viewableError, 'viewable 500 page should be included');
  assert.strictEqual(viewableError.isError, true);
  assert.strictEqual(viewableError.httpStatus, 500);
  assert.strictEqual(viewableError.httpErrorLabel, 'HTTP 500');
  assert.strictEqual(viewableError.isViewableError, true);
  assert.strictEqual(viewableError.title, 'Status Dashboard');
  assert.strictEqual(viewableError.metadataAvailable, true);

  const notFound = byUrl.get(`${fixtureBase}/gone`);
  assert.ok(notFound, 'real 404 page should be included');
  assert.strictEqual(notFound.isError, true);
  assert.strictEqual(notFound.httpStatus, 404);
  assert.strictEqual(notFound.httpErrorLabel, 'HTTP 404 / Not Found');
  assert.strictEqual(Boolean(notFound.isMissing), false);
  assert.strictEqual(Boolean(notFound.isVirtualMissing), false);

  const virtualParent = byUrl.get(`${fixtureBase}/docs`);
  assert.ok(virtualParent, 'inferred parent should be present');
  assert.strictEqual(virtualParent.isMissing, true);
  assert.strictEqual(virtualParent.isVirtualMissing, true);

  const file = (result.files || []).find((entry) => entry.url === `${fixtureBase}/assets/logo.svg`);
  assert.ok(file, 'same-host file should be included when Files is on');
  assert.strictEqual(file.fileType, 'Image');

  const urls = allArtifactUrls(result);
  assert.ok(!urls.some((url) => url.includes('external.example')), 'external page should be excluded');
  assert.ok(!urls.some((url) => url.includes('cdn.example')), 'external file should be excluded');

  assert.strictEqual(result.scanScope?.baseHost, '127.0.0.1');
  assert.strictEqual(result.scanScope?.exactOnly, true);
}

async function main() {
  let backend = null;
  let fixture = null;
  let tempDir = null;

  if (!process.env.API_BASE) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-scan-labeling-'));
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

    const resultWithFiles = await runScan(fixtureBase, true);
    assertLabeling(resultWithFiles, fixtureBase);

    const resultWithoutFiles = await runScan(fixtureBase, false);
    assert.strictEqual((resultWithoutFiles.files || []).length, 0, 'files should be hidden when Files is off');

    console.log('[scan-labeling-fixture] Passed.');
  } finally {
    if (fixture) await new Promise((resolve) => fixture.close(resolve));
    if (backend) backend.kill('SIGTERM');
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[scan-labeling-fixture] Failed: ${error.message}`);
  process.exit(1);
});
