const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { helperConfig } = require('./config.cjs');
const { installPilot } = require('./pilot.cjs');
const { buildExtension } = require('./build-extension.cjs');

(async () => {
  const origin = 'https://vellic-isolated-example.up.railway.app';
  const env = { SCAN_AUTH_BROWSER_HELPER: 'true', SCAN_AUTH_HELPER_MODE: 'hosted', NODE_ENV: 'production',
    SCAN_AUTH_HELPER_EXTENSION_ID: 'a'.repeat(32), SCAN_AUTH_HELPER_PUBLIC_ORIGIN: origin,
    SCAN_AUTH_HELPER_PROJECT_ID: '11111111-1111-1111-1111-111111111111', RAILWAY_PROJECT_ID: '11111111-1111-1111-1111-111111111111',
    SCAN_AUTH_HELPER_ENVIRONMENT_ID: '22222222-2222-2222-2222-222222222222', RAILWAY_ENVIRONMENT_ID: '22222222-2222-2222-2222-222222222222',
    RAILWAY_ENVIRONMENT_NAME: 'auth-helper-pilot', RAILWAY_PUBLIC_DOMAIN: new URL(origin).host,
    SCAN_AUTH_HELPER_PILOT_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
    TEST_AUTH_ENABLED: 'false', ALLOW_PRIVATE_NETWORKS: 'false', SCAN_AUTH_LOCAL_PROTOTYPE: 'false',
    SCAN_AUTH_HELPER_ALLOW_FIXTURE: 'false', SCAN_AUTH_FEATURE_ENABLED: 'true', ALLOW_VERCEL_PREVIEWS: 'false',
    FRONTEND_URL: origin + ',chrome-extension://' + 'a'.repeat(32), SCAN_AUTH_HELPER_OWNER_EMAIL: 'pilot@example.invalid' };
  const config = helperConfig(env);
  for (const change of [
    { RAILWAY_PROJECT_ID: '78076aad-fdc1-4248-9730-4f265a7f2129', SCAN_AUTH_HELPER_PROJECT_ID: '78076aad-fdc1-4248-9730-4f265a7f2129' },
    { RAILWAY_ENVIRONMENT_NAME: 'staging' }, { RAILWAY_ENVIRONMENT_NAME: 'production' },
    { RAILWAY_ENVIRONMENT_ID: 'wrong' }, { SCAN_AUTH_HELPER_PUBLIC_ORIGIN: 'http://localhost' },
    { SCAN_AUTH_HELPER_PUBLIC_ORIGIN: origin + '/path' }, { TEST_AUTH_ENABLED: 'true' },
    { SCAN_AUTH_LOCAL_PROTOTYPE: 'true' }, { ALLOW_PRIVATE_NETWORKS: 'true' },
    { SCAN_AUTH_HELPER_ALLOW_FIXTURE: 'true' }, { FRONTEND_URL: 'https://evil.example' },
    { ALLOW_VERCEL_PREVIEWS: 'true' }, { SCAN_AUTH_HELPER_PILOT_EXPIRES_AT: 'bad' },
    { SCAN_AUTH_HELPER_PILOT_EXPIRES_AT: new Date(Date.now() + 72 * 3600000).toISOString() },
  ]) assert.throws(() => helperConfig({ ...env, ...change }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-hosted-check-'));
  const app = express();
  let clock = Date.now();
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>Isolated pilot</h1>');
  installPilot({ app, express, config, now: () => clock, buildDirectory: dir,
    authenticate: async req => req.headers.authorization === 'owner' ? { email: env.SCAN_AUTH_HELPER_OWNER_EMAIL }
      : req.headers.authorization === 'other' ? { email: 'another@example.invalid' } : null });
  app.use((_req, res) => res.json({ allowed: true }));
  const server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve(s)); s.on('error', reject); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (url, method = 'GET', headers = {}) => fetch(base + url, { method, headers });
  try {
    assert.equal((await request('/app')).status, 200);
    assert.equal((await request('/app/maps/synthetic-map')).status, 200);
    assert.equal((await request('/scan-jobs', 'POST')).status, 401);
    assert.equal((await request('/auth/signup', 'POST')).status, 401);
    assert.equal((await request('/auth/login', 'POST')).status, 200);
    assert.equal((await request('/scan-jobs', 'POST', { authorization: 'other' })).status, 403);
    assert.equal((await request('/scan-jobs', 'POST', { authorization: 'owner' })).status, 200);
    assert.equal((await request('/api/private-scan-captures/example')).status, 401);
    assert.equal((await request('/api/billing/checkout', 'POST', { authorization: 'owner' })).status, 403);
    assert.equal((await request('/auth/signup', 'POST', { authorization: 'owner' })).status, 403);
    assert.equal((await request('/scan-auth/helper/describe', 'POST', { origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/scan-auth/helper/describe', 'POST', { origin: 'chrome-extension://' + config.extensionId })).status, 200);
    clock = config.expiresAt;
    assert.equal((await request('/scan-jobs', 'POST', { authorization: 'owner' })).status, 410);
    const output = path.join(dir, 'extension');
    const manifest = buildExtension(origin, output);
    assert.deepEqual(manifest.host_permissions, [origin + '/*']);
    assert.deepEqual(manifest.optional_host_permissions, ['https://*/*']);
    assert(manifest.key && manifest.key !== JSON.parse(fs.readFileSync(path.join(__dirname, 'extension/manifest.json'))).key,
      'Cloud build must have a different public key from the installed local extension');
    assert(!JSON.stringify(manifest).includes('127.0.0.1'));
    assert.throws(() => buildExtension('https://attacker.example', path.join(dir, 'bad')));
    console.log('Passed: hosted isolation, exact origin/project/extension configuration, private pilot access, account/billing lockdown, deadline and cloud-only helper packaging.');
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
