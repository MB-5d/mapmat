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

async function waitForScanJob(jobId, accessToken) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const data = await fetchJson(`${API_BASE}/scan-jobs/${jobId}?access_token=${accessToken}`);
    const job = data?.job;
    if (job?.status === 'complete') return job;
    if (job?.status === 'failed' || job?.status === 'canceled') {
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
    if (mode === 'robots' && url.pathname === '/custom-sitemap.xml') {
      return send(200, [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `<url><loc>http://127.0.0.1:${server.address().port}/robots-only/from-robots</loc></url>`,
        '</urlset>',
      ].join(''), 'application/xml');
    }
    if (url.pathname === '/robots-only/from-robots') return send(200, '<title>From Robots</title>');

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

    if (url.pathname === '/one-page') {
      return send(200, '<title>One Page</title>');
    }

    return send(404, '<title>Not Found</title>');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function scan(url) {
  const created = await fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    body: JSON.stringify({
      url,
      maxPages: 80,
      options: {},
    }),
  });
  const job = await waitForScanJob(created.jobId, created.jobAccessToken);
  return job.result || {};
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
    assert(countTree(staticResult.root) > 1, 'static links should produce multiple nodes');
    assert.notStrictEqual(staticResult.partialReason, 'scan_collapsed', 'static linked scan should not collapse');
  });

  await withFixture('sitemap', async (base) => {
    const sitemapResult = await scan(`${base}/sitemap-only`);
    assert(countTree(sitemapResult.root) > 1, 'sitemap-only scan should include sitemap URLs');
    assert(sitemapResult.scanDiagnostics?.sitemapUrlsQueued > 0, 'sitemap diagnostics should count queued URLs');
  });

  await withFixture('robots', async (base) => {
    const robotsResult = await scan(`${base}/robots-only`);
    assert(countTree(robotsResult.root) > 1, 'robots sitemap scan should include robots sitemap URLs');
    assert(robotsResult.scanDiagnostics?.robotsSitemapUrlsFound > 0, 'robots diagnostics should count sitemap directives');
  });

  await withFixture('rendered', async (base) => {
    const renderedResult = await scan(`${base}/rendered`);
    assert(countTree(renderedResult.root) > 1, 'rendered fallback should include JS-rendered links');
    assert.strictEqual(renderedResult.scanDiagnostics?.renderedDiscoveryTried, true, 'rendered fallback should be used');
    assert(renderedResult.scanDiagnostics?.renderedLinksQueued > 0, 'rendered diagnostics should count queued links');
  });

  await withFixture('one-page', async (base) => {
    const onePageResult = await scan(`${base}/one-page`);
    assert.strictEqual(countTree(onePageResult.root), 1, 'true one-page scan should stay one node');
    assert.notStrictEqual(onePageResult.partialReason, 'scan_collapsed', 'true one-page scan should not be marked collapsed');
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
        child.kill('SIGTERM');
      });
    }
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`scan collapse fixture failed: ${error.message}`);
  process.exit(1);
});
