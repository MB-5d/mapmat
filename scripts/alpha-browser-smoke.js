#!/usr/bin/env node

/* eslint-disable no-console */

const assert = require('assert');
const { chromium } = require('playwright');

const API_BASE = String(process.env.API_BASE || 'http://localhost:4002').replace(/\/$/, '');
const APP_BASE = String(process.env.APP_BASE || 'http://localhost:3001').replace(/\/$/, '');
const CLEANUP = parseEnvBool(process.env.ALPHA_BROWSER_SMOKE_CLEANUP, true);
const DEFAULT_TIMEOUT_MS = clampInt(process.env.ALPHA_BROWSER_SMOKE_TIMEOUT_MS, 45000, {
  min: 5000,
  max: 120000,
});

function clampInt(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseEnvBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function randomId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmail(label) {
  return `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function requestJson(url, { method = 'GET', token = '', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const detail = data?.error || data?.raw || `HTTP ${response.status}`;
    throw new Error(`${method} ${url} failed: ${detail}`);
  }

  return data;
}

async function signup(label) {
  const email = createEmail(label);
  const password = 'Admin123!';
  const name = `${label} Browser Smoke`;
  const result = await requestJson(`${API_BASE}/auth/signup`, {
    method: 'POST',
    body: { email, password, name },
  });
  assert.ok(result?.token, `${label} signup should return an auth token`);
  assert.ok(result?.user?.id, `${label} signup should return a user id`);
  return {
    email,
    password,
    name,
    token: result.token,
    user: result.user,
  };
}

async function deleteAccount(session) {
  if (!session?.token) return;
  try {
    await requestJson(`${API_BASE}/auth/me`, {
      method: 'DELETE',
      token: session.token,
      body: { password: session.password },
    });
  } catch (error) {
    console.warn(`[alpha-browser-smoke] cleanup failed for ${session.email}: ${error.message}`);
  }
}

async function saveMap(owner, mapName) {
  const rootId = randomId('root');
  const childId = randomId('child');
  const payload = {
    name: mapName,
    url: 'https://example.com',
    root: {
      id: rootId,
      url: 'https://example.com',
      title: 'Home',
      children: [
        {
          id: childId,
          url: 'https://example.com/about',
          title: 'About',
          children: [],
        },
      ],
    },
    orphans: [],
    connections: [],
    colors: ['#635bff', '#22c55e', '#0ea5e9'],
    connectionColors: ['#94a3b8', '#64748b', '#334155'],
  };

  const result = await requestJson(`${API_BASE}/api/maps`, {
    method: 'POST',
    token: owner.token,
    body: payload,
  });

  assert.ok(result?.map?.id, 'save map should return a map id');
  assert.ok(result?.initialVersion?.id, 'save map should return the initial version');
  assert.strictEqual(result.initialVersion.name, 'Initial');

  return {
    map: result.map,
    rootId,
    childId,
  };
}

async function createComment(owner, mapId, nodeId, text) {
  const result = await requestJson(`${API_BASE}/api/maps/${mapId}/comments`, {
    method: 'POST',
    token: owner.token,
    body: {
      node_id: nodeId,
      text,
    },
  });
  assert.ok(result?.comment?.id, 'create comment should return a comment id');
}

async function createViewerInvite(owner, mapId, inviteeEmail) {
  const result = await requestJson(`${API_BASE}/api/maps/${mapId}/invites`, {
    method: 'POST',
    token: owner.token,
    body: {
      email: inviteeEmail,
      role: 'viewer',
    },
  });
  assert.ok(result?.invite?.id, 'create invite should return an invite id');
}

async function getVersions(owner, mapId) {
  return requestJson(`${API_BASE}/api/maps/${mapId}/versions`, {
    token: owner.token,
  });
}

async function getActivity(owner, mapId) {
  return requestJson(`${API_BASE}/api/maps/${mapId}/activity?limit=25&offset=0`, {
    token: owner.token,
  });
}

async function createContext(browser, token) {
  const context = await browser.newContext();
  await context.addInitScript((authToken) => {
    window.localStorage.setItem('mapmat_auth_token', authToken);
  }, token);
  return context;
}

async function waitForVisible(page, selector, options = {}) {
  await page.locator(selector).first().waitFor({
    state: 'visible',
    timeout: options.timeout || DEFAULT_TIMEOUT_MS,
  });
}

async function waitForText(page, text, options = {}) {
  await page.getByText(text, { exact: options.exact ?? false }).first().waitFor({
    state: 'visible',
    timeout: options.timeout || DEFAULT_TIMEOUT_MS,
  });
}

async function runOwnerRouteChecks(browser, owner, map, commentText) {
  const context = await createContext(browser, owner.token);
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  await page.goto(`${APP_BASE}/app/maps/${encodeURIComponent(map.id)}`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForText(page, map.name, { exact: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText(page, map.name, { exact: true });

  await page.getByTitle('Comments (C)').click();
  await waitForText(page, 'All Comments', { exact: true });
  await waitForText(page, commentText, { exact: false });

  await page.getByTitle('Version History (H)').click();
  await waitForText(page, 'Map Timeline', { exact: true });
  await waitForText(page, 'Initial', { exact: true });
  await page.getByRole('tab', { name: 'Activity' }).click();
  await waitForVisible(page, '.activity-history-item');

  await context.close();
}

async function runInviteRouteChecks(browser, viewer, map) {
  const context = await createContext(browser, viewer.token);
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  await page.goto(`${APP_BASE}/app/invites`, { waitUntil: 'domcontentloaded' });
  await waitForText(page, 'Pending Invites', { exact: true });
  await waitForText(page, map.name, { exact: true });

  await page.getByRole('button', { name: 'Accept' }).click();
  await waitForText(page, 'No pending invites right now.', { exact: true });

  await page.goto(`${APP_BASE}/app/maps/${encodeURIComponent(map.id)}`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForText(page, map.name, { exact: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText(page, map.name, { exact: true });

  await page.getByTitle('Comments (C)').click();
  await waitForText(page, 'All Comments', { exact: true });

  await context.close();
}

async function run() {
  const owner = await signup('owner');
  const viewer = await signup('viewer');
  let browser;

  try {
    const mapName = `Alpha Browser Smoke ${Date.now().toString(36)}`;
    const commentText = `Smoke comment ${Date.now().toString(36)}`;
    const { map, rootId } = await saveMap(owner, mapName);

    const versions = await getVersions(owner, map.id);
    assert.ok(Array.isArray(versions?.versions) && versions.versions.length > 0, 'versions API should return the initial version');

    const activity = await getActivity(owner, map.id);
    assert.ok(Array.isArray(activity?.activity) && activity.activity.length > 0, 'activity API should return initial events');

    await createComment(owner, map.id, rootId, commentText);
    await createViewerInvite(owner, map.id, viewer.email);

    browser = await chromium.launch({ headless: true });

    await runOwnerRouteChecks(browser, owner, map, commentText);
    console.log('[alpha-browser-smoke] owner direct route + timeline + comments ok');

    await runInviteRouteChecks(browser, viewer, map);
    console.log('[alpha-browser-smoke] invite route + shared map reopen ok');

    console.log('[alpha-browser-smoke] passed');
  } finally {
    if (browser) await browser.close();
    if (CLEANUP) {
      await deleteAccount(viewer);
      await deleteAccount(owner);
    }
  }
}

run().catch((error) => {
  console.error(`[alpha-browser-smoke] failed: ${error.message}`);
  process.exit(1);
});
