const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-hosted-runtime-'));
  const secret = () => crypto.randomBytes(32).toString('hex');
  const password = secret(), origin = 'https://vellic-isolated-example.up.railway.app';
  const repo = path.resolve(__dirname, '../..');
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', PORT: '4358',
    SCAN_AUTH_BROWSER_HELPER: 'true', SCAN_AUTH_HELPER_MODE: 'hosted',
    SCAN_AUTH_HELPER_EXTENSION_ID: 'a'.repeat(32), SCAN_AUTH_HELPER_PUBLIC_ORIGIN: origin,
    SCAN_AUTH_HELPER_PROJECT_ID: '11111111-1111-1111-1111-111111111111', RAILWAY_PROJECT_ID: '11111111-1111-1111-1111-111111111111',
    SCAN_AUTH_HELPER_ENVIRONMENT_ID: '22222222-2222-2222-2222-222222222222', RAILWAY_ENVIRONMENT_ID: '22222222-2222-2222-2222-222222222222',
    RAILWAY_ENVIRONMENT_NAME: 'auth-helper-pilot', RAILWAY_PUBLIC_DOMAIN: new URL(origin).host,
    SCAN_AUTH_HELPER_PILOT_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
    TEST_AUTH_ENABLED: 'false', ALLOW_PRIVATE_NETWORKS: 'false', SCAN_AUTH_LOCAL_PROTOTYPE: 'false',
    SCAN_AUTH_HELPER_ALLOW_FIXTURE: 'false', SCAN_AUTH_FEATURE_ENABLED: 'true', ALLOW_VERCEL_PREVIEWS: 'false',
    FRONTEND_URL: origin + ',chrome-extension://' + 'a'.repeat(32), SCAN_AUTH_HELPER_OWNER_EMAIL: 'pilot@example.invalid',
    SCAN_AUTH_HELPER_OWNER_PASSWORD: password, JWT_SECRET: secret(), PRIVATE_SCAN_CAPTURE_KEY: secret(),
  };
  const backend = spawn(process.execPath, ['-e', 'require("./prototype/browser-helper/run-hosted.cjs").main({dataDirectory:' + JSON.stringify(dir) + '}).catch(e=>{console.error(e.message);process.exitCode=1;})'], { cwd: repo, env, stdio: ['ignore','pipe','pipe'] });
  let logs = '';
  backend.stdout.on('data', chunk => { logs = (logs + chunk).slice(-16000); });
  backend.stderr.on('data', chunk => { logs = (logs + chunk).slice(-16000); });
  const base = 'http://127.0.0.1:4358';
  let cookie = '';
  const request = (url, method = 'GET', body, withCookie = true) => fetch(base + url, { method,
    headers: { 'Content-Type': 'application/json', ...(withCookie && cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (backend.exitCode !== null) throw Error('Hosted startup failed: ' + logs.slice(-1800));
      try { if ((await request('/health')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(ready, 'Hosted startup timed out');
    assert.equal((await request('/app')).status, 200);
    assert.equal((await request('/app/maps/synthetic-map')).status, 200);
    assert.equal((await request('/scan-jobs', 'POST', {})).status, 401);
    assert.equal((await request('/auth/signup', 'POST', { email: 'new@example.invalid', password })).status, 401);
    assert.equal((await request('/auth/login', 'POST', { email: 'new@example.invalid', password })).status, 401);
    const login = await request('/auth/login', 'POST', { email: env.SCAN_AUTH_HELPER_OWNER_EMAIL, password });
    assert.equal(login.status, 200);
    const account = await login.json();
    assert(!account.token, 'Public hosted login must not enable test bearer tokens');
    const setCookie = login.headers.getSetCookie();
    assert(setCookie.some(value => /HttpOnly/i.test(value) && /Secure/i.test(value)));
    cookie = setCookie.map(value => value.split(';')[0]).join('; ');
    assert.equal((await request('/auth/me')).status, 200);
    assert.equal((await request('/api/billing/config')).status, 200);
    assert.equal((await request('/api/billing/checkout/sessions', 'POST', {})).status, 403);
    assert.equal((await request('/auth/google/start')).status, 403);
    const helper = await request('/scan-auth/sessions', 'POST', { url: 'https://example.com/private', browserHelper: true });
    assert.equal(helper.status, 200, (await helper.clone().json()).error);
    const session = await helper.json();
    assert(session.helperPairingCode);
    const description = await fetch(base + '/scan-auth/helper/describe', { method: 'POST',
      headers: { Origin: 'chrome-extension://' + 'a'.repeat(32), Authorization: 'Bearer ' + session.helperPairingCode, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(description.status, 200);
    assert.equal((await description.json()).helperOrigin, origin);
    assert.equal((await request('/scan-auth/sessions/' + session.sessionId, 'DELETE')).status, 200);
    assert.equal((await request('/scan-auth/sessions', 'POST', { url: 'http://127.0.0.1/private', browserHelper: true })).status, 400);
    assert.equal((await request('/api/private-scan-captures/example', 'GET', undefined, false)).status, 401);
    console.log('Passed: real hosted startup, seeded account, Secure/HttpOnly login cookie, no account auto-creation, signed-out denial, helper pairing/cancel, private-network rejection, billing lockdown and frontend serving. Local runtime simulation only; no cloud scan claimed.');
  } finally {
    if (backend.exitCode === null && backend.signalCode === null) {
      const exited = new Promise(resolve => backend.once('exit', resolve));
      backend.kill('SIGTERM'); const timer = setTimeout(() => backend.kill('SIGKILL'), 6000);
      await exited; clearTimeout(timer);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
