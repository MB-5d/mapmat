/* eslint-disable no-console */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.SCAN_JOB_TREE_PORT || 4307);
const API_BASE = process.env.API_BASE || `http://127.0.0.1:${PORT}`;
const SCAN_URL = process.env.SCAN_JOB_TREE_URL || 'https://flora.ai';
const MAX_PAGES = Number(process.env.SCAN_JOB_TREE_MAX_PAGES || 1000);
const MAX_DEPTH = Number(process.env.SCAN_JOB_TREE_MAX_DEPTH || 4);
const MIN_ROOT_CHILDREN = Number(process.env.SCAN_JOB_TREE_MIN_ROOT_CHILDREN || 2);
const MIN_TOTAL_NODES = Number(process.env.SCAN_JOB_TREE_MIN_TOTAL_NODES || 5);
const TIMEOUT_MS = Number(process.env.SCAN_JOB_TREE_TIMEOUT_MS || 120000);

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
      // Wait for server startup.
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
    await sleep(1000);
  }
  throw new Error('Timed out waiting for scan job to complete');
}

async function runCheck() {
  await waitForHealth();
  const created = await fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    body: JSON.stringify({
      url: SCAN_URL,
      maxPages: MAX_PAGES,
      maxDepth: MAX_DEPTH,
      options: {},
    }),
  });

  if (!created?.jobId || !created?.jobAccessToken) {
    throw new Error('Scan job creation did not return jobId and access token');
  }

  const job = await waitForScanJob(created.jobId, created.jobAccessToken);
  const result = job.result || {};
  const root = result.root;
  const rootChildren = root?.children?.length || 0;
  const totalNodes = countTree(root);

  if (rootChildren < MIN_ROOT_CHILDREN || totalNodes < MIN_TOTAL_NODES) {
    throw new Error(
      `Scan job tree collapsed: rootChildren=${rootChildren}, totalNodes=${totalNodes}, url=${SCAN_URL}`
    );
  }

  console.log(`[scan-job-tree] Passed. rootChildren=${rootChildren}, totalNodes=${totalNodes}, url=${SCAN_URL}`);
}

async function main() {
  let child = null;
  let tempDir = null;
  if (!process.env.API_BASE) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-scan-job-tree-'));
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
      child.kill('SIGTERM');
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`[scan-job-tree] Failed: ${error.message}`);
  process.exit(1);
});
