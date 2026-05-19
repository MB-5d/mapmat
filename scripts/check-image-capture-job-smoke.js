#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 2000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function startFixtureServer(port) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html>
      <html>
        <head>
          <title>${pathname}</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #111827; }
            header { height: 120px; background: #2563eb; color: white; display: flex; align-items: center; padding: 32px; }
            main { min-height: 1200px; padding: 32px; }
            section { height: 360px; border: 1px solid #cbd5e1; margin: 20px 0; padding: 24px; background: white; }
          </style>
        </head>
        <body>
          <header><h1>Image Capture ${pathname}</h1></header>
          <main>
            <section>Top content</section>
            <section>Middle content</section>
            <section>Bottom content</section>
          </main>
        </body>
      </html>`);
  });
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function startBackend(port, dbPath, screenshotDir) {
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DB_PATH: dbPath,
      RUN_MODE: 'both',
      JOB_WORKER_TYPES: 'image_capture',
      ALLOW_PRIVATE_NETWORKS: 'true',
      SCREENSHOT_STORAGE_DIR: screenshotDir,
      SCREENSHOT_QUEUE_MAX: '20',
      SCREENSHOT_MAX_CONCURRENCY: '2',
      IMAGE_CAPTURE_MAX_ATTEMPTS: '2',
      EMAIL_PROVIDER: 'log',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const append = (chunk) => {
    output += chunk.toString();
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  return {
    child,
    waitUntilReady: async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        if (output.includes(`Vellic Backend running on http://127.0.0.1:${port}`)) return;
        if (child.exitCode !== null) {
          throw new Error(`backend exited early: ${output}`);
        }
        await wait(250);
      }
      throw new Error(`backend did not start: ${output}`);
    },
    getOutput: () => output,
  };
}

async function fetchJson(url, options = {}, cookieJar = { value: '' }) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (cookieJar.value) headers.Cookie = cookieJar.value;
  if (cookieJar.token && !headers.Authorization) headers.Authorization = `Bearer ${cookieJar.token}`;
  const res = await fetch(url, { ...options, headers, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const cookie = setCookie.split(';')[0];
    cookieJar.value = cookieJar.value ? `${cookieJar.value}; ${cookie}` : cookie;
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${data?.error || text || 'request failed'} (${url})`);
  }
  if (data?.token) cookieJar.token = data.token;
  return data;
}

async function pollImageCaptureJob(apiBase, mapId, jobId, cookieJar) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const data = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs/${jobId}`, {}, cookieJar);
    const status = data.job?.status;
    if (['complete', 'failed', 'canceled'].includes(status)) {
      if (status !== 'complete') {
        throw new Error(`job ${status}: ${data.job?.error || 'no error'}`);
      }
      return data.job;
    }
    await wait(1000);
  }
  throw new Error('image capture job timed out');
}

function collectNodes(root, orphans = []) {
  const nodes = [];
  const visit = (node) => {
    if (!node) return;
    nodes.push(node);
    (node.children || []).forEach(visit);
  };
  visit(root);
  (orphans || []).forEach(visit);
  return nodes;
}

async function assertAssetLoads(apiBase, assetUrl) {
  assert(assetUrl, 'missing asset url');
  const absoluteUrl = new URL(assetUrl, apiBase).toString();
  const res = await fetch(absoluteUrl);
  assert(res.ok, `asset did not load: ${res.status} ${absoluteUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  assert(buffer.length > 1000, `asset too small: ${buffer.length}`);
  return { url: absoluteUrl, bytes: buffer.length };
}

function getSavedManifestCount(dbPath, mapId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS count
      FROM map_image_assets
      WHERE map_id = ? AND status = 'saved' AND url IS NOT NULL
    `).get(mapId);
    return Number(row?.count || 0);
  } finally {
    db.close();
  }
}

async function run() {
  const backendPort = await getFreePort();
  const fixturePort = await getFreePort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-image-capture-'));
  const dbPath = path.join(tempDir, 'vellic.db');
  const screenshotDir = path.join(tempDir, 'screenshots');
  const apiBase = `http://127.0.0.1:${backendPort}`;
  const fixtureBase = `http://127.0.0.1:${fixturePort}`;

  const fixtureServer = await startFixtureServer(fixturePort);
  const backend = startBackend(backendPort, dbPath, screenshotDir);

  try {
    await backend.waitUntilReady();
    const cookieJar = { value: '' };
    const email = `image_capture_${Date.now()}@example.com`;
    await fetchJson(`${apiBase}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password: 'testpass123', name: 'Image Capture QA' }),
    }, cookieJar);

    const root = {
      id: 'main-0',
      url: `${fixtureBase}/`,
      title: 'Main',
      children: [{
        id: 'main-1',
        url: `${fixtureBase}/main-1`,
        title: 'Main L1',
        children: [{
          id: 'main-2',
          url: `${fixtureBase}/main-2`,
          title: 'Main L2',
          children: [],
        }],
      }, {
        id: 'file-0',
        url: `${fixtureBase}/handbook.pdf`,
        title: 'Handbook PDF',
        children: [],
        isFile: true,
        orphanType: 'file',
      }, {
        id: 'error-0',
        url: `${fixtureBase}/unreachable`,
        title: 'Unreachable page',
        children: [],
        isInactive: true,
        statusCode: 0,
      }],
    };
    const orphans = [{
      id: 'sub-0',
      url: `${fixtureBase}/sub-0`,
      title: 'Subdomain root',
      orphanType: 'subdomain',
      subdomainRoot: true,
      children: [{
        id: 'sub-1',
        url: `${fixtureBase}/sub-1`,
        title: 'Subdomain L1',
        children: [],
      }],
    }, {
      id: 'orphan-0',
      url: `${fixtureBase}/orphan-0`,
      title: 'Orphan',
      orphanType: 'orphan',
      children: [],
    }];

    const saved = await fetchJson(`${apiBase}/api/maps`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Image Capture Smoke',
        url: `${fixtureBase}/`,
        root,
        orphans,
        connections: [],
        colors: ['#111111', '#222222', '#333333'],
      }),
    }, cookieJar);
    const mapId = saved.map?.id;
    assert(mapId, 'missing map id');

    const thumbStart = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs`, {
      method: 'POST',
      body: JSON.stringify({ captureType: 'thumb', scope: 'all' }),
    }, cookieJar);
    const thumbJob = await pollImageCaptureJob(apiBase, mapId, thumbStart.jobId, cookieJar);
    assert.strictEqual(thumbJob.result.total, 8, 'thumbnail total mismatch');
    assert.strictEqual(thumbJob.result.captured, 6, 'thumbnail captured mismatch');
    assert.strictEqual(thumbJob.result.skipped, 2, 'thumbnail skipped mismatch');
    assert.strictEqual(thumbJob.result.failed + thumbJob.result.blocked + thumbJob.result.missingAsset, 0, 'thumbnail failures found');
    assert(Number(thumbJob.result.assetUpdateCursor) >= 8, 'missing asset update cursor');

    const withThumbs = await fetchJson(`${apiBase}/api/maps/${mapId}`, {}, cookieJar);
    const thumbNodes = collectNodes(withThumbs.map.root, withThumbs.map.orphans);
    assert.strictEqual(thumbNodes.length, 8, 'loaded node count mismatch');
    const storedThumbnailCount = thumbNodes.filter((page) => page.thumbnailUrl).length;
    assert.strictEqual(storedThumbnailCount, thumbJob.result.captured, 'saved count exceeded stored thumbnails');
    const skippedIds = new Set(['file-0', 'error-0']);
    thumbNodes
      .filter((page) => !skippedIds.has(page.id))
      .forEach((page) => assert(page.thumbnailUrl, `missing thumbnailUrl for ${page.id}`));
    thumbNodes
      .filter((page) => skippedIds.has(page.id))
      .forEach((page) => {
        assert(!page.thumbnailUrl, `skipped page should not keep thumbnailUrl for ${page.id}`);
        assert(page.thumbnailCaptureFailed, `skipped page missing failure marker for ${page.id}`);
      });
    await assertAssetLoads(apiBase, thumbNodes.find((page) => page.id === 'main-0').thumbnailUrl);
    const savedManifestCount = getSavedManifestCount(dbPath, mapId);
    assert(
      savedManifestCount >= storedThumbnailCount,
      'manifest saved count should cover stored thumbnails'
    );

    const mainThumbnailUrl = thumbNodes.find((page) => page.id === 'main-0').thumbnailUrl;
    const mainThumbnailFilename = path.basename(new URL(mainThumbnailUrl, apiBase).pathname);
    fs.unlinkSync(path.join(screenshotDir, mainThumbnailFilename));
    const missingValidation = await fetchJson(`${apiBase}/screenshot-assets/validate`, {
      method: 'POST',
      body: JSON.stringify({ urls: [mainThumbnailUrl] }),
    }, cookieJar);
    assert.strictEqual(
      missingValidation.results[mainThumbnailUrl].available,
      false,
      'deleted thumbnail should validate as missing'
    );

    const retryStart = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs`, {
      method: 'POST',
      body: JSON.stringify({ captureType: 'thumb', scope: 'all' }),
    }, cookieJar);
    const retryJob = await pollImageCaptureJob(apiBase, mapId, retryStart.jobId, cookieJar);
    assert.strictEqual(retryJob.result.captured, 1, 'missing thumbnail should be recaptured');
    assert.strictEqual(retryJob.result.missingAsset, 0, 'retry should not count verified asset as missing');
    const afterRetry = await fetchJson(`${apiBase}/api/maps/${mapId}`, {}, cookieJar);
    const afterRetryMain = collectNodes(afterRetry.map.root, afterRetry.map.orphans)
      .find((page) => page.id === 'main-0');
    await assertAssetLoads(apiBase, afterRetryMain.thumbnailUrl);

    const cursorCheck = await fetchJson(
      `${apiBase}/api/maps/${mapId}/image-capture-jobs/${thumbStart.jobId}?include_result=false&asset_update_cursor=${thumbJob.result.assetUpdateCursor}`,
      {},
      cookieJar
    );
    assert.strictEqual(
      cursorCheck.job.progress.nodeAssetUpdates.length,
      0,
      'asset cursor returned already consumed updates'
    );

    const fullStart = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs`, {
      method: 'POST',
      body: JSON.stringify({ captureType: 'full', scope: 'selected', nodeIds: ['main-0'] }),
    }, cookieJar);
    const fullJob = await pollImageCaptureJob(apiBase, mapId, fullStart.jobId, cookieJar);
    assert.strictEqual(fullJob.result.total, 1, 'full screenshot total mismatch');
    assert.strictEqual(fullJob.result.captured, 1, 'full screenshot captured mismatch');
    const fullResult = fullJob.result.results.find((result) => result.nodeId === 'main-0');
    assert(fullResult?.url && /_full_v\d+\.jpe?g/i.test(fullResult.url), 'full screenshot did not return a full asset');
    assert(Number(fullResult.width) >= 1000, `full screenshot width too low: ${fullResult.width}`);
    await assertAssetLoads(apiBase, fullResult.url);
    const fullFilename = path.basename(new URL(fullResult.url, apiBase).pathname);
    fs.unlinkSync(path.join(screenshotDir, fullFilename));
    const missingFullValidation = await fetchJson(`${apiBase}/screenshot-assets/validate`, {
      method: 'POST',
      body: JSON.stringify({ urls: [fullResult.url] }),
    }, cookieJar);
    assert.strictEqual(
      missingFullValidation.results[fullResult.url].available,
      false,
      'deleted full screenshot should validate as missing'
    );

    console.log('image capture job smoke ok');
  } finally {
    await closeServer(fixtureServer);
    await stopChild(backend.child);
  }
}

run().catch((error) => {
  console.error(`image capture job smoke failed: ${error.message}`);
  process.exit(1);
});
