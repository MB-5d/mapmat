const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('playwright');
const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const session = { id:'closed-browser', expiresAt:Date.now()+60000, password:'fixture-only',
      storageState:{cookies:[],origins:[]}, passwordAttempts:new Set(), scanContexts:new Set([context]), browserContext:context };
    const sessions = new Map([[session.id,session]]), owners = new WeakMap([[context,session]]);
    const sandbox = { scanAuthSessions:sessions, scanAuthContextOwners:owners,
      isScanAuthSessionExpired:s=>s.expiresAt<=Date.now(), clearTimeout, console };
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('function closeScanAuthBrowser('),source.indexOf('function cleanupExpiredScanAuthSessions(')),sandbox);
    vm.runInContext(source.slice(source.indexOf('async function fetchPageWithBrowserContext('),source.indexOf('async function fetchPageWithBrowserRequestContext(')),sandbox);
    await context.close();
    await assert.rejects(sandbox.fetchPageWithBrowserContext(context,'https://example.com/private'), error=>error.code==='scan_auth_browser_lost');
    assert.equal(sessions.has(session.id),false,'A disconnected login must not remain ready');
    assert.equal(session.password,null); assert.equal(session.storageState,null); assert.equal(session.scanContexts.size,0);
    owners.delete(context);
    await assert.rejects(sandbox.fetchPageWithBrowserContext(context,'https://example.com/'), error=>!error.code);
    owners.set(context,session);session.expiresAt=Date.now()-1;
    await assert.rejects(sandbox.fetchPageWithBrowserContext(context,'https://example.com/private'), error=>error.code==='scan_auth_expired');
    console.log('Passed: a real closed browser context invalidates its protected login; public errors and expiry retain their own behavior.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
