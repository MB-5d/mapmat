/* eslint-disable no-console */
const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const BACKEND_PORT = Number(process.env.LARGE_SCAN_COVERAGE_PORT || 4341);
const API_BASE = `http://127.0.0.1:${BACKEND_PORT}`;
const FIXTURE_PAGE_COUNT = Number(process.env.LARGE_SCAN_FIXTURE_PAGES || 25000);
const STOP_FETCHED_TARGET = Number(process.env.LARGE_SCAN_STOP_FETCHED_TARGET || 15000);
const TIMEOUT_MS = Number(process.env.LARGE_SCAN_COVERAGE_TIMEOUT_MS || 180000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function countVisibleResultPages(result) {
  const stack = [result?.root, ...(result?.orphans || []), ...(result?.subdomains || [])].filter(Boolean);
  const seen = new Set();
  let count = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    const key = String(node?.id || node?.url || '');
    if (!node || (key && seen.has(key))) continue;
    if (key) seen.add(key);
    const isPage = /^https?:\/\//i.test(String(node.url || ''));
    if (
      isPage
      && !node.isVirtualMissing
      && !node.isStructuralContext
      && !node.isEntitlementLocked
      && !node.entitlementLocked
      && !['focus-ghost', 'deferred-group'].includes(node.nodeKind)
    ) count += 1;
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return count;
}

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
  let mode = 'repetitive';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture.local');
    const send = (status, body, contentType = 'text/html') => {
      res.writeHead(status, { 'content-type': contentType });
      res.end(body);
    };
    if (url.pathname === '/') {
      mode = url.searchParams.get('fixture') || mode;
      return send(200, `<html><head><title>${mode}</title></head><body>${mode}</body></html>`);
    }
    if (url.pathname === '/robots.txt') {
      return send(
        200,
        `Sitemap: http://127.0.0.1:${server.address().port}/sitemap.xml`,
        'text/plain'
      );
    }
    if (url.pathname === '/sitemap.xml') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const entries = Array.from({ length: FIXTURE_PAGE_COUNT }, (_, index) => (
        mode === 'repetitive'
          ? `${origin}/articles/story-${index + 1}`
          : `${origin}/root-page-${index + 1}`
      ));
      return send(
        200,
        `<urlset>${entries.map((entry) => `<url><loc>${entry}</loc></url>`).join('')}</urlset>`,
        'application/xml'
      );
    }
    if (/^\/articles\/story-\d+$/.test(url.pathname)) {
      return send(200, '<html><head><title>Article</title><meta property="og:type" content="article"></head><body><article>Article</article></body></html>');
    }
    if (/^\/root-page-\d+$/.test(url.pathname)) {
      return send(200, '<html><head><title>Unique page</title></head><body>Unique page</body></html>');
    }
    return send(404, '<html><head><title>Not found</title></head><body>Not found</body></html>');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function waitForHealth() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const health = await fetchJson(`${API_BASE}/health`);
      if (health?.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Backend health check timed out');
}

async function getJob(jobId, accessToken, authToken, includeResult = false) {
  return fetchJson(
    `${API_BASE}/scan-jobs/${jobId}?include_result=${includeResult ? 'true' : 'false'}&access_token=${accessToken}`,
    { headers: authToken ? { authorization: `Bearer ${authToken}` } : {} }
  );
}

async function createScan(url, authToken) {
  return fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
    body: JSON.stringify({
      url,
      maxPages: 50000,
      options: {},
    }),
  });
}

async function waitForTerminalJob(jobId, accessToken, authToken) {
  const startedAt = Date.now();
  let lastJob = null;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    try {
      const response = await getJob(jobId, accessToken, authToken, true);
      const job = response?.job;
      lastJob = job || lastJob;
      if (job?.status === 'complete') return job;
      if (job?.status === 'failed' || job?.status === 'canceled') {
        throw new Error(`Scan ended with ${job.status}: ${job.error || 'no error'}`);
      }
    } catch (error) {
      if (!String(error?.message || '').includes('fetch failed')) throw error;
    }
    await sleep(100);
  }
  throw new Error(`Scan job timed out: ${JSON.stringify(lastJob?.progress || {})}`);
}

async function waitForFetchedTarget(jobId, accessToken, authToken) {
  const startedAt = Date.now();
  let lastJob = null;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    try {
      const response = await getJob(jobId, accessToken, authToken, false);
      const job = response?.job;
      lastJob = job || lastJob;
      if (Number(job?.progress?.fetched || 0) >= STOP_FETCHED_TARGET) return job;
      if (job?.status === 'complete') return job;
      if (job?.status === 'failed' || job?.status === 'canceled') {
        throw new Error(`Scan ended with ${job.status}: ${job.error || 'no error'}`);
      }
    } catch (error) {
      if (!String(error?.message || '').includes('fetch failed')) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Scan did not reach the fetched-page target: ${JSON.stringify(lastJob?.progress || {})}`);
}

async function main() {
  let fixture = null;
  let backend = null;
  let tempDir = null;
  try {
    fixture = await createFixtureServer();
    const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-large-scan-coverage-'));
    const backendEnv = {
      ...process.env,
      DB_PATH: path.join(tempDir, 'vellic.db'),
      HOST: '127.0.0.1',
      PORT: String(BACKEND_PORT),
      RUN_MODE: 'web',
      JOB_WORKER_TYPES: 'scan',
      ALLOW_PRIVATE_NETWORKS: 'true',
      SCAN_PAGE_CONCURRENCY: '64',
      SCAN_JOB_MAX_PAGES_DEFAULT: '50000',
      SCAN_PAGE_BATCH_SIZE: '5000',
      SCAN_PAGE_SAFETY_CAP: '50000',
      SCAN_SITEMAP_RESPONSE_MAX_BYTES: String(30 * 1024 * 1024),
    };
    backend = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: backendEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    backend.stdout.on('data', (chunk) => process.stdout.write(chunk));
    backend.stderr.on('data', (chunk) => process.stderr.write(chunk));
    backend.on('exit', (code, signal) => {
      if (code || signal) console.error('[large-scan-coverage] Backend exited', { code, signal });
    });
    await waitForHealth();

    const cappedGuestScan = await createScan(`${fixtureOrigin}/?fixture=repetitive`, null);
    const cappedGuestJob = await waitForTerminalJob(
      cappedGuestScan.jobId,
      cappedGuestScan.jobAccessToken,
      null
    );
    assert.equal(cappedGuestJob.result?.partialReason, 'scan_discovery_cap');
    assert.equal(Number(cappedGuestJob.result?.pageCountSummary?.discoveredLimit || 0), 5000);
    assert.equal(Number(cappedGuestJob.result?.pageCountSummary?.accountedPageCount || 0), 5000);
    assert.equal(Number(cappedGuestJob.progress?.allowedFetchedPages || 0), 25);

    const login = await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@vellic.io', password: 'Admin123' }),
    });
    assert.ok(login.token, 'fixture login should return an auth token');
    const authToken = login.token;
    const backfill = spawnSync(
      process.execPath,
      ['scripts/backfill-test-unlimited-accounts.js', '--apply', '--only-email=admin@vellic.io'],
      { cwd: process.cwd(), env: backendEnv, encoding: 'utf8' }
    );
    if (backfill.status !== 0) {
      throw new Error(backfill.stderr || backfill.stdout || 'Failed to enable unlimited fixture plan');
    }

    const repetitive = await createScan(`${fixtureOrigin}/?fixture=repetitive`, authToken);
    const repetitiveJob = await waitForTerminalJob(
      repetitive.jobId,
      repetitive.jobAccessToken,
      authToken
    );
    const repetitiveSummary = repetitiveJob.result?.pageCountSummary || {};
    assert.ok(Number(repetitiveSummary.accountedPageCount || 0) >= FIXTURE_PAGE_COUNT);
    assert.ok(Number(repetitiveSummary.fetchedPageCount || 0) < 1000);
    assert.ok(Number(repetitiveSummary.groupedPageCount || 0) >= FIXTURE_PAGE_COUNT - 20);
    assert.ok(
      Number(repetitiveJob.progress?.accountedMilestonesCompleted || 0)
        >= Math.floor(FIXTURE_PAGE_COUNT / 5000)
    );
    assert.equal(Number(repetitiveJob.progress?.accountedMilestoneSize || 0), 5000);
    assert.equal(
      Number(repetitiveSummary.visiblePageCount || 0),
      countVisibleResultPages(repetitiveJob.result)
    );

    const nonRepetitive = await createScan(`${fixtureOrigin}/?fixture=nonrepetitive`, authToken);
    const reachedTarget = await waitForFetchedTarget(
      nonRepetitive.jobId,
      nonRepetitive.jobAccessToken,
      authToken
    );
    const stopStartedAt = Date.now();
    if (reachedTarget.status !== 'complete') {
      await fetchJson(
        `${API_BASE}/scan-jobs/${nonRepetitive.jobId}/stop?access_token=${nonRepetitive.jobAccessToken}`,
        { method: 'POST', headers: { authorization: `Bearer ${authToken}` } }
      );
    }
    const stoppedJob = await waitForTerminalJob(
      nonRepetitive.jobId,
      nonRepetitive.jobAccessToken,
      authToken
    );
    const stopElapsedMs = Date.now() - stopStartedAt;
    const stoppedSummary = stoppedJob.result?.pageCountSummary || {};
    assert.ok(Number(stoppedSummary.fetchedPageCount || 0) >= STOP_FETCHED_TARGET);
    assert.ok(Number(stoppedSummary.accountedPageCount || 0) >= STOP_FETCHED_TARGET);
    assert.ok(
      Number(stoppedSummary.capturedPageCount || 0)
        >= Number(stoppedSummary.fetchedPageCount || 0) - 100,
      'successful captures should remain counted after visible display grouping'
    );
    assert.ok(
      Number(stoppedJob.progress?.batchNumber || 0)
        >= Math.max(1, Math.ceil(STOP_FETCHED_TARGET / 5000))
    );
    assert.ok(
      Number(stoppedJob.progress?.accountedMilestonesCompleted || 0)
        >= Math.floor(STOP_FETCHED_TARGET / 5000)
    );
    assert.ok(stoppedJob.result?.root, 'stopped scan should return a valid map');
    assert.equal(
      Number(stoppedSummary.visiblePageCount || 0),
      countVisibleResultPages(stoppedJob.result)
    );
    assert.ok(stopElapsedMs < 60000, `Stop should finalize within 60 seconds, took ${stopElapsedMs}ms`);

    console.log('[large-scan-coverage] Passed.', {
      repetitive: repetitiveSummary,
      stopped: stoppedSummary,
      stopElapsedMs,
    });
  } finally {
    if (fixture) await new Promise((resolve) => fixture.close(resolve));
    if (backend) backend.kill('SIGINT');
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[large-scan-coverage] Failed: ${error.message}`);
  process.exit(1);
});
