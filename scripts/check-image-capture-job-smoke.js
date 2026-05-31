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
  const hitCounts = new Map();
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    hitCounts.set(pathname, (hitCounts.get(pathname) || 0) + 1);
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    let finished = false;
    const markFinished = () => {
      if (finished) return;
      finished = true;
      activeRequests = Math.max(0, activeRequests - 1);
    };
    res.on('finish', markFinished);
    res.on('close', markFinished);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (pathname.startsWith('/slow')) {
      setTimeout(() => {
        if (res.destroyed || res.writableEnded) return;
        res.end(`<!doctype html>
          <html><head><title>Slow page</title></head>
          <body><main><h1>Slow page loaded</h1><p>This page needs a recovery pass.</p></main></body></html>`);
      }, 6500);
      return;
    }
    if (pathname === '/rendered-404') {
      res.statusCode = 404;
    }
    if (pathname === '/login') {
      res.end(`<!doctype html>
        <html>
          <head><title>Login</title></head>
          <body>
            <main>
              <h1>Sign in</h1>
              <form><label>Email <input type="email" /></label><button>Continue</button></form>
            </main>
          </body>
        </html>`);
      return;
    }
    if (pathname === '/rendered.txt') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Renderable transcript\n\nThis plain text URL should still receive a screenshot.');
      return;
    }
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
  server.hitCounts = hitCounts;
  server.getMaxActiveRequests = () => maxActiveRequests;
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
      IMAGE_CAPTURE_PRIMARY_MAX_ATTEMPTS: '1',
      IMAGE_CAPTURE_RECOVERY_MAX_PASSES: '1',
      IMAGE_CAPTURE_RECOVERY_MAX_ATTEMPTS: '1',
      IMAGE_CAPTURE_PRIMARY_CONCURRENCY: '2',
      IMAGE_CAPTURE_RECOVERY_CONCURRENCY: '1',
      SCREENSHOT_THUMB_CAPTURE_TIMEOUT_MS: '12000',
      SCREENSHOT_PRIMARY_THUMB_CAPTURE_TIMEOUT_MS: '5000',
      SCREENSHOT_RECOVERY_THUMB_CAPTURE_TIMEOUT_MS: '12000',
      SCREENSHOT_RECOVERY_NETWORK_SETTLE_TIMEOUT_MS: '3000',
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
    const error = new Error(`${res.status} ${data?.error || text || 'request failed'} (${url})`);
    error.status = res.status;
    error.payload = data;
    throw error;
  }
  if (data?.token) cookieJar.token = data.token;
  return data;
}

async function fetchDownload(url, options = {}, cookieJar = { value: '' }) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (cookieJar.value) headers.Cookie = cookieJar.value;
  if (cookieJar.token && !headers.Authorization) headers.Authorization = `Bearer ${cookieJar.token}`;
  const res = await fetch(url, { ...options, headers, redirect: 'manual' });
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    let message = buffer.toString('utf8');
    try {
      message = JSON.parse(message).error || message;
    } catch {
      // Keep raw text.
    }
    throw new Error(`${res.status} ${message || 'request failed'} (${url})`);
  }
  return {
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    contentDisposition: res.headers.get('content-disposition') || '',
    buffer,
  };
}

function listZipEntryNames(buffer) {
  const names = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(buffer.slice(nameStart, nameStart + nameLength).toString('utf8'));
    offset = nameStart + nameLength + extraLength + compressedSize;
  }
  return names;
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

const IMAGE_ASSET_FIELDS = [
  'thumbnailUrl',
  'thumbnailFullUrl',
  'fullScreenshotUrl',
  'thumbnailCaptureError',
  'thumbnailCaptureFailedAt',
  'thumbnailCaptureFailed',
  'fullScreenshotTruncated',
  'authRequired',
];

function stripNodeImageAssets(node) {
  if (!node || typeof node !== 'object') return node;
  const next = { ...node };
  IMAGE_ASSET_FIELDS.forEach((field) => {
    delete next[field];
  });
  if (Array.isArray(node.children)) {
    next.children = node.children.map(stripNodeImageAssets);
  }
  return next;
}

function stripPersistedMapImageAssetFields(dbPath, mapId) {
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    const row = db.prepare('SELECT root_data, orphans_data FROM maps WHERE id = ?').get(mapId);
    assert(row, 'map row missing before image asset strip');
    const root = stripNodeImageAssets(JSON.parse(row.root_data));
    const orphans = row.orphans_data ? JSON.parse(row.orphans_data).map(stripNodeImageAssets) : [];
    db.prepare('UPDATE maps SET root_data = ?, orphans_data = ? WHERE id = ?')
      .run(JSON.stringify(root), orphans.length ? JSON.stringify(orphans) : null, mapId);
  } finally {
    db.close();
  }
}

function getPersistedMapNode(dbPath, mapId, nodeId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare('SELECT root_data, orphans_data FROM maps WHERE id = ?').get(mapId);
    assert(row, 'map row missing before persisted node read');
    const root = row.root_data ? JSON.parse(row.root_data) : null;
    const orphans = row.orphans_data ? JSON.parse(row.orphans_data) : [];
    return collectNodes(root, orphans).find((node) => String(node?.id || '') === String(nodeId || '')) || null;
  } finally {
    db.close();
  }
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

function getImageActivityCount(dbPath, mapId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS count
      FROM map_activity_events
      WHERE map_id = ? AND event_type = 'content.images.updated'
    `).get(mapId);
    return Number(row?.count || 0);
  } finally {
    db.close();
  }
}

function getJobStatus(dbPath, jobId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId);
    return row?.status || null;
  } finally {
    db.close();
  }
}

function insertActiveImageCaptureJob(dbPath, {
  jobId,
  mapId,
  captureType,
  scope,
  targetMode = 'remaining',
  nodeIds = [],
  status = 'running',
  progress = null,
}) {
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    db.prepare(`
      INSERT INTO jobs (id, type, status, started_at, payload, progress)
      VALUES (?, 'image_capture', ?, CURRENT_TIMESTAMP, ?, ?)
    `).run(jobId, status, JSON.stringify({
      mapId,
      captureType,
      scope,
      targetMode,
      nodeIds,
    }), progress ? JSON.stringify(progress) : null);
  } finally {
    db.close();
  }
}

function deleteJob(dbPath, jobId) {
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
  } finally {
    db.close();
  }
}

function getStaleManifestCount(dbPath, mapId, nodeId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare(`
      SELECT COUNT(*) AS count
      FROM map_image_assets
      WHERE map_id = ? AND node_id = ? AND status = 'stale'
    `).get(mapId, nodeId);
    return Number(row?.count || 0);
  } finally {
    db.close();
  }
}

function deleteImageAssetManifestRows(dbPath, mapId) {
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    db.prepare('DELETE FROM map_image_assets WHERE map_id = ?').run(mapId);
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
  const inactivePort = await getFreePort();
  const inactiveBase = `http://127.0.0.1:${inactivePort}`;

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
        id: 'text-0',
        url: `${fixtureBase}/rendered.txt`,
        title: 'Renderable text URL',
        children: [],
        isFile: true,
        orphanType: 'file',
      }, {
        id: 'error-0',
        url: `${fixtureBase}/rendered-404`,
        title: 'Rendered 404 page',
        children: [],
        isBroken: true,
        statusCode: 404,
      }, {
        id: 'auth-0',
        url: `${fixtureBase}/login`,
        title: 'Login page',
        children: [],
        authRequired: true,
      }, {
        id: 'inactive-0',
        url: `${inactiveBase}/inactive`,
        title: 'Inactive page',
        children: [],
        scanStatus: 'inactive',
      }, {
        id: 'slow-0',
        url: `${fixtureBase}/slow`,
        title: 'Slow page',
        children: [],
      }, {
        id: 'slow-1',
        url: `${fixtureBase}/slow-again`,
        title: 'Another slow page',
        children: [],
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

    const mapName = 'Image Capture Smoke 👍';
    const packageName = 'Vellic-Image-Capture-Smoke-👍_images';
    const saved = await fetchJson(`${apiBase}/api/maps`, {
      method: 'POST',
      body: JSON.stringify({
        name: mapName,
        url: `${fixtureBase}/`,
        root,
        orphans,
        connections: [],
        colors: ['#111111', '#222222', '#333333'],
      }),
    }, cookieJar);
    const mapId = saved.map?.id;
    assert(mapId, 'missing map id');

    const activeAllJobId = `active-all-${Date.now()}`;
    insertActiveImageCaptureJob(dbPath, {
      jobId: activeAllJobId,
      mapId,
      captureType: 'thumb',
      scope: 'all',
      targetMode: 'remaining',
    });
    try {
      await assert.rejects(
        () => fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs`, {
          method: 'POST',
          body: JSON.stringify({
            captureType: 'thumb',
            scope: 'selected',
            nodeIds: ['main-0'],
            targetMode: 'remaining',
          }),
        }, cookieJar),
        (error) => error.status === 409 && error.payload?.code === 'IMAGE_CAPTURE_JOB_ACTIVE',
        'different selected capture should not reuse an active all-pages job'
      );
    } finally {
      deleteJob(dbPath, activeAllJobId);
    }

    const activeSelectedJobId = `active-selected-${Date.now()}`;
    insertActiveImageCaptureJob(dbPath, {
      jobId: activeSelectedJobId,
      mapId,
      captureType: 'thumb',
      scope: 'selected',
      targetMode: 'remaining',
      nodeIds: ['main-0'],
    });
    try {
      const matchingActive = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs`, {
        method: 'POST',
        body: JSON.stringify({
          captureType: 'thumb',
          scope: 'selected',
          nodeIds: ['main-0'],
          targetMode: 'remaining',
        }),
      }, cookieJar);
      assert.strictEqual(matchingActive.alreadyRunning, true, 'matching active selected job should be reused');
      assert.strictEqual(matchingActive.jobId, activeSelectedJobId, 'matching active selected job id mismatch');
      const activeInfo = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs/active`, {}, cookieJar);
      assert.strictEqual(activeInfo.job?.id, activeSelectedJobId, 'active endpoint should return running image capture job');
    } finally {
      deleteJob(dbPath, activeSelectedJobId);
    }

    const settledActiveJobId = `settled-active-${Date.now()}`;
    insertActiveImageCaptureJob(dbPath, {
      jobId: settledActiveJobId,
      mapId,
      captureType: 'thumb',
      scope: 'all',
      targetMode: 'remaining',
      progress: {
        total: 1,
        completed: 1,
        captured: 1,
        failed: 0,
        blocked: 0,
        missingAsset: 0,
        skipped: 0,
        currentNodeId: null,
      },
    });
    const afterSettledActive = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs`, {
      method: 'POST',
      body: JSON.stringify({
        captureType: 'thumb',
        scope: 'selected',
        nodeIds: ['main-0'],
        targetMode: 'remaining',
      }),
    }, cookieJar);
    assert.notStrictEqual(
      afterSettledActive.jobId,
      settledActiveJobId,
      'settled active job should not be reused'
    );
    assert.strictEqual(getJobStatus(dbPath, settledActiveJobId), 'complete', 'settled active job should be repaired');
    await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs/${afterSettledActive.jobId}/cancel`, {
      method: 'POST',
    }, cookieJar);

    const thumbStart = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs`, {
      method: 'POST',
      body: JSON.stringify({ captureType: 'thumb', scope: 'all' }),
    }, cookieJar);
    assert.notStrictEqual(
      getJobStatus(dbPath, thumbStart.jobId),
      'queued',
      'image capture jobs should be claimed before generic workers can take them'
    );
    const activeJobInfo = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs/active`, {}, cookieJar);
    assert.strictEqual(activeJobInfo.job?.id, thumbStart.jobId, 'active endpoint should expose running image capture job');
    await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs/${thumbStart.jobId}/pause`, {
      method: 'POST',
    }, cookieJar);
    assert.strictEqual(getJobStatus(dbPath, thumbStart.jobId), 'paused', 'pause should mark image capture job paused');
    const pausedJobInfo = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs/active`, {}, cookieJar);
    assert.strictEqual(pausedJobInfo.job?.status, 'paused', 'active endpoint should expose paused image capture job');
    await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs/${thumbStart.jobId}/resume`, {
      method: 'POST',
    }, cookieJar);
    const thumbJob = await pollImageCaptureJob(apiBase, mapId, thumbStart.jobId, cookieJar);
    assert.strictEqual(thumbJob.result.total, 13, 'thumbnail total mismatch');
    assert.strictEqual(thumbJob.result.captured, 12, 'thumbnail captured mismatch');
    assert.strictEqual(thumbJob.result.skipped, 1, 'thumbnail skipped mismatch');
    assert.strictEqual(thumbJob.result.phase, 'needs_review', 'thumbnail job should surface skipped files for review');
    assert.strictEqual(thumbJob.result.failed + thumbJob.result.blocked + thumbJob.result.missingAsset, 0, 'thumbnail failures found');
    assert(Number(thumbJob.result.assetUpdateCursor) >= 10, 'missing asset update cursor');
    assert(
      (fixtureServer.hitCounts.get('/slow') || 0) >= 2,
      'slow pages should fail fast in the primary pass and retry in recovery'
    );
    assert(
      (fixtureServer.hitCounts.get('/slow-again') || 0) >= 2,
      'additional slow pages should retry in recovery'
    );
    assert(
      fixtureServer.getMaxActiveRequests() >= 2,
      'thumbnail primary pass should capture more than one page at a time'
    );
    assert(
      getImageActivityCount(dbPath, mapId) >= 1,
      'thumbnail capture should add an activity entry'
    );

    const withThumbs = await fetchJson(`${apiBase}/api/maps/${mapId}`, {}, cookieJar);
    const thumbNodes = collectNodes(withThumbs.map.root, withThumbs.map.orphans);
    assert.strictEqual(thumbNodes.length, 13, 'loaded node count mismatch');
    const storedThumbnailCount = thumbNodes.filter((page) => page.thumbnailUrl).length;
    assert.strictEqual(storedThumbnailCount, thumbJob.result.captured, 'saved count exceeded stored thumbnails');
    const skippedIds = new Set(['file-0']);
    thumbNodes
      .filter((page) => !skippedIds.has(page.id))
      .forEach((page) => assert(page.thumbnailUrl, `missing thumbnailUrl for ${page.id}`));
    thumbNodes
      .filter((page) => skippedIds.has(page.id))
      .forEach((page) => {
        assert(!page.thumbnailUrl, `skipped page should not keep thumbnailUrl for ${page.id}`);
        assert(page.thumbnailCaptureFailed, `skipped page missing failure marker for ${page.id}`);
      });
    ['text-0', 'error-0', 'auth-0', 'inactive-0', 'slow-0', 'slow-1'].forEach((nodeId) => {
      const page = thumbNodes.find((node) => node.id === nodeId);
      assert(page?.thumbnailUrl, `expected rendered page thumbnail for ${nodeId}`);
      assert(!page.thumbnailCaptureFailed, `rendered page should not be marked failed for ${nodeId}`);
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

    const recaptureFullStart = await fetchJson(`${apiBase}/api/maps/${mapId}/image-capture-jobs`, {
      method: 'POST',
      body: JSON.stringify({ captureType: 'full', scope: 'all', targetMode: 'captured' }),
    }, cookieJar);
    const recaptureFullJob = await pollImageCaptureJob(apiBase, mapId, recaptureFullStart.jobId, cookieJar);
    assert.strictEqual(recaptureFullJob.result.targetMode, 'captured', 'recapture target mode mismatch');
    assert.strictEqual(recaptureFullJob.result.total, 1, 'captured-only recapture should target one saved full screenshot');
    assert.strictEqual(recaptureFullJob.result.captured, 1, 'captured-only recapture should refresh the saved full screenshot');
    assert.strictEqual(recaptureFullJob.result.skipped, 0, 'captured-only recapture should not skip missing full screenshots');
    assert.strictEqual(
      recaptureFullJob.result.results.some((result) => result.nodeId !== 'main-0'),
      false,
      'captured-only recapture should not capture pages without saved full screenshots'
    );

    assert(getSavedManifestCount(dbPath, mapId) > 0, 'manifest rows should exist before reload repair checks');

    stripPersistedMapImageAssetFields(dbPath, mapId);
    const repairedReload = await fetchJson(`${apiBase}/api/maps/${mapId}`, {}, cookieJar);
    const repairedReloadMain = collectNodes(repairedReload.map.root, repairedReload.map.orphans)
      .find((page) => page.id === 'main-0');
    assert(repairedReloadMain?.thumbnailUrl, 'map reload should restore thumbnailUrl from manifest');
    assert(repairedReloadMain?.thumbnailFullUrl, 'map reload should restore thumbnailFullUrl from manifest');
    assert(repairedReloadMain?.fullScreenshotUrl, 'map reload should restore fullScreenshotUrl from manifest');
    await assertAssetLoads(apiBase, repairedReloadMain.thumbnailUrl);
    await assertAssetLoads(apiBase, repairedReloadMain.fullScreenshotUrl);

    stripPersistedMapImageAssetFields(dbPath, mapId);
    const repairedSummary = await fetchJson(`${apiBase}/api/maps/${mapId}/summary`, {}, cookieJar);
    assert.strictEqual(repairedSummary.map?.hasThumbnails, true, 'map summary should restore thumbnail state from manifest');

    stripPersistedMapImageAssetFields(dbPath, mapId);
    const repairedScene = await fetchJson(`${apiBase}/api/maps/${mapId}/scene?zoom=1&thumbnails=true`, {}, cookieJar);
    const sceneMain = (repairedScene.scene?.nodes || []).find((page) => page.id === 'main-0');
    assert(sceneMain?.thumbnailUrl, 'map scene should restore thumbnailUrl from manifest');
    assert(!Object.prototype.hasOwnProperty.call(sceneMain, 'fullScreenshotUrl'), 'map scene should not expose fullScreenshotUrl');
    assert(!Object.prototype.hasOwnProperty.call(sceneMain, 'thumbnailFullUrl'), 'map scene should not expose thumbnailFullUrl');
    await assertAssetLoads(apiBase, sceneMain.thumbnailUrl);
    const persistedSceneMain = getPersistedMapNode(dbPath, mapId, 'main-0');
    assert(!persistedSceneMain?.thumbnailUrl, 'map scene should not persist repaired thumbnailUrl during viewport reads');
    assert(!persistedSceneMain?.thumbnailFullUrl, 'map scene should not persist repaired thumbnailFullUrl during viewport reads');
    assert(!persistedSceneMain?.fullScreenshotUrl, 'map scene should not persist repaired fullScreenshotUrl during viewport reads');

    stripPersistedMapImageAssetFields(dbPath, mapId);
    const repairedNode = await fetchJson(`${apiBase}/api/maps/${mapId}/nodes/main-0`, {}, cookieJar);
    assert(repairedNode.node?.thumbnailUrl, 'node read should restore thumbnailUrl from manifest');
    assert(repairedNode.node?.fullScreenshotUrl, 'node read should restore fullScreenshotUrl from manifest');
    await assertAssetLoads(apiBase, repairedNode.node.thumbnailUrl);
    await assertAssetLoads(apiBase, repairedNode.node.fullScreenshotUrl);

    deleteImageAssetManifestRows(dbPath, mapId);
    assert.strictEqual(
      getSavedManifestCount(dbPath, mapId),
      0,
      'test setup should remove manifest rows before legacy download check'
    );

    const singleDownload = await fetchDownload(`${apiBase}/api/maps/${mapId}/images/download`, {
      method: 'POST',
      body: JSON.stringify({
        scope: 'selected',
        selectedNodeIds: ['sub-1'],
      }),
    }, cookieJar);
    assert(singleDownload.contentType.includes('image/'), `single image content type mismatch: ${singleDownload.contentType}`);
    assert(
      singleDownload.contentDisposition.includes('s1.1-Subdomain-L1'),
      `single image filename should include page number and name: ${singleDownload.contentDisposition}`
    );
    assert(singleDownload.buffer.length > 1000, 'single image download too small');

    const zipDownload = await fetchDownload(`${apiBase}/api/maps/${mapId}/images/download`, {
      method: 'POST',
      body: JSON.stringify({ scope: 'all' }),
    }, cookieJar);
    assert(zipDownload.contentType.includes('application/zip'), `zip content type mismatch: ${zipDownload.contentType}`);
    assert(
      zipDownload.contentDisposition.includes('Vellic-Image-Capture-Smoke-_images.zip'),
      `zip filename fallback should be ASCII-safe: ${zipDownload.contentDisposition}`
    );
    assert(
      zipDownload.contentDisposition.includes(encodeURIComponent(`${packageName}.zip`)),
      `zip filename* should preserve UTF-8 map name: ${zipDownload.contentDisposition}`
    );
    const zipEntries = listZipEntryNames(zipDownload.buffer);
    const imageZipEntries = zipEntries.filter((entry) => !entry.endsWith('/'));
    assert(zipEntries.length >= storedThumbnailCount, 'zip should include captured image entries');
    assert(zipEntries.includes(`${packageName}/`), 'zip should include named package folder');
    assert(zipEntries.includes(`${packageName}/Main site/`), 'zip should include Main site folder');
    assert(
      imageZipEntries.every((entry) => !entry.includes('-thumbnail')),
      `zip should not include small thumbnail files: ${zipEntries.join(', ')}`
    );
    assert(
      zipEntries.some((entry) => entry.includes(`${packageName}/Main site/0-Main.jpg`)),
      `zip missing numbered root full screenshot entry: ${zipEntries.join(', ')}`
    );
    assert(
      zipEntries.some((entry) => entry.includes(`${packageName}/s1-Subdomain-root/s1.1-Subdomain-L1/s1.1-Subdomain-L1.jpg`)),
      `zip missing nested subdomain entry: ${zipEntries.join(', ')}`
    );
    assert(
      getSavedManifestCount(dbPath, mapId) >= storedThumbnailCount,
      'legacy map download should backfill missing manifest rows'
    );

    const latestMap = await fetchJson(`${apiBase}/api/maps/${mapId}`, {}, cookieJar);
    const rootWithChangedUrl = {
      ...latestMap.map.root,
      url: `${fixtureBase}/changed-home`,
    };
    const staleSave = await fetchJson(`${apiBase}/api/maps/${mapId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: latestMap.map.name,
        root: rootWithChangedUrl,
        orphans: latestMap.map.orphans,
        connections: latestMap.map.connections,
        colors: latestMap.map.colors,
      }),
    }, cookieJar);
    assert(!staleSave.map.root.thumbnailUrl, 'URL change should clear stale thumbnailUrl');
    assert(!staleSave.map.root.fullScreenshotUrl, 'URL change should clear stale fullScreenshotUrl');
    assert(getStaleManifestCount(dbPath, mapId, 'main-0') >= 1, 'URL change should mark manifest assets stale');

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
