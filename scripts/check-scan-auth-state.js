const assert = require('assert');
const {
  isHostnameInAuthScope,
  isScanAuthSessionExpired,
  scopeScanAuthStorageState,
} = require('../utils/scanAuthState');

const scope = { baseHost: 'app.example.com', rootDomain: 'example.com' };
const state = scopeScanAuthStorageState({
  cookies: [
    { name: 'site', domain: 'app.example.com' },
    { name: 'parent', domain: '.example.com' },
    { name: 'provider', domain: '.accounts.google.com' },
    { name: 'unrelated', domain: 'other.example.com' },
  ],
  origins: [
    { origin: 'https://app.example.com', localStorage: [] },
    { origin: 'https://accounts.google.com', localStorage: [] },
  ],
}, scope);

assert.deepStrictEqual(state.cookies.map((cookie) => cookie.name), ['site', 'parent']);
assert.deepStrictEqual(state.origins.map((entry) => entry.origin), ['https://app.example.com']);
assert.strictEqual(isHostnameInAuthScope('other.example.com', scope), false);
assert.strictEqual(isHostnameInAuthScope('child.app.example.com', scope), true);
assert.strictEqual(isScanAuthSessionExpired({ expiresAt: 2000 }, 1999), false);
assert.strictEqual(isScanAuthSessionExpired({ expiresAt: 2000 }, 2000), true);
assert.strictEqual(isScanAuthSessionExpired(null, 2000), true);
console.log('[scan-auth-state] Passed.');
