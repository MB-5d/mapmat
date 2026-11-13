/* eslint-disable no-console */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createBrowserbaseClient } = require("../utils/scanAuthBrowserbase");
const PUBLIC_TEST_URL = "https://demo.playwright.dev/todomvc/";

function pilotError(code, message) {
  return Object.assign(new Error(message), { code });
}

function createPilotClient({ targetUrl = PUBLIC_TEST_URL, ...options }) {
  const client = createBrowserbaseClient(options);
  return { release: client.release, create: () => client.create(targetUrl) };
}

async function withPilotSession(client, work) {
  const session = await client.create();
  try { return await work(session); } finally { await client.release(session.id); }
}

async function checkContracts() {
  const id = randomUUID();
  const projectId = randomUUID();
  const apiKey = 'contract-test-key-not-a-real-credential';
  const calls = [];
  const responses = [
    { id, connectUrl: 'wss://connect.browserbase.com?apiKey=contract-test' },
    { id, status: 'COMPLETED' },
    { id, status: 'COMPLETED' },
  ];
  const client = createPilotClient({ apiKey, projectId, fetchImpl: async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => responses.shift() };
  } });
  await assert.rejects(() => withPilotSession(client, async () => { throw new Error('fixture work failed'); }), /fixture work failed/);
  assert.equal(calls.length, 3, 'failed work must request termination and verify it');
  assert.equal(calls[0].headers['X-BB-API-Key'], apiKey);
  assert.ok(!calls[0].url.includes(apiKey), 'the API key must not be put in the request URL');
  assert.equal(calls[0].redirect, 'error');
  const config = JSON.parse(calls[0].body);
  assert.equal(config.timeout, 600);
  assert.equal(config.keepAlive, true);
  assert.equal(config.browserSettings.recordSession, false);
  assert.equal(config.browserSettings.logSession, false);
  assert.equal(config.browserSettings.solveCaptchas, false);
  assert.equal(config.browserSettings.ignoreCertificateErrors, false);
  assert.deepEqual(config.browserSettings.allowedDomains, ['demo.playwright.dev']);
  assert.ok(!config.browserSettings.context, 'no reusable browser profile may be persisted');
  assert.deepEqual(JSON.parse(calls[1].body), { status: 'REQUEST_RELEASE' });
  assert.equal(calls[2].method, 'GET');
  assert.throws(() => createPilotClient({}), /not configured/);
  await assert.rejects(() => client.release('../other-session'), /Invalid temporary browser identifier/);
  for (const fetchImpl of [
    async () => { throw new Error(`transport exposed ${apiKey}`); },
    async () => ({ ok: false, status: 401, json: async () => ({ error: apiKey }) }),
    async () => ({ ok: true, json: async () => { throw new Error(apiKey); } }),
  ]) {
    const failing = createPilotClient({ apiKey, projectId, fetchImpl });
    await assert.rejects(() => failing.create(), (error) => error.code.startsWith('scan_auth_') && !error.message.includes(apiKey));
  }
  let badEndpointCalls = 0;
  const badEndpoint = createPilotClient({ apiKey, projectId, fetchImpl: async () => {
    badEndpointCalls += 1;
    return { ok: true, json: async () => badEndpointCalls === 1
      ? { id, connectUrl: 'wss://other.example.invalid' }
      : { id, status: 'COMPLETED' } };
  } });
  await assert.rejects(() => badEndpoint.create(), /unexpected connection endpoint/);
  assert.equal(badEndpointCalls, 3, 'a rejected endpoint must still release the created session');
  const incomplete = createPilotClient({ apiKey, projectId, fetchImpl: async () => ({ ok: true, json: async () => ({ id, status: 'RUNNING' }) }) });
  await assert.rejects(() => incomplete.release(id), /closure.*not confirmed/);
  console.log('[browserbase-pilot] Local contracts passed. No provider connection or authenticated capture was tested.');
}

async function checkLiveConnection() {
  const client = createPilotClient({ apiKey: process.env.BROWSERBASE_API_KEY, projectId: process.env.BROWSERBASE_PROJECT_ID });
  const { chromium } = require('playwright');
  const result = await withPilotSession(client, async (session) => {
    let browser;
    let phase = 'browser connection';
    let status = null;
    try {
      browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 15000 });
      phase = 'browser context';
      const context = browser.contexts()[0];
      if (!context) throw new Error('No browser context');
      const page = await context.newPage();
      phase = 'public page navigation';
      const response = await page.goto(PUBLIC_TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      status = response?.status();
      phase = 'HTTP response verification';
      assert.equal(status, 200);
      phase = 'public page content verification';
      assert.equal(new URL(page.url()).hostname, new URL(PUBLIC_TEST_URL).hostname);
      await page.getByRole('heading', { name: 'todos', exact: true }).waitFor({ timeout: 10000 });
      phase = 'public screenshot';
      const png = await page.screenshot({ timeout: 10000 });
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(png.byteLength > 512);
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-browserbase-public-'));
      const screenshotPath = path.join(directory, 'public-page.png');
      fs.writeFileSync(screenshotPath, png, { mode: 0o600 });
      return { connected: true, publicPageLoaded: true, pngGenerated: true, screenshotPath };
    } catch (error) {
      const networkCode = String(error.message || '').match(/net::ERR_[A-Z_]+/)?.[0];
      const diagnostic = networkCode || (Number.isInteger(status) ? `HTTP ${status}` : 'no HTTP response');
      throw pilotError('pilot_browser_failed', `The public-page check failed during ${phase} (${diagnostic}). No connection URL or provider token was logged.`);
    } finally {
      await browser?.close().catch(() => {});
    }
  });
  console.log('[browserbase-pilot]', JSON.stringify({ ...result, terminationConfirmed: true }));
  console.log('[browserbase-pilot] Login, SSO, reconnects, recording/log retention, and private screenshot capture still require separate live tests.');
}

async function readPrivatePassword() {
  process.stdout.write('[browserbase-pilot] Waiting for the approved password (input hidden).\n');
  const input = process.stdin;
  if (input.isTTY) input.setRawMode(true);
  input.resume();
  try {
    return await new Promise((resolve, reject) => {
      let password = '';
      const onData = (chunk) => {
        for (const character of chunk.toString()) {
          if (character === '\u0003') { input.off('data', onData); reject(pilotError('pilot_cancelled', 'Pilot cancelled before login.')); return; }
          if (character === '\r' || character === '\n') { input.off('data', onData); resolve(password); return; }
          if (character === '\u007f') password = password.slice(0, -1);
          else password += character;
        }
      };
      input.on('data', onData);
    });
  } finally {
    if (input.isTTY) input.setRawMode(false);
    input.pause();
  }
}

async function checkProtectedCapture() {
  const targetUrl = 'https://mattbraun.design/';
  const origin = new URL(targetUrl).origin;
  const ownerKey = 'user:approved-local-pilot';
  let password = await readPrivatePassword();
  if (!password) throw pilotError('pilot_no_password', 'No password was supplied.');
  const { createBrowserbaseScanSessionManager } = require('../utils/scanAuthBrowserbase');
  const { chromium } = require('playwright');
  const { hasSimplePasswordGate, submitSimpleScanPassword } = require('../utils/scanAuthPassword');
  const manager = createBrowserbaseScanSessionManager({
    client: createBrowserbaseClient({ apiKey: process.env.BROWSERBASE_API_KEY, projectId: process.env.BROWSERBASE_PROJECT_ID }),
    connect: (endpoint) => chromium.connectOverCDP(endpoint, { timeout: 15000 }),
    // This approved fixed-site pilot is not an arbitrary-site network isolation policy.
    assertSafeUrl: async (url) => {
      if (new URL(url).origin !== origin) throw new Error('Pilot scope mismatch');
      return url;
    },
    installNetworkGuard: async (context) => context.route('**/*', async (route) => {
      const request = route.request();
      if ((request.isNavigationRequest() || request.method() !== 'GET') && new URL(request.url()).origin !== origin) return route.abort();
      return route.continue();
    }),
  });
  const protectedUrls = [];
  const captures = [];
  let phase = 'connection';
  try {
    const session = await manager.create({ ownerKey, targetUrl });
    const run = (nextPhase, work) => manager.runPhase({ ...session, ownerKey, targetUrl, phase: nextPhase }, work);
    phase = 'discovery and login';
    await run('login', async ({ context }) => {
      const page = await context.newPage();
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const candidates = await page.locator('a[href]').evaluateAll((links) => [...new Set(links.map((link) => {
        const url = new URL(link.href);
        return url.origin === location.origin && !url.search && url.pathname !== '/' ? url.origin + url.pathname : null;
      }).filter(Boolean))].slice(0, 30));
      for (const url of candidates) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (await hasSimplePasswordGate(page, origin)) protectedUrls.push(url);
      }
      assert.ok(protectedUrls.length >= 2);
      for (const url of protectedUrls) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (await hasSimplePasswordGate(page, origin)) await submitSimpleScanPassword(page, password, origin);
        assert.equal(await hasSimplePasswordGate(page, origin), false);
      }
      password = '';
      await page.close();
    });
    phase = 'cross-page access';
    await run('scan', async ({ context }) => {
      const page = await context.newPage();
      for (const url of protectedUrls) {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        assert.equal(response.status(), 200);
        assert.equal(new URL(page.url()).origin, origin);
        assert.equal(await hasSimplePasswordGate(page, origin), false);
        assert.ok((await page.locator('body').innerText()).length > 100);
      }
      await page.close();
    });
    phase = 'reconnection';
    await manager.reconnect({ ...session, ownerKey });
    phase = 'protected capture';
    await run('capture', async ({ context }) => {
      const page = await context.newPage();
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-browserbase-protected-'));
      fs.chmodSync(directory, 0o700);
      for (const [index, url] of protectedUrls.slice(0, 2).entries()) {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        assert.equal(response.status(), 200);
        assert.equal(new URL(page.url()).origin, origin);
        assert.equal(await hasSimplePasswordGate(page, origin), false);
        await page.locator('h1').first().waitFor({ timeout: 10000 });
        const png = await page.screenshot({ timeout: 15000, fullPage: index === 0 });
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.ok(png.byteLength > 10000);
        const screenshotPath = path.join(directory, `protected-${index + 1}.png`);
        fs.writeFileSync(screenshotPath, png, { mode: 0o600 });
        captures.push({ screenshotPath, fullPage: index === 0 });
      }
      await page.close();
    });
    phase = 'completion and cleanup';
    await manager.complete({ ...session, ownerKey });
    console.log('[browserbase-pilot]', JSON.stringify({ protectedPagesDiscovered: protectedUrls.length,
      protectedPagesVerified: protectedUrls.length, reconnectVerified: true, captures, terminationConfirmed: true }));
  } catch {
    throw pilotError('pilot_protected_failed', `Protected-page pilot failed during ${phase}; ${protectedUrls.length} protected pages discovered. Credentials and page content were not logged.`);
  } finally {
    password = '';
    await manager.dispose();
  }
}

if (require.main === module) {
  const run = process.argv.includes('--protected') ? checkProtectedCapture : process.argv.includes('--live') ? checkLiveConnection : checkContracts;
  run().catch((error) => {
    console.error('[browserbase-pilot]', error.code?.startsWith('pilot_') ? error.message : 'The local contract check failed.');
    process.exitCode = 1;
  });
}

module.exports = { createPilotClient, withPilotSession, checkContracts };
