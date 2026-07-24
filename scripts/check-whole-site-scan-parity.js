const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { computeSceneLayout } = require('../utils/mapScene');

const BASELINE_COMMIT = process.env.SCAN_PARITY_BASELINE_COMMIT || 'a3270b7';
const REQUEST_OPTIONS = Object.freeze({
  thumbnails: false,
  inactivePages: true,
  subdomains: false,
  authenticatedPages: false,
  orphanPages: true,
  errorPages: true,
  brokenLinks: false,
  duplicates: true,
  files: true,
  crosslinks: true,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getOpenPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function createFixtureServer() {
  const pages = new Map([
    ['/', [
      '<title>Home</title>',
      '<a href="/section">Section</a>',
      '<a href="/old">Old</a>',
      '<a href="/duplicate-a">Duplicate A</a>',
      '<a href="/duplicate-b">Duplicate B</a>',
      '<a href="/missing">Missing</a>',
      '<a href="/assets/guide.pdf">Guide</a>',
    ].join('')],
    ['/section', '<title>Section</title><a href="/section/item">Item</a><a href="/duplicate-a">Crosslink</a>'],
    ['/section/item', '<title>Item</title><article>Article</article>'],
    ['/duplicate-a', '<title>Duplicate A</title><link rel="canonical" href="/canonical">'],
    ['/duplicate-b', '<title>Duplicate B</title><link rel="canonical" href="/canonical">'],
  ]);
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://fixture.local');
    if (requestUrl.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nAllow: /');
      return;
    }
    if (requestUrl.pathname === '/old') {
      res.writeHead(302, { location: '/section/item', 'content-type': 'text/html' });
      res.end('<title>Moved</title>');
      return;
    }
    if (requestUrl.pathname === '/assets/guide.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end('%PDF fixture');
      return;
    }
    if (pages.has(requestUrl.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<html><head>${pages.get(requestUrl.pathname)}</head><body>${pages.get(requestUrl.pathname)}</body></html>`);
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

function extractBaseline(repoRoot, tempRoot) {
  const archive = spawnSync('git', ['archive', '--format=tar', BASELINE_COMMIT], {
    cwd: repoRoot,
    maxBuffer: 100 * 1024 * 1024,
  });
  if (archive.status !== 0) {
    throw new Error(`Unable to read pre-feature scanner ${BASELINE_COMMIT}: ${archive.stderr.toString()}`);
  }
  const extracted = spawnSync('tar', ['-xf', '-', '-C', tempRoot], {
    input: archive.stdout,
    maxBuffer: 100 * 1024 * 1024,
  });
  if (extracted.status !== 0) {
    throw new Error(`Unable to extract pre-feature scanner: ${extracted.stderr.toString()}`);
  }
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(tempRoot, 'node_modules'), 'dir');
}

function startBackend(cwd, port, dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      HOST: '127.0.0.1',
      PORT: String(port),
      RUN_MODE: 'web',
      JOB_WORKER_TYPES: 'scan',
      ALLOW_PRIVATE_NETWORKS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.getOutput = () => output;
  return child;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error || body.message || url}`);
  return body;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(child.getOutput());
    try {
      const health = await fetchJson(`${baseUrl}/health`);
      if (health?.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Backend health timeout:\n${child.getOutput()}`);
}

async function runScan(baseUrl, targetUrl) {
  const login = await fetchJson(`${baseUrl}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@vellic.io', password: 'Admin123' }),
  });
  const created = await fetchJson(`${baseUrl}/scan-jobs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ url: targetUrl, maxPages: 60, options: REQUEST_OPTIONS }),
  });
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const response = await fetchJson(
      `${baseUrl}/scan-jobs/${created.jobId}?access_token=${created.jobAccessToken}`,
      { headers: { authorization: `Bearer ${login.token}` } }
    );
    if (response.job?.status === 'complete') return response.job.result;
    if (response.job?.status === 'failed') throw new Error(response.job.error || 'Parity scan failed');
    await sleep(250);
  }
  throw new Error('Parity scan timed out');
}

function flattenRoots(result) {
  const rows = [];
  const seen = new Set();
  const visit = (node, structuralParent = null) => {
    if (!node) return;
    const key = `${node.id || ''}|${node.url || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      url: node.url || null,
      finalUrl: node.finalUrl || node.url || null,
      parentUrl: node.parentUrl || structuralParent || null,
      children: (node.children || []).map((child) => child.url || null).filter(Boolean).sort(),
      httpStatus: Number(node.httpStatus || 0) || null,
      scanStatus: node.scanStatus || null,
      wasRedirect: Boolean(node.wasRedirect),
      redirectTarget: node.wasRedirect ? (node.finalUrl || null) : null,
      canonicalUrl: node.canonicalUrl || null,
      isDuplicate: Boolean(node.isDuplicate),
      duplicateOf: node.duplicateOf || null,
      isMissing: Boolean(node.isMissing || node.isVirtualMissing),
      isInactive: Boolean(node.isInactive),
      isError: Boolean(node.isError),
      authRequired: Boolean(node.authRequired),
      isBlocked: Boolean(node.isBlocked || node.isChallengePage),
      nodeKind: node.nodeKind || null,
    });
    (node.children || []).forEach((child) => visit(child, node.url || structuralParent));
  };
  visit(result.root);
  (result.orphans || []).forEach((node) => visit(node));
  (result.subdomains || []).forEach((node) => visit(node));
  return rows.sort((a, b) => String(a.url).localeCompare(String(b.url)));
}

function getSemanticUrl(node) {
  return node.canonicalUrl
    || (node.wasRedirect ? node.redirectTarget : null)
    || node.url
    || null;
}

function normalizeHierarchy(nodes) {
  const semanticByUrl = new Map(
    nodes.map((node) => [node.url, getSemanticUrl(node)])
  );
  const merged = new Map();
  nodes.forEach((node) => {
    const url = getSemanticUrl(node);
    if (!url) return;
    const existing = merged.get(url) || {
      url,
      originalUrls: [],
      parentUrls: [],
      children: [],
      statuses: [],
      isMissing: false,
      isInactive: false,
      isError: false,
      authRequired: false,
      isBlocked: false,
      nodeKinds: [],
    };
    existing.originalUrls.push(node.url);
    if (node.parentUrl) existing.parentUrls.push(semanticByUrl.get(node.parentUrl) || node.parentUrl);
    node.children.forEach((childUrl) => {
      existing.children.push(semanticByUrl.get(childUrl) || childUrl);
    });
    existing.statuses.push(`${node.httpStatus || 0}:${node.scanStatus || ''}`);
    existing.isMissing ||= node.isMissing;
    existing.isInactive ||= node.isInactive;
    existing.isError ||= node.isError;
    existing.authRequired ||= node.authRequired;
    existing.isBlocked ||= node.isBlocked;
    if (node.nodeKind) existing.nodeKinds.push(node.nodeKind);
    merged.set(url, existing);
  });
  return Array.from(merged.values())
    .map((entry) => ({
      ...entry,
      parentUrls: Array.from(new Set(entry.parentUrls)).sort(),
      children: Array.from(new Set(entry.children)).sort(),
      statuses: Array.from(new Set(entry.statuses)).sort(),
      nodeKinds: Array.from(new Set(entry.nodeKinds)).sort(),
    }))
    .map(({ originalUrls, ...entry }) => entry)
    .sort((a, b) => a.url.localeCompare(b.url));
}

function normalizeRedirects(nodes) {
  return nodes
    .filter((node) => node.wasRedirect)
    .map((node) => ({ url: node.url, target: node.redirectTarget }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

function normalizeDuplicateGroups(nodes) {
  const groups = new Map();
  nodes.forEach((node) => {
    if (!node.canonicalUrl) return;
    const urls = groups.get(node.canonicalUrl) || [];
    urls.push(node.url);
    groups.set(node.canonicalUrl, urls);
  });
  return Array.from(groups.entries())
    .map(([canonicalUrl, urls]) => ({
      canonicalUrl,
      urls: Array.from(new Set(urls)).sort(),
    }))
    .filter((group) => group.urls.length > 1)
    .sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl));
}

function normalizeList(items, keys) {
  return (items || [])
    .map((item) => Object.fromEntries(keys.map((key) => [key, item?.[key] ?? null])))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function normalizeStackGroups(result) {
  const layout = computeSceneLayout(result.root, result.orphans || [], {
    orientation: 'vertical',
    showThumbnails: false,
    expandedStacks: {},
  });
  return layout.nodes
    .filter((node) => node.stackInfo)
    .map((node) => ({
      url: node.url || null,
      collapsed: Boolean(node.stackInfo?.collapsed),
      expanded: Boolean(node.stackInfo?.expanded),
      totalCount: Number(node.stackInfo?.totalCount || 0),
      showCollapse: Boolean(node.stackInfo?.showCollapse),
    }))
    .sort((a, b) => String(a.url).localeCompare(String(b.url)));
}

function normalizeResult(result) {
  const nodes = flattenRoots(result);
  const hierarchy = normalizeHierarchy(nodes);
  return {
    hierarchy,
    redirects: normalizeRedirects(nodes),
    duplicateGroups: normalizeDuplicateGroups(nodes),
    errors: normalizeList(result.errors, ['url', 'status', 'authRequired', 'blockedReason']),
    inactivePages: normalizeList(result.inactivePages, ['url', 'status', 'reason', 'blockedReason']),
    brokenLinks: normalizeList(result.brokenLinks, ['url', 'sourceUrl', 'status', 'reason']),
    files: normalizeList(result.files, ['url', 'sourceUrl', 'contentType', 'fileType', 'extension']),
    crosslinks: (result.crosslinks || []).length,
    stackGroups: normalizeStackGroups(result),
    capturedPageCount: hierarchy.filter((node) => (
      !node.nodeKinds.includes('focus-ghost')
      && !node.nodeKinds.includes('deferred-group')
      && !node.isMissing
      && node.statuses.some((status) => /^2\d\d:|^3\d\d:/.test(status))
    )).length,
    scanOptions: result.scanOptions || REQUEST_OPTIONS,
    repetitiveGroups: result.repetitiveGroups || [],
  };
}

async function closeServer(server) {
  if (!server) return;
  if (typeof server.kill === 'function') {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      sleep(2000),
    ]);
    if (server.exitCode === null) server.kill('SIGKILL');
    return;
  }
  await new Promise((resolve) => server.close(resolve));
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-whole-site-parity-'));
  const baselineRoot = path.join(tempRoot, 'baseline');
  fs.mkdirSync(baselineRoot);
  let fixture;
  let baselineBackend;
  let candidateBackend;
  try {
    extractBaseline(repoRoot, baselineRoot);
    fixture = await createFixtureServer();
    const [baselinePort, candidatePort] = await Promise.all([getOpenPort(), getOpenPort()]);
    baselineBackend = startBackend(baselineRoot, baselinePort, path.join(tempRoot, 'baseline.db'));
    candidateBackend = startBackend(repoRoot, candidatePort, path.join(tempRoot, 'candidate.db'));
    const baselineBase = `http://127.0.0.1:${baselinePort}`;
    const candidateBase = `http://127.0.0.1:${candidatePort}`;
    await Promise.all([
      waitForHealth(baselineBase, baselineBackend),
      waitForHealth(candidateBase, candidateBackend),
    ]);
    const targetUrl = `http://127.0.0.1:${fixture.address().port}/`;
    const [baselineResult, candidateResult] = await Promise.all([
      runScan(baselineBase, targetUrl),
      runScan(candidateBase, targetUrl),
    ]);
    if (process.env.SCAN_PARITY_DEBUG === 'true') {
      console.log(JSON.stringify({
        baseline: normalizeResult(baselineResult),
        candidate: normalizeResult(candidateResult),
      }, null, 2));
    }
    assert.deepStrictEqual(
      normalizeResult(candidateResult),
      normalizeResult(baselineResult),
      `whole-site scanner changed relative to pre-feature commit ${BASELINE_COMMIT}`
    );
    console.log(`[whole-site-scan-parity] Passed against ${BASELINE_COMMIT}.`);
  } finally {
    await Promise.all([
      closeServer(baselineBackend),
      closeServer(candidateBackend),
      closeServer(fixture),
    ]);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[whole-site-scan-parity] Failed:', error.message);
  process.exitCode = 1;
});
