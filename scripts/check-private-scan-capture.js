/* eslint-disable no-console */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createPrivateScanCaptureStore, createPrivateScanCaptureHandler, isPrivateScanCaptureKey } = require('../utils/privateScanCapture');

async function main() {
  const objects = new Map();
  let time = 1000;
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  const options = {
    encryptionKey,
    saveObject: async (object) => { objects.set(object.key, object); return `/screenshots/${object.key}`; },
    readObject: async (key) => objects.get(key) || null,
    now: () => time,
  };
  const store = createPrivateScanCaptureStore(options);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQp8AAAAASUVORK5CYII=', 'base64');
  const ownerKey = 'user:owner';
  const asset = await store.save({ ownerKey, buffer: png, retentionMs: 60000 });
  const other = await store.save({ ownerKey, buffer: png, retentionMs: 60000 });
  assert.notEqual(asset.key, other.key, 'same-site captures never share cache entries');
  assert.ok(asset.url.startsWith('/api/private-scan-captures/'));
  const ciphertext = objects.get(asset.key).buffer;
  assert.equal(ciphertext.includes(png), false, 'storage must never contain the plaintext screenshot');
  assert.equal(objects.get(asset.key).contentType, 'application/octet-stream');
  assert.deepEqual((await store.read({ ownerKey, key: asset.key })).buffer, png);
  assert.equal(await store.read({ ownerKey: 'user:other', key: asset.key }), null);
  assert.equal(await store.read({ ownerKey, key: '../private_scan_bad.bin' }), null);
  assert.equal(await store.read({ ownerKey, key: 'regular.png' }), null);
  assert.throws(() => createPrivateScanCaptureStore({ ...options, encryptionKey: 'short' }), { code: 'private_capture_configuration' });
  await assert.rejects(() => store.save({ ownerKey: 'anon:owner', buffer: png }), { code: 'private_capture_owner' });
  await assert.rejects(() => store.save({ ownerKey, buffer: Buffer.from('<svg></svg>') }), { code: 'private_capture_invalid' });
  await assert.rejects(() => store.save({ ownerKey, buffer: png, retentionMs: 86400001 }), { code: 'private_capture_retention' });
  const rotated = createPrivateScanCaptureStore({ ...options, encryptionKey: crypto.randomBytes(32).toString('hex') });
  assert.equal(await rotated.read({ ownerKey, key: asset.key }), null, 'wrong encryption keys fail closed');
  ciphertext[ciphertext.length - 1] ^= 1;
  assert.equal(await store.read({ ownerKey, key: asset.key }), null, 'tampered ciphertext is not delivered');
  ciphertext[ciphertext.length - 1] ^= 1;
  time = asset.expiresAt;
  assert.equal(await store.read({ ownerKey, key: asset.key }), null, 'expiry boundary is inclusive');
  time = 1000;
  assert.equal(isPrivateScanCaptureKey(asset.key), true);
  assert.equal(isPrivateScanCaptureKey('PRIVATE_SCAN_malformed.png'), true);
  assert.equal(isPrivateScanCaptureKey('public-preview.png'), false);

  const handler = createPrivateScanCaptureHandler({ getStore: () => store, enabled: () => true });
  async function request(userId, key, customHandler = handler) {
    const res = {
      statusCode: 200, headers: {}, body: null,
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      send(body) { this.body = body; return this; },
    };
    await customHandler({ user: userId ? { id: userId } : null, params: { filename: key } }, res);
    return res;
  }
  const allowed = await request('owner', asset.key);
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(allowed.body, png);
  assert.equal(allowed.headers['cache-control'], 'private, no-store');
  assert.equal(allowed.headers['x-content-type-options'], 'nosniff');
  assert.equal(allowed.headers['content-type'], 'image/png');
  assert.equal((await request('other', asset.key)).statusCode, 404);
  assert.equal((await request(null, asset.key)).statusCode, 401);
  assert.equal((await request('owner', asset.key, createPrivateScanCaptureHandler({ getStore: () => store, enabled: () => false }))).statusCode, 503);
  assert.equal((await request('owner', asset.key, createPrivateScanCaptureHandler({
    getStore: () => createPrivateScanCaptureStore({ ...options, encryptionKey: null }), enabled: () => true,
  }))).statusCode, 503);
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(server.includes('if (!key || isPrivateScanCaptureKey(key)) return res.status(404)'), 'public route must reject private keys before reading storage');
  assert.ok(server.includes("app.get('/api/private-scan-captures/:filename', authMiddleware, requireAuth"));
  if (process.argv.includes('--http')) await checkHttpDelivery(png, encryptionKey);
  console.log('[private-scan-capture] Encryption, per-owner access, unique assets, tamper rejection, expiry, disabled/configuration states, and public-route exclusion passed.');
}

async function checkHttpDelivery(png, encryptionKey) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-private-capture-check-'));
  fs.chmodSync(directory, 0o700);
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const seedPassword = crypto.randomBytes(24).toString('hex');
  const backend = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', DB_PROVIDER: 'sqlite', DB_PATH: path.join(directory, 'fixture.db'),
      HOST: '127.0.0.1', PORT: String(port), RUN_MODE: 'web', TEST_AUTH_ENABLED: 'true', AUTH_HEADER_FALLBACK: 'true',
      TEST_AUTH_SEED_EMAIL: 'private-capture@test.vellic.local', TEST_AUTH_SEED_PASSWORD: seedPassword,
      SCAN_AUTH_FEATURE_ENABLED: 'true', PRIVATE_SCAN_CAPTURE_KEY: encryptionKey,
      SCREENSHOT_STORAGE_PROVIDER: 'local', SCREENSHOT_STORAGE_DIR: directory, EMAIL_PROVIDER: 'log' },
    stdio: 'ignore',
  });
  let exited = false;
  backend.on('exit', () => { exited = true; });
  const base = `http://127.0.0.1:${port}`;
  const request = (url, options = {}) => fetch(`${base}${url}`, { ...options, signal: AbortSignal.timeout(5000) });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (exited) throw new Error('Fixture backend exited');
      try { if ((await request('/health')).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(ready, true);
    const login = await request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'private-capture@test.vellic.local', password: seedPassword }) });
    assert.equal(login.status, 200);
    const account = await login.json();
    assert.ok(account.user?.id && account.token);
    // Persist through the real local/R2 adapter, with the local fixture directory isolated.
    process.env.SCREENSHOT_STORAGE_PROVIDER = 'local';
    process.env.SCREENSHOT_STORAGE_DIR = directory;
    const storage = require('../utils/screenshotStorage');
    const store = createPrivateScanCaptureStore({ encryptionKey, saveObject: storage.saveScreenshotObject, readObject: storage.readScreenshotObject });
    const asset = await store.save({ ownerKey: `user:${account.user.id}`, buffer: png });
    assert.equal(fs.readFileSync(path.join(directory, asset.key)).includes(png), false);
    const publicResponse = await request(`/screenshots/${asset.key}`);
    assert.equal(publicResponse.status, 404, 'real public route must not expose private objects');
    const signedOut = await request(asset.url);
    assert.equal(signedOut.status, 401);
    const allowed = await request(asset.url, { headers: { authorization: `Bearer ${account.token}` } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await allowed.arrayBuffer()), png);
    const wrongOwner = await store.save({ ownerKey: 'user:another-fixture-user', buffer: png });
    assert.equal((await request(wrongOwner.url, { headers: { authorization: `Bearer ${account.token}` } })).status, 404);
    const publicKey = 'public-fixture.png';
    await storage.saveScreenshotObject({ key: publicKey, buffer: png, contentType: 'image/png' });
    assert.equal((await request(`/screenshots/${publicKey}`)).status, 200, 'ordinary public screenshots must keep working');
    console.log('[private-scan-capture] Real backend HTTP and local-storage checks passed; owner only, anonymous denied, public route blocked, public images unchanged.');
  } finally {
    if (!exited) {
      backend.kill('SIGTERM');
      await new Promise((resolve) => backend.once('exit', resolve));
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch(() => { console.error('[private-scan-capture] A storage or access check failed.'); process.exitCode = 1; });
