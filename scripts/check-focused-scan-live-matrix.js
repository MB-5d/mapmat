/* eslint-disable no-console */
const crypto = require('crypto');

const API_BASE = String(process.env.API_BASE || 'http://127.0.0.1:4345').replace(/\/+$/, '');
const MAX_PAGES = Math.max(1, Number(process.env.SCAN_MATRIX_MAX_PAGES || 100) || 100);
const BATCH_SIZE = Math.max(1, Math.min(5, Number(process.env.SCAN_MATRIX_BATCH_SIZE || 3) || 3));
const POLL_MS = Math.max(500, Number(process.env.SCAN_MATRIX_POLL_MS || 2000) || 2000);
const TIMEOUT_MS = Math.max(60000, Number(process.env.SCAN_MATRIX_TIMEOUT_MS || 20 * 60 * 1000) || 20 * 60 * 1000);
const RUN_LABEL = String(process.env.SCAN_MATRIX_RUN_LABEL || 'focused-live').slice(0, 40);

const URLS = [
  'https://www.nytimes.com/section/science',
  'https://www.npr.org/sections/culture',
  'https://www.apple.com/newsroom/',
  'https://www.theverge.com/ai-artificial-intelligence',
  'https://www.ey.com/en_gl/insights',
  'https://www.amazon.jobs/content/en/job-categories/software-development',
  'https://www.nytimes.com/section/science/space',
  'https://www.npr.org/sections/art-design/',
  'https://www.apple.com/newsroom/apple-stories/',
  'https://www.ey.com/en_gl/industries/private-equity',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(body.error || body.message || `${response.status} ${url}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function getAuthorizationHeader() {
  if (process.env.SCAN_MATRIX_AUTH_TOKEN) {
    return `Bearer ${process.env.SCAN_MATRIX_AUTH_TOKEN}`;
  }
  const email = process.env.SMOKE_AUTH_EMAIL;
  const password = process.env.SMOKE_AUTH_PASSWORD;
  if (!email || !password) return null;
  const login = await fetchJson(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return login.token ? `Bearer ${login.token}` : null;
}

function idempotencyKey(url) {
  const digest = crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
  return `${RUN_LABEL}:${digest}`;
}

async function createScan(url, authorization) {
  const response = await fetchJson(`${API_BASE}/scan-jobs`, {
    method: 'POST',
    headers: {
      ...(authorization ? { authorization } : {}),
      'idempotency-key': idempotencyKey(url),
    },
    body: JSON.stringify({
      url,
      maxPages: MAX_PAGES,
      options: {
        inactivePages: true,
        errorPages: true,
        duplicates: true,
        orphanPages: true,
        brokenLinks: false,
        files: false,
        crosslinks: true,
      },
    }),
  });
  return {
    url,
    jobId: response.jobId,
    accessToken: response.jobAccessToken || null,
    entitlement: response.entitlement || null,
  };
}

async function waitForScan(created, authorization) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const suffix = created.accessToken
      ? `?access_token=${encodeURIComponent(created.accessToken)}`
      : '';
    const response = await fetchJson(`${API_BASE}/scan-jobs/${created.jobId}${suffix}`, {
      headers: authorization ? { authorization } : {},
    });
    const job = response.job || {};
    if (job.status === 'complete') {
      const result = job.result || {};
      const progress = job.progress || {};
      return {
        url: created.url,
        jobId: created.jobId,
        status: 'complete',
        outcome: result.partialReason || 'complete',
        captured: Number(result.pageCountSummary?.capturedPageCount ?? progress.captured ?? progress.mapped ?? 0),
        deferred: Number(result.pageCountSummary?.deferredPageCount ?? progress.deferred ?? 0),
        processed: Number(progress.processed ?? progress.scanned ?? 0),
        discovered: Number(progress.discovered ?? 0),
        blocked: Number(progress.blocked ?? result.blockedSections?.length ?? 0),
        failed: Number(progress.failed ?? 0),
        blockedUrl: result.blockedSections?.[0]?.url || null,
        entitlement: created.entitlement,
      };
    }
    if (job.status === 'failed' || job.status === 'canceled') {
      return {
        url: created.url,
        jobId: created.jobId,
        status: job.status,
        outcome: job.error || job.status,
        captured: Number(job.progress?.captured ?? job.progress?.mapped ?? 0),
        deferred: Number(job.progress?.deferred ?? 0),
        processed: Number(job.progress?.processed ?? job.progress?.scanned ?? 0),
        discovered: Number(job.progress?.discovered ?? 0),
        blocked: Number(job.progress?.blocked ?? 0),
        failed: Number(job.progress?.failed ?? 0),
        blockedUrl: null,
        entitlement: created.entitlement,
      };
    }
    await sleep(POLL_MS);
  }
  return {
    url: created.url,
    jobId: created.jobId,
    status: 'timeout',
    outcome: `timed out after ${TIMEOUT_MS}ms`,
    captured: 0,
    deferred: 0,
    processed: 0,
    discovered: 0,
    blocked: 0,
    failed: 0,
    blockedUrl: null,
    entitlement: created.entitlement,
  };
}

async function main() {
  const authorization = await getAuthorizationHeader();
  const results = [];
  for (let index = 0; index < URLS.length; index += BATCH_SIZE) {
    const urls = URLS.slice(index, index + BATCH_SIZE);
    const created = await Promise.all(urls.map(async (url) => {
      try {
        return await createScan(url, authorization);
      } catch (error) {
        results.push({
          url,
          jobId: null,
          status: 'request_failed',
          outcome: error.message,
          captured: 0,
          deferred: 0,
          processed: 0,
          discovered: 0,
          blocked: 0,
          failed: 0,
          blockedUrl: null,
          entitlement: null,
        });
        return null;
      }
    }));
    results.push(...await Promise.all(
      created.filter(Boolean).map((job) => waitForScan(job, authorization))
    ));
  }
  const ordered = URLS.map((url) => results.find((result) => result.url === url));
  console.log(JSON.stringify({
    apiBase: API_BASE,
    authenticated: Boolean(authorization),
    maxPages: MAX_PAGES,
    batchSize: BATCH_SIZE,
    results: ordered,
  }, null, 2));
  if (ordered.some((result) => !result)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[focused-scan-live-matrix] Failed: ${error.message}`);
  process.exitCode = 1;
});
