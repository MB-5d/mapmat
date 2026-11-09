const assert = require('node:assert/strict');
const { targetUrl, validateState, isSignedOutRestricted, isHelperNavigationAllowed } = require('./policy.cjs');
const { createBrowserHelper } = require('./bridge.cjs');

(async () => {
  const { assertTarget, normalizeCookies, permissionOrigins, cookieQuery, assertBrowserContext } = await import('./extension/capture.mjs');
  assert.deepEqual(permissionOrigins('http://localhost:4399'), ['http://localhost:4399/*', 'http://localhost:80/*']);
  assert.deepEqual(permissionOrigins('https://github.com'), ['https://github.com/*']);
  assert.deepEqual(cookieQuery('http://localhost:4399/members', '0'), { url: 'http://localhost:4399/members', storeId: '0', name: 'protected_test_session' });
  assert.deepEqual(cookieQuery('https://github.com/test', '0'), { url: 'https://github.com/test', storeId: '0' });
  assert.deepEqual(cookieQuery('https://github.com/test', '1'), { url: 'https://github.com/test', storeId: '1' });
  for (const privateTab of [false, true]) for (const privateWindow of [false, true]) {
    const check = () => assertBrowserContext({ id: 1, incognito: privateTab }, { incognito: privateWindow }, true);
    if (privateTab === privateWindow) assert.doesNotThrow(check); else assert.throws(check);
  }
  assert.throws(() => assertBrowserContext({ id: 1, incognito: true }, { incognito: true }, false));
  assert.throws(() => assertBrowserContext(null, { incognito: false }, true));
  const origin = 'https://private.example.com';
  const cookie = { name: 'session', value: 'synthetic', domain: 'private.example.com', path: '/', httpOnly: true, secure: true, sameSite: 'Lax', expires: -1 };
  const state = { cookies: [cookie], origins: [] };
  assert.equal(isHelperNavigationAllowed(origin + '/private/child', origin + '/private'), true);
  for (const url of [origin + '/', origin + '/private-other', origin + '/private/../settings', 'https://other.example.com/private']) {
    assert.equal(isHelperNavigationAllowed(url, origin + '/private'), false);
  }
  assert.equal(isSignedOutRestricted(401, { isAuthStatus: true }), true);
  assert.equal(isSignedOutRestricted(404, { isAuthStatus: false }), true);
  for (const status of [200, 403, 429, 500]) assert.equal(isSignedOutRestricted(status, { isAuthStatus: false }), false);
  assert.equal(targetUrl(origin).origin, origin);
  for (const url of ['https://accounts.google.com/', 'http://example.com', 'https://user:pass@example.com', 'https://login.microsoftonline.com']) {
    assert.throws(() => targetUrl(url));
  }
  assert.throws(() => assertTarget('https://accounts.google.com', 'https://accounts.google.com'));
  assert.throws(() => assertTarget('https://evil.example.com', origin));
  assert.deepEqual(validateState(state, origin), state);
  for (const invalid of [
    { cookies: [{ ...cookie, domain: '.example.com' }], origins: [] },
    { cookies: [{ ...cookie, domain: 'google.com' }], origins: [] },
    { cookies: [{ ...cookie, partitionKey: 'https://example.com' }], origins: [] },
    { cookies: [{ ...cookie, expires: 1 }], origins: [] },
    { cookies: [], origins: [{ origin: 'https://evil.example.com', localStorage: [] }] },
    { cookies: [], origins: [{ origin, localStorage: [], indexedDB: [] }] },
    { cookies: [], origins: [] },
  ]) assert.throws(() => validateState(invalid, origin));
  const normalized = normalizeCookies([
    { ...cookie, domain: '.example.com', session: true, sameSite: 'lax', hostOnly: false },
    { ...cookie, domain: '.google.com', session: true, sameSite: 'lax', hostOnly: false },
    { ...cookie, partitionKey: {}, session: true },
  ], origin);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].domain, 'private.example.com');

  const env = { ...process.env };
  try {
    process.env.SCAN_AUTH_BROWSER_HELPER = 'false';
    assert.equal(createBrowserHelper({}), null);
    process.env.SCAN_AUTH_BROWSER_HELPER = 'true'; process.env.NODE_ENV = 'production';
    assert.throws(() => createBrowserHelper({}));
    Object.assign(process.env, { NODE_ENV: 'test', HOST: '127.0.0.1', RAILWAY_ENVIRONMENT_ID: '', RAILWAY_PUBLIC_DOMAIN: '', VERCEL: '', SCAN_AUTH_HELPER_EXTENSION_ID: 'a'.repeat(32) });
    let clock = 1000, closed = 0, completeContext;
    const sessions = new Map(), routes = new Map();
    const helper = createBrowserHelper({ app: { post: (path, fn) => routes.set(path, fn) }, sessions,
      createContext: async () => ({ close: async () => { closed++; } }), expired: s => s.expiresAt <= clock, now: () => clock });
    const session = () => { const s = { id: String(sessions.size), origin, seedUrl: origin + '/private', sampleUrls: [], expiresAt: clock + 1000000 }; sessions.set(s.id, s); return s; };
    const request = async (path, code, body, requestOrigin = 'chrome-extension://' + 'a'.repeat(32)) => {
      const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
      await routes.get('/scan-auth/helper/' + path)({ headers: { authorization: 'Bearer ' + code, origin: requestOrigin }, body }, res);
      return res;
    };
    const first = session(), pairing = helper.start(first);
    assert(!JSON.stringify(first).includes(pairing.helperPairingCode), 'Raw pairing code must not be retained');
    assert.equal((await request('describe', pairing.helperPairingCode, {}, 'https://evil.example')).statusCode, 410);
    assert.equal((await request('import', pairing.helperPairingCode, { origin: 'https://evil.example', storageState: state })).statusCode, 409);
    assert.equal((await request('import', pairing.helperPairingCode, { origin, storageState: state })).statusCode, 200);
    assert.equal((await request('import', pairing.helperPairingCode, { origin, storageState: state })).statusCode, 410);
    const cancelled = session(), cancelledCode = helper.start(cancelled).helperPairingCode;
    sessions.delete(cancelled.id);
    assert.equal((await request('describe', cancelledCode, {})).statusCode, 410);
    const timedOut = session(), expiredCode = helper.start(timedOut).helperPairingCode;
    clock += 300001;
    assert.equal((await request('import', expiredCode, { origin, storageState: state })).statusCode, 410);
    const raceHelper = createBrowserHelper({ app: { post: (path, fn) => routes.set(path, fn) }, sessions,
      createContext: () => new Promise(resolve => { completeContext = resolve; }), expired: s => s.expiresAt <= clock, now: () => clock });
    const racing = session(), racingCode = raceHelper.start(racing).helperPairingCode;
    const importing = request('import', racingCode, { origin, storageState: state });
    sessions.delete(racing.id); completeContext({ close: async () => { closed++; } });
    assert.equal((await importing).statusCode, 409);
    assert.equal(closed, 1, 'Cancelled import must close its browser context');
    const interrupted = session(), interruptedCode = raceHelper.start(interrupted).helperPairingCode;
    const response = new (require('node:events').EventEmitter)();
    Object.assign(response, { setHeader() {}, status() { return this; }, json() { return this; }, writableEnded: false });
    const pendingImport = routes.get('/scan-auth/helper/import')({ headers: { origin: 'chrome-extension://' + 'a'.repeat(32), authorization: 'Bearer ' + interruptedCode }, body: { origin, storageState: state } }, response);
    response.emit('close'); completeContext({ close: async () => { closed++; } }); await pendingImport;
    assert(!sessions.has(interrupted.id)); assert.equal(closed, 2, 'Disconnected import must close its context and invalidate pairing');

  } finally {
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
  console.log('Passed: local-only gate, exact target, identity-provider exclusion, bounded state, cookie narrowing, expiry, cancellation, replay and import-race cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
