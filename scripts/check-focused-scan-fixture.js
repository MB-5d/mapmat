/* eslint-disable no-console */
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const BACKEND_PORT = Number(process.env.FOCUSED_SCAN_BACKEND_PORT || 4331);
const API_BASE = `http://127.0.0.1:${BACKEND_PORT}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;
  if (!response.ok) throw new Error(`${url} failed ${response.status}: ${data?.error || body}`);
  return data;
}

function createFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.local');
    const postMatch = url.pathname.match(/^\/blog\/post-(\d+)$/);
    if (url.pathname === '/sitemap.xml') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const urls = [
        `${origin}/about`,
        `${origin}/blogger`,
        `${origin}/blog`,
        ...Array.from({ length: 20 }, (_, index) => `${origin}/blog/post-${index + 1}`),
      ];
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<urlset>${urls.map((entry) => `<url><loc>${entry}</loc></url>`).join('')}</urlset>`);
      return;
    }
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`Sitemap: http://127.0.0.1:${server.address().port}/sitemap.xml`);
      return;
    }
    if (url.pathname === '/blog') {
      const links = Array.from({ length: 20 }, (_, index) => (
        `<a href="/blog/post-${index + 1}">Post ${index + 1}</a>`
      )).join('');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Blog</title></head><body><h1>Blog</h1>${links}<a href="/blogger">Blogger</a></body></html>`);
      return;
    }
    if (postMatch) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>Post ${postMatch[1]}</title><meta property="og:type" content="article"></head><body><article><h1>Post ${postMatch[1]}</h1></article></body></html>`);
      return;
    }
    if (url.pathname === '/archive') {
      res.writeHead(503, { 'content-type': 'text/html' });
      res.end('<html><head><title>Archive unavailable</title></head><body>Unavailable</body></html>');
      return;
    }
    if (url.pathname === '/archive/story') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Archive story</title></head><body><h1>Archive story</h1><a href="/archive/story/comments">Comments</a></body></html>');
      return;
    }
    if (url.pathname === '/archive/story/comments') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Story comments</title></head><body><h1>Comments</h1></body></html>');
      return;
    }
    if (url.pathname === '/' || url.pathname === '/about' || url.pathname === '/blogger') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head><title>${url.pathname === '/' ? 'Home' : url.pathname.slice(1)}</title></head><body><h1>Page</h1></body></html>`);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('<html><head><title>Not found</title></head><body>Not found</body></html>');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const health = await fetchJson(`${API_BASE}/health`);
      if (health?.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('Backend health check timed out');
}

async function waitForJob(jobId, accessToken, authToken) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const response = await fetchJson(`${API_BASE}/scan-jobs/${jobId}?access_token=${accessToken}`, {
      headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
    });
    if (response.job?.status === 'complete') return response.job.result;
    if (response.job?.status === 'failed') throw new Error(response.job.error || 'Scan failed');
    await sleep(500);
  }
  throw new Error('Scan job timed out');
}

function flattenTree(node, result = []) {
  if (!node) return result;
  result.push(node);
  (node.children || []).forEach((child) => flattenTree(child, result));
  return result;
}

async function createScan(payload, authToken) {
  const created = await fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
    body: JSON.stringify(payload),
  });
  return waitForJob(created.jobId, created.jobAccessToken, authToken);
}

async function main() {
  let backend = null;
  let fixture = null;
  let tempDir = null;
  try {
    fixture = await createFixtureServer();
    const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-focused-scan-'));
    backend = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_PATH: path.join(tempDir, 'vellic.db'),
        HOST: '127.0.0.1',
        PORT: String(BACKEND_PORT),
        RUN_MODE: 'web',
        JOB_WORKER_TYPES: 'scan',
        ALLOW_PRIVATE_NETWORKS: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    backend.stdout.on('data', (chunk) => process.stdout.write(chunk));
    backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
    await waitForHealth();
    const login = await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@vellic.io', password: 'Admin123' }),
    });
    assert.ok(login.token, 'fixture login should return an auth token');
    const authToken = login.token;

    const result = await createScan({
      url: `${fixtureOrigin}/blog`,
      maxPages: 100,
      options: {},
    }, authToken);
    const nodes = flattenTree(result.root);
    const target = nodes.find((node) => node.url === `${fixtureOrigin}/blog`);
    const placeholder = nodes.find((node) => node.nodeKind === 'deferred-group');
    assert.equal(result.scanScope.focused, true);
    assert.equal(result.root.nodeKind, 'focus-ghost');
    assert.equal(result.root.url, `${fixtureOrigin}/`);
    assert.equal(result.root.scanNumber, '0');
    assert.ok(target, 'focused target should be present');
    assert.equal(target.scanNumber, '3');
    assert.notEqual(target.scanNumber, '0');
    assert.equal(nodes.some((node) => node.url === `${fixtureOrigin}/blogger`), false);
    assert.ok(placeholder, 'repetitive group placeholder should be present');
    assert.equal(placeholder.remainingCount, 10);
    assert.equal(placeholder.capturedCount, 10);
    assert.equal(result.pageCountSummary.totalDiscoveredPageCount, 21);
    assert.equal(result.partial, undefined);

    const captureResult = await createScan({
      url: `${fixtureOrigin}/blog`,
      maxPages: placeholder.deferredEntries.length,
      options: {
        repetitiveCapture: {
          groupId: placeholder.deferredGroupId,
          entries: placeholder.deferredEntries,
        },
      },
    }, authToken);
    assert.equal(captureResult.captureSummary.groupId, placeholder.deferredGroupId);
    assert.equal(captureResult.captureSummary.capturedCount, 10);
    assert.equal(captureResult.captureSummary.remainingEntries.length, 0);

    const wholeSiteResult = await createScan({
      url: `${fixtureOrigin}/`,
      maxPages: 100,
      options: {},
    }, authToken);
    const wholeSiteNodes = flattenTree(wholeSiteResult.root);
    const wholeSitePlaceholder = wholeSiteNodes.find((node) => node.nodeKind === 'deferred-group');
    assert.equal(wholeSiteResult.scanScope.focused, false);
    assert.ok(wholeSitePlaceholder, 'homepage scans should use the same repetitive-page optimization');
    assert.equal(wholeSitePlaceholder.capturedCount, 10);
    assert.equal(wholeSitePlaceholder.remainingCount, 10);
    const wholeSiteParent = wholeSiteNodes.find((node) => node.url === `${fixtureOrigin}/blog`);
    assert.equal(wholeSiteParent.children.at(-1).nodeKind, 'deferred-group');

    const deepResult = await createScan({
      url: `${fixtureOrigin}/blog/post-1`,
      maxPages: 100,
      options: {},
    }, authToken);
    const deepNodes = flattenTree(deepResult.root);
    const deepTarget = deepNodes.find((node) => node.url === `${fixtureOrigin}/blog/post-1`);
    const deepAncestors = deepNodes.filter((node) => node.nodeKind === 'focus-ghost');
    assert.deepEqual(deepAncestors.map((node) => node.url), [`${fixtureOrigin}/`, `${fixtureOrigin}/blog`]);
    assert.equal(deepAncestors.every((node) => node.isMissing === false), true);
    assert.equal(deepTarget.scanNumber, '3.1');
    assert.notEqual(deepTarget.scanNumber, '0');

    const queryResult = await createScan({
      url: `${fixtureOrigin}/blog/post-1?edition=gb`,
      maxPages: 100,
      options: {},
    }, authToken);
    const queryNodes = flattenTree(queryResult.root);
    const queryTarget = queryNodes.find((node) => node.url === `${fixtureOrigin}/blog/post-1?edition=gb`);
    const queryAncestors = queryNodes.filter((node) => node.nodeKind === 'focus-ghost');
    assert.deepEqual(
      queryAncestors.map((node) => node.url),
      [`${fixtureOrigin}/`, `${fixtureOrigin}/blog`]
    );
    queryAncestors.forEach((ancestor) => {
      assert.equal(
        queryNodes.filter((node) => node.url === ancestor.url).length,
        1,
        `${ancestor.url} should appear exactly once`
      );
      assert.equal(ancestor.isMissing, false);
    });
    assert.equal(
      queryNodes.some((node) => node.url === `${fixtureOrigin}/blog/post-1`),
      false,
      'same-path URL without the entered query should not appear beneath the target'
    );
    assert.ok(queryTarget?.scanNumber, 'query target should preserve a full-map page number');
    assert.equal(queryTarget.scanNumber.startsWith(`${queryAncestors.at(-1).scanNumber}.`), true);

    const issueResult = await createScan({
      url: `${fixtureOrigin}/archive/story?edition=gb`,
      maxPages: 100,
      options: {},
    }, authToken);
    const issueNodes = flattenTree(issueResult.root);
    const unavailableAncestor = issueNodes.find((node) => node.url === `${fixtureOrigin}/archive`);
    assert.equal(unavailableAncestor.nodeKind, 'focus-ghost');
    assert.equal(unavailableAncestor.httpStatus, 503);
    assert.equal(unavailableAncestor.isError, true);
    assert.equal(unavailableAncestor.isMissing, false);
    assert.equal(
      issueNodes.some((node) => node.url === `${fixtureOrigin}/archive/story`),
      false,
      'queryless target path should not be recreated as a missing parent'
    );
    assert.ok(
      issueNodes.some((node) => node.url === `${fixtureOrigin}/archive/story/comments`),
      'descendants should remain in the focused result'
    );
    console.log('[focused-scan-fixture] Passed.');
  } finally {
    if (fixture) await new Promise((resolve) => fixture.close(resolve));
    if (backend) backend.kill('SIGINT');
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[focused-scan-fixture] Failed: ${error.message}`);
  process.exit(1);
});
