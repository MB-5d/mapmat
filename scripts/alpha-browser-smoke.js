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

function findNodeById(node, nodeId) {
  if (!node) return null;
  if (node.id === nodeId) return node;
  for (const child of node.children || []) {
    const match = findNodeById(child, nodeId);
    if (match) return match;
  }
  return null;
}

async function getMap(owner, mapId) {
  const result = await requestJson(`${API_BASE}/api/maps/${mapId}`, {
    token: owner.token,
  });
  assert.ok(result?.map, 'get map should return a map');
  return result.map;
}

async function waitForNodeAssets(owner, mapId, nodeId, { requireThumbnail = false, requireFull = false } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120000) {
    const map = await getMap(owner, mapId);
    const node = findNodeById(map.root, nodeId);
    assert.ok(node, `node ${nodeId} should exist on map ${mapId}`);
    const hasThumbnail = !!node.thumbnailUrl;
    const hasFull = !!node.fullScreenshotUrl;
    if ((!requireThumbnail || hasThumbnail) && (!requireFull || hasFull)) {
      return node;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error(`Timed out waiting for screenshot assets on node ${nodeId}`);
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
  return createInvite(owner, mapId, inviteeEmail, 'viewer');
}

async function createInvite(owner, mapId, inviteeEmail, role) {
  const result = await requestJson(`${API_BASE}/api/maps/${mapId}/invites`, {
    method: 'POST',
    token: owner.token,
    body: {
      email: inviteeEmail,
      role,
    },
  });
  assert.ok(result?.invite?.id, 'create invite should return an invite id');
  return result.invite;
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

async function editNodeTitle(page, nodeId, nextTitle) {
  const node = page.locator(`[data-node-id="${nodeId}"]`).first();
  await node.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT_MS });
  await node.hover();
  await node.getByTitle('Edit').click();
  await waitForText(page, 'Edit Page', { exact: true });
  const titleInput = page.getByPlaceholder('Enter page title');
  await titleInput.fill(nextTitle);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.getByText('Edit Page', { exact: true }).waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT_MS });
}

async function captureSelectedScreenshotAssets(page, nodeId) {
  const node = page.locator(`[data-node-id="${nodeId}"]`).first();
  await node.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT_MS });
  await node.click();

  await page.getByTitle('Images').click();
  await page.getByRole('button', { name: 'Get thumbnails (Selected)' }).click();

  await page.getByTitle('Images').click();
  await page.getByRole('button', { name: 'Get full screenshots (Selected)' }).click();
}

async function waitForAutosavedVersion(page) {
  await page.getByTitle('Version History (H)').click();
  await waitForText(page, 'Map Timeline', { exact: true });
  await waitForText(page, 'Autosaved', { exact: true, timeout: 30000 });
}

async function openNodeComments(page, nodeId, actionLabel = 'Comments') {
  const node = page.locator(`[data-node-id="${nodeId}"]`).first();
  await node.waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT_MS });
  await node.hover();
  const actionButton = node.getByTitle(actionLabel).first();
  if (await actionButton.count()) {
    try {
      await actionButton.click({ timeout: 3000 });
      await waitForText(page, 'Comments on', { exact: false });
      return;
    } catch {
      // Fall back to the badge path used by read-only roles.
    }
  }
  await node.locator('.comment-badge').first().click();
  await waitForText(page, 'Comments on', { exact: false });
}

async function runOwnerRouteChecks(browser, owner, map, nodeId, commentText) {
  const context = await createContext(browser, owner.token);
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  await page.goto(`${APP_BASE}/app/maps/${encodeURIComponent(map.id)}`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForText(page, map.name, { exact: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText(page, map.name, { exact: true });

  await captureSelectedScreenshotAssets(page, nodeId);
  await waitForNodeAssets(owner, map.id, nodeId, { requireThumbnail: true, requireFull: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText(page, map.name, { exact: true });
  await page.locator(`[data-node-id="${nodeId}"] img.thumb-img`).first().waitFor({
    state: 'visible',
    timeout: DEFAULT_TIMEOUT_MS,
  });

  await page.getByTitle('Comments (C)').click();
  await waitForText(page, 'All Comments', { exact: true });
  await waitForText(page, commentText, { exact: false });

  const editedTitle = `About updated ${Date.now().toString(36)}`;
  await editNodeTitle(page, nodeId, editedTitle);
  await waitForAutosavedVersion(page);
  await waitForText(page, 'Map Timeline', { exact: true });
  await waitForText(page, 'Initial', { exact: true });
  await page.getByRole('tab', { name: 'Activity' }).click();
  await waitForVisible(page, '.activity-history-item');
  await waitForText(page, 'Added comment', { exact: true });

  await context.close();
}

async function acceptInviteAndOpenMap(page, account, map) {
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
}

async function runViewerRouteChecks(browser, viewer, map, nodeId, commentText) {
  const context = await createContext(browser, viewer.token);
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  await acceptInviteAndOpenMap(page, viewer, map);

  await page.getByTitle('Comments (C)').click();
  await waitForText(page, 'All Comments', { exact: true });
  await waitForText(page, commentText, { exact: false });
  await openNodeComments(page, nodeId, 'View comments');
  await waitForText(page, commentText, { exact: false });
  await page.getByPlaceholder(/Add a comment/i).waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT_MS });

  await context.close();
}

async function runCommenterRouteChecks(browser, commenter, map, nodeId, commentText) {
  const context = await createContext(browser, commenter.token);
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  await acceptInviteAndOpenMap(page, commenter, map);
  await openNodeComments(page, nodeId, 'Comments');
  await waitForText(page, commentText, { exact: false });

  const replyText = `Commenter smoke ${Date.now().toString(36)}`;
  const input = page.getByPlaceholder(/Add a comment/i);
  await input.fill(replyText);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Comments on', { exact: false }).waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT_MS });

  await openNodeComments(page, nodeId, 'Comments');
  await waitForText(page, replyText, { exact: false });

  await page.getByTitle('Mark as complete').last().click();
  await waitForText(page, 'Completed by', { exact: false });

  await context.close();
  return replyText;
}

async function runOwnerCommentVerification(browser, owner, map, nodeId, replyText) {
  const context = await createContext(browser, owner.token);
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  await page.goto(`${APP_BASE}/app/maps/${encodeURIComponent(map.id)}`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForText(page, map.name, { exact: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForText(page, map.name, { exact: true });

  await openNodeComments(page, nodeId, 'Comments');
  await waitForText(page, replyText, { exact: false });
  await page.getByTitle('Delete').last().click();
  await waitForText(page, replyText, { exact: false }).catch(() => {});
  await page.getByText(replyText, { exact: false }).waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT_MS });

  await context.close();
}

async function run() {
  const owner = await signup('owner');
  const viewer = await signup('viewer');
  const commenter = await signup('commenter');
  let browser;

  try {
    const mapName = `Alpha Browser Smoke ${Date.now().toString(36)}`;
    const commentText = `Smoke comment ${Date.now().toString(36)}`;
    const { map, rootId, childId } = await saveMap(owner, mapName);

    const versions = await getVersions(owner, map.id);
    assert.ok(Array.isArray(versions?.versions) && versions.versions.length > 0, 'versions API should return the initial version');

    const activity = await getActivity(owner, map.id);
    assert.ok(Array.isArray(activity?.activity) && activity.activity.length > 0, 'activity API should return initial events');

    await createComment(owner, map.id, rootId, commentText);
    await createViewerInvite(owner, map.id, viewer.email);
    await createInvite(owner, map.id, commenter.email, 'commenter');

    browser = await chromium.launch({ headless: true });

    await runOwnerRouteChecks(browser, owner, map, childId, commentText);
    console.log('[alpha-browser-smoke] owner direct route + screenshots + timeline + comments ok');

    await runViewerRouteChecks(browser, viewer, map, rootId, commentText);
    console.log('[alpha-browser-smoke] viewer invite route + read-only comments ok');

    const commenterReply = await runCommenterRouteChecks(browser, commenter, map, rootId, commentText);
    console.log('[alpha-browser-smoke] commenter invite route + comment actions ok');

    await runOwnerCommentVerification(browser, owner, map, rootId, commenterReply);
    console.log('[alpha-browser-smoke] owner comment verification ok');

    console.log('[alpha-browser-smoke] passed');
  } finally {
    if (browser) await browser.close();
    if (CLEANUP) {
      await deleteAccount(commenter);
      await deleteAccount(viewer);
      await deleteAccount(owner);
    }
  }
}

run().catch((error) => {
  console.error(`[alpha-browser-smoke] failed: ${error.message}`);
  process.exit(1);
});
