/* eslint-disable no-console */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

async function readPassword() {
  process.stdout.write('[authenticated-live] Waiting for the approved site password (hidden).\n');
  const input = process.stdin;
  if (input.isTTY) input.setRawMode(true);
  input.resume();
  try {
    return await new Promise((resolve) => {
      let value = '';
      const listener = (chunk) => {
        for (const character of chunk.toString()) {
          if (character === '\r' || character === '\n') { input.off('data', listener); resolve(value); return; }
          if (character === '\u0003') { input.off('data', listener); resolve(''); return; }
          value += character;
        }
      };
      input.on('data', listener);
    });
  } finally { if (input.isTTY) input.setRawMode(false); input.pause(); }
}

async function main() {
  let password = await readPassword();
  assert.ok(password);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-playwright-auth-live-'));
  fs.chmodSync(directory, 0o700);
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const seedPassword = crypto.randomBytes(24).toString('hex');
  const backend = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port), RUN_MODE: 'web', NODE_ENV: 'test', DB_PROVIDER: 'sqlite',
    DB_PATH: path.join(directory, 'fixture.db'), SCREENSHOT_STORAGE_DIR: path.join(directory, 'captures'), SCREENSHOT_STORAGE_PROVIDER: 'local',
    TEST_AUTH_ENABLED: 'true', AUTH_HEADER_FALLBACK: 'true', TEST_AUTH_SEED_EMAIL: 'auth-live@test.vellic.local',
    TEST_AUTH_SEED_PASSWORD: seedPassword, SCAN_AUTH_FEATURE_ENABLED: 'true', PRIVATE_SCAN_CAPTURE_KEY: crypto.randomBytes(32).toString('hex'),
    EMAIL_PROVIDER: 'log',
  } });
  let exited = false;
  backend.on('exit', () => { exited = true; });
  const base = `http://127.0.0.1:${port}`;
  let phase = 'backend readiness';
  const request = async (endpoint, token, body) => {
    const response = await fetch(`${base}${endpoint}`, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(120000),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.ok, true, `HTTP ${response.status}`);
    return response.json();
  };
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (exited) throw new Error();
      try { if ((await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const account = await request('/auth/login', null, { email: 'auth-live@test.vellic.local', password: seedPassword });
    const focused = process.argv.includes('--focused');
    const url = focused ? 'https://mattbraun.design/aptiv' : 'https://mattbraun.design/';
    phase = 'protected-page precheck';
    const precheck = await request('/scan-auth/precheck', account.token, { url, options: { authenticatedPages: true } });
    assert.ok(precheck.authCount >= (focused ? 1 : 10));
    phase = 'one password entry';
    const session = await request('/scan-auth/sessions', account.token, { url, sampleUrls: precheck.sampleUrls });
    await request(`/scan-auth/sessions/${session.sessionId}/action`, account.token, { action: 'password', text: password });
    password = '';
    await request(`/scan-auth/sessions/${session.sessionId}/complete`, account.token, {});
    phase = 'scan and authenticated thumbnails';
    const job = await request('/scan-jobs', account.token, { url, maxPages: 100, options: { authenticatedPages: true },
      authSessionId: session.sessionId, authenticatedCaptureType: 'thumb' });
    let result;
    for (let attempt = 0; attempt < 900; attempt += 1) {
      const response = await request(`/scan-jobs/${job.jobId}?includeResult=true`, account.token);
      const status = response.job;
      if (attempt % 30 === 0) console.log('[authenticated-live] Job progress:', JSON.stringify({ status: status.status, phase: status.progress?.phase, scanned: status.progress?.scanned }));
      if (status.status === 'complete' || status.status === 'completed') { result = status.result; break; }
      assert.ok(!['failed', 'canceled'].includes(status.status));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(result);
    const nodes = [];
    const visit = (node) => { if (node) { nodes.push(node); (node.children || []).forEach(visit); } };
    visit(result.root); (result.orphans || []).forEach(visit);
    assert.equal(nodes.filter((node) => node.authRequired).length, 0);
    console.log('[authenticated-live] Capture counters:', JSON.stringify(result.authenticatedCaptureSummary));
    assert.ok(result.authenticatedCaptureSummary.captured >= (focused ? 1 : 10));
    assert.equal(result.authenticatedCaptureSummary.failed, 0);
    const captured = nodes.find((node) => node.url === 'https://mattbraun.design/aptiv');
    assert.ok(captured?.thumbnailUrl);
    phase = 'owner-authorized thumbnail delivery';
    const image = await fetch(`${base}${captured.thumbnailUrl}`, { headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(image.status, 200);
    const screenshotPath = path.join(directory, 'verified-private-thumbnail.jpg');
    fs.writeFileSync(screenshotPath, Buffer.from(await image.arrayBuffer()), { mode: 0o600 });
    assert.equal((await fetch(`${base}${captured.thumbnailUrl}`)).status, 401);
    assert.equal((await fetch(`${base}/scan-auth/sessions/${session.sessionId}`, { headers: { authorization: `Bearer ${account.token}` } })).status, 404);
    console.log('[authenticated-live]', JSON.stringify({ discoveredProtectedPages: precheck.authCount,
      unlockedPages: nodes.filter((node) => node.url && !node.isVirtualMissing).length, thumbnails: result.authenticatedCaptureSummary.captured,
      sessionDeleted: true, screenshotPath }));
  } catch {
    throw new Error(`The live check failed during ${phase}. Credentials and site content were not logged.`);
  } finally {
    password = '';
    if (!exited) {
      backend.kill('SIGTERM');
      const timer = setTimeout(() => backend.kill('SIGKILL'), 5000);
      await new Promise((resolve) => backend.once('exit', resolve));
      clearTimeout(timer);
    }
    // Keep private evidence locally; the isolated test DB and ciphertext are not published.
  }
}
main().catch((error) => { console.error('[authenticated-live]', error.message); process.exitCode = 1; });
