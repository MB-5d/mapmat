/* eslint-disable no-console */
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.SCAN_COLLAPSE_PORT || 4311);
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${PORT}`;
const TIMEOUT_MS = Number(process.env.SCAN_COLLAPSE_TIMEOUT_MS || 90000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const closeServer = (server) => new Promise((resolve) => server.close(resolve));

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

function countTree(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countTree(child), 0);
}

function countCapturedTree(node) {
  if (!node) return 0;
  const structural = node.isStructuralContext
    || node.nodeKind === 'focus-ghost'
    || node.nodeKind === 'deferred-group';
  return (structural ? 0 : 1)
    + (node.children || []).reduce((sum, child) => sum + countCapturedTree(child), 0);
}

function findTreeNode(node, predicate) {
  if (!node) return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const match = findTreeNode(child, predicate);
    if (match) return match;
  }
  return null;
}

async function waitForHealth() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const health = await fetchJson(`${API_BASE}/health`);
      if (health?.ok) return;
    } catch {
      // Wait for backend startup.
    }
    await sleep(500);
  }
  throw new Error('Timed out waiting for local backend health');
}

async function waitForScanJob(jobId, accessToken, { allowFailure = false } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const data = await fetchJson(`${API_BASE}/scan-jobs/${jobId}?access_token=${accessToken}`);
    const job = data?.job;
    if (job?.status === 'complete') return job;
    if (job?.status === 'failed' || job?.status === 'canceled') {
      if (allowFailure) return job;
      throw new Error(`Scan job ended with ${job.status}: ${job.error || 'no error'}`);
    }
    await sleep(500);
  }
  throw new Error('Timed out waiting for scan job to complete');
}

function createFixtureServer(mode) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.local');
    const send = (status, body, contentType = 'text/html') => {
      res.writeHead(status, { 'content-type': contentType });
      res.end(body);
    };

    if (url.pathname === '/static') {
      return send(200, '<title>Static</title><a href="/static/about">About</a><a href="/static/pricing">Pricing</a>');
    }
    if (url.pathname === '/static/about') return send(200, '<title>About</title>');
    if (url.pathname === '/static/pricing') return send(200, '<title>Pricing</title>');

    if (url.pathname === '/sitemap-only') {
      return send(200, '<title>Sitemap only</title>');
    }
    if (mode === 'sitemap' && url.pathname === '/sitemap.xml') {
      return send(200, [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `<url><loc>http://127.0.0.1:${server.address().port}/sitemap-only/page-a</loc></url>`,
        '</urlset>',
      ].join(''), 'application/xml');
    }
    if (url.pathname === '/sitemap-only/page-a') return send(200, '<title>Sitemap Page A</title>');

    if (url.pathname === '/robots-only') {
      return send(200, '<title>Robots only</title>');
    }
    if (mode === 'robots' && url.pathname === '/robots.txt') {
      return send(200, `User-agent: *\nAllow: /\nSitemap: http://127.0.0.1:${server.address().port}/custom-sitemap.xml\n`, 'text/plain');
    }
    if (mode === 'broken-robots-sitemap' && url.pathname === '/robots.txt') {
      return send(200, `User-agent: *\nAllow: /\nSitemap: http://127.0.0.1:${server.address().port}/missing-sitemap.xml\n`, 'text/plain');
    }
    if (mode === 'robots' && url.pathname === '/custom-sitemap.xml') {
      return send(200, [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `<url><loc>http://127.0.0.1:${server.address().port}/robots-only/from-robots</loc></url>`,
        '</urlset>',
      ].join(''), 'application/xml');
    }
    if (url.pathname === '/robots-only/from-robots') return send(200, '<title>From Robots</title>');

    if (url.pathname === '/broken-robots-sitemap') {
      return send(200, '<title>Broken Robots Sitemap</title>');
    }
    if (mode === 'broken-robots-sitemap' && url.pathname === '/robots.txt') {
      return send(200, `User-agent: *\nAllow: /\nSitemap: http://127.0.0.1:${server.address().port}/missing-sitemap.xml\n`, 'text/plain');
    }

    if (url.pathname === '/rendered') {
      return send(200, [
        '<title>Rendered</title>',
        '<script>',
        'setTimeout(() => {',
        '  const a = document.createElement("a");',
        '  a.href = "/rendered/child";',
        '  a.textContent = "Rendered Child";',
        '  document.body.appendChild(a);',
        '}, 10);',
        '</script>',
      ].join(''));
    }
    if (url.pathname === '/rendered/child') return send(200, '<title>Rendered Child</title>');

    if (url.pathname === '/lazy-rendered') {
      return send(200, [
        '<title>Lazy rendered</title>',
        '<main id="root" style="min-height:3200px"><a href="/lazy-rendered/static">Static child</a></main>',
        '<script>',
        'window.addEventListener("scroll", () => {',
        '  if (document.querySelector("[data-lazy-child]")) return;',
        '  const a = document.createElement("a");',
        '  a.href = "/lazy-rendered/child";',
        '  a.dataset.lazyChild = "true";',
        '  a.textContent = "Lazy Child";',
        '  document.body.appendChild(a);',
        '});',
        '</script>',
      ].join(''));
    }
    if (url.pathname === '/lazy-rendered/child') return send(200, '<title>Lazy Rendered Child</title>');
    if (url.pathname === '/lazy-rendered/static') return send(200, '<title>Static Child</title>');

    if (url.pathname === '/stop-tree') {
      const slowLinks = Array.from({ length: 12 }, (_, index) => (
        `<a href="/stop-tree/slow-${index + 1}">Slow ${index + 1}</a>`
      )).join('');
      return send(200, `<title>Stop tree</title><a href="/stop-tree/deep/page">Deep page</a>${slowLinks}`);
    }
    if (url.pathname === '/stop-tree/deep/page') return send(200, '<title>Deep page</title>');
    if (/^\/stop-tree\/slow-\d+$/.test(url.pathname)) {
      return setTimeout(() => send(200, `<title>${url.pathname.split('/').at(-1)}</title>`), 1500);
    }

    if (url.pathname === '/one-page') {
      return send(200, '<title>One Page</title>');
    }
    if (url.pathname === '/slow-root') {
      return setTimeout(() => send(200, '<title>Slow Root</title>'), 1200);
    }
    if (url.pathname === '/access-denied') {
      return send(403, '<title>Access Denied</title><h1>Access Denied</h1>');
    }

    return send(404, '<title>Not Found</title>');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function scan(url, options = {}) {
  const created = await fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    body: JSON.stringify({
      url,
      maxPages: 80,
      options: {},
    }),
  });
  const job = await waitForScanJob(created.jobId, created.jobAccessToken, options);
  return job.result || {};
}

async function scanExpectingFailure(url) {
  const created = await fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    body: JSON.stringify({
      url,
      maxPages: 80,
      options: {},
    }),
  });
  return waitForScanJob(created.jobId, created.jobAccessToken, { allowFailure: true });
}

async function createScanJob(url) {
  const created = await fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    body: JSON.stringify({
      url,
      maxPages: 80,
      options: {},
    }),
  });
  if (!created?.jobId || !created?.jobAccessToken) {
    throw new Error('Scan job creation did not return jobId and access token');
  }
  return created;
}

async function waitForJobStatus(jobId, accessToken, expectedStatus) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const data = await fetchJson(`${API_BASE}/scan-jobs/${jobId}?include_result=false&access_token=${accessToken}`);
    const status = data?.job?.status;
    if (status === expectedStatus) return data.job;
    if (status === 'failed' || status === 'canceled' || status === 'complete') return data.job;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for job status ${expectedStatus}`);
}

async function waitForMappedCount(jobId, accessToken, expectedCount) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const data = await fetchJson(`${API_BASE}/scan-jobs/${jobId}?include_result=false&access_token=${accessToken}`);
    const job = data?.job;
    if (Number(job?.progress?.mapped || job?.progress?.captured || 0) >= expectedCount) return job;
    if (['failed', 'canceled', 'complete'].includes(job?.status)) return job;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${expectedCount} mapped pages`);
}

async function runCheck() {
  await waitForHealth();
  const withFixture = async (mode, callback) => {
    const fixture = await createFixtureServer(mode);
    const base = `http://127.0.0.1:${fixture.address().port}`;
    try {
      await callback(base);
    } finally {
      await closeServer(fixture);
    }
  };

  await withFixture('static', async (base) => {
    const staticResult = await scan(`${base}/static`);
    assert(countCapturedTree(staticResult.root) > 1, 'static links should produce multiple captured pages');
    assert.notStrictEqual(staticResult.partialReason, 'scan_collapsed', 'static linked scan should not collapse');
  });

  await withFixture('sitemap', async (base) => {
    const sitemapResult = await scan(`${base}/sitemap-only`);
    assert(countCapturedTree(sitemapResult.root) > 1, 'sitemap-only scan should include sitemap URLs');
    assert(sitemapResult.scanDiagnostics?.sitemapUrlsQueued > 0, 'sitemap diagnostics should count queued URLs');
  });

  await withFixture('robots', async (base) => {
    const robotsResult = await scan(`${base}/robots-only`);
    assert(countCapturedTree(robotsResult.root) > 1, 'robots sitemap scan should include robots sitemap URLs');
    assert(robotsResult.scanDiagnostics?.robotsSitemapUrlsFound > 0, 'robots diagnostics should count sitemap directives');
  });

  await withFixture('broken-robots-sitemap', async (base) => {
    const brokenJob = await scanExpectingFailure(`${base}/broken-robots-sitemap`);
    assert.strictEqual(brokenJob.status, 'failed', 'broken declared sitemap should fail instead of creating a one-node map');
    assert(/No map was created/.test(brokenJob.error || ''), 'broken sitemap failure should explain that no map was created');
  });

  await withFixture('rendered', async (base) => {
    const renderedResult = await scan(`${base}/rendered`);
    assert(countCapturedTree(renderedResult.root) > 1, 'rendered fallback should include JS-rendered links');
    assert.strictEqual(renderedResult.scanDiagnostics?.renderedDiscoveryTried, true, 'rendered fallback should be used');
    assert(renderedResult.scanDiagnostics?.renderedLinksQueued > 0, 'rendered diagnostics should count queued links');
  });

  await withFixture('lazy-rendered', async (base) => {
    const renderedResult = await scan(`${base}/lazy-rendered`);
    assert(
      findTreeNode(renderedResult.root, (node) => node.url === `${base}/lazy-rendered/child`),
      'rendered discovery should scroll enough to expose lazy-loaded section links'
    );
  });

  await withFixture('broken-robots-sitemap', async (base) => {
    const brokenJob = await scanExpectingFailure(`${base}/broken-robots-sitemap`);
    assert.strictEqual(brokenJob.status, 'failed', 'broken discovery fixture should fail instead of creating a one-node map');
    assert(/No map was created/.test(brokenJob.error || ''), 'broken discovery failure should explain that no map was created');
  });

  await withFixture('one-page', async (base) => {
    const onePageResult = await scan(`${base}/one-page`);
    assert.strictEqual(countCapturedTree(onePageResult.root), 1, 'true one-page scan should keep one captured page');
    assert.strictEqual(onePageResult.root?.nodeKind, undefined, 'reachable homepage context should use its real page state');
    assert.strictEqual(onePageResult.root?.isStructuralContext, true, 'homepage context should stay outside focused page counts');
    assert.strictEqual(countTree(onePageResult.root), 2, 'deep one-page scan should render homepage context plus target');
    assert.notStrictEqual(onePageResult.partialReason, 'scan_collapsed', 'true one-page scan should not be marked collapsed');
    assert.notStrictEqual(onePageResult.partialReason, 'root_discovery_failed', 'true one-page scan should not be marked discovery failed');
  });

  await withFixture('slow-root', async (base) => {
    const created = await createScanJob(`${base}/slow-root`);
    const runningJob = await waitForJobStatus(created.jobId, created.jobAccessToken, 'running');
    assert.strictEqual(runningJob.status, 'running', 'slow-root scan should be running before Stop is requested');
    const stopped = await fetchJson(`${API_BASE}/scan-jobs/${created.jobId}/stop`, {
      method: 'POST',
      body: JSON.stringify({ access_token: created.jobAccessToken }),
    });
    assert.strictEqual(stopped.canceled, undefined, 'Stop on a running scan should not be canceled from stale zero-page progress');
    const stoppedJob = await waitForScanJob(created.jobId, created.jobAccessToken, { allowFailure: true });
    assert.strictEqual(stoppedJob.status, 'failed', 'root-only stopped scan should fail instead of creating a one-node map');
    assert(/No map was created/.test(stoppedJob.error || ''), 'stopped root-only failure should explain that no map was created');
  });

  await withFixture('stop-tree', async (base) => {
    const created = await createScanJob(`${base}/stop-tree`);
    await waitForMappedCount(created.jobId, created.jobAccessToken, 2);
    await fetchJson(`${API_BASE}/scan-jobs/${created.jobId}/stop`, {
      method: 'POST',
      body: JSON.stringify({ access_token: created.jobAccessToken }),
    });
    const stoppedJob = await waitForScanJob(created.jobId, created.jobAccessToken);
    assert.strictEqual(stoppedJob.result?.partialReason, 'stopped_by_user');
    const inferredParent = findTreeNode(
      stoppedJob.result?.root,
      (node) => node.url === `${base}/stop-tree/deep`
    );
    assert(inferredParent, 'a stopped partial map should keep the captured page hierarchy');
    assert.strictEqual(inferredParent.isMissing, false, 'unverified parents must not be mislabeled as missing after Stop');
    assert.strictEqual(inferredParent.isVirtualMissing, false, 'stopped structural parents must not render a missing badge');
    assert.strictEqual(inferredParent.isStructuralContext, true, 'stopped unverified parents should be structural context');
  });

  await withFixture('access-denied', async (base) => {
    const deniedResult = await scan(`${base}/access-denied`);
    assert.strictEqual(
      deniedResult.partialReason,
      'root_discovery_failed',
      'focused blocked pages should keep the limited-result reason'
    );
    assert.strictEqual(
      deniedResult.scanDiagnostics?.rootClassification,
      'scan_limited',
      'focused blocked pages should preserve the challenge classification'
    );
    assert.strictEqual(
      deniedResult.root?.nodeKind,
      undefined,
      'reachable ancestor context should keep its real page state'
    );
    assert.strictEqual(
      deniedResult.root?.isStructuralContext,
      true,
      'ancestor context should remain outside focused page counts'
    );
  });
  console.log('scan collapse fixture ok');
}

async function main() {
  let child = null;
  let tempDir = null;
  if (!process.env.API_BASE) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-scan-collapse-'));
    child = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_PATH: path.join(tempDir, 'vellic.db'),
        HOST: '127.0.0.1',
        PORT: String(PORT),
        RUN_MODE: 'web',
        JOB_WORKER_TYPES: 'scan,discovery,email',
        SCREENSHOT_STORAGE_PROVIDER: 'local',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  }

  try {
    await runCheck();
  } finally {
    if (child) {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill('SIGINT');
      });
    }
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`scan collapse fixture failed: ${error.message}`);
  process.exit(1);
});
