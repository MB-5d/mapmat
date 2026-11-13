// Explicit, one-machine staging test. Requires approved usage and a scoped token.
const assert = require('node:assert/strict');
const { Sandbox } = require('railway');
const { chromium } = require('playwright');
const { RailwayBrowserTransport } = require('../utils/railwayBrowserTransport.cjs');
const { openIsolatedBrowser } = require('../utils/isolatedScanBrowser.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function verifyNamespace(interfaces) {
  assert(Array.isArray(interfaces) && interfaces.some(item => item.ifname === 'lo'), 'loopback must exist');
  for (const item of interfaces.filter(item => item.ifname !== 'lo')) {
    assert(Array.isArray(item.flags) && !item.flags.includes('UP') && !(item.addr_info || []).length,
      'non-loopback interfaces must have no address and remain down');
  }
}
async function denied(page, url) {
  let response;
  try { response = await page.goto(url, { timeout: 4000 }); }
  catch (error) {
    assert(/net::ERR_|Timeout/.test(error.message), 'denial must be a network failure');
    return;
  }
  assert([403, 407, 502].includes(response?.status()), 'private destination must be denied, never served');
}
async function verifyDestroyed(vm) {
  for (let i = 0; i < 20; i++) {
    if ((await vm.refresh()).status === 'DESTROYED') return;
    await pause(500);
  }
  assert.fail('Test machine removal must be verified');
}
async function run(config) {
  assert(process.argv.includes('--approved-staging-test'), 'Explicit staging test approval is required.');
  assert(config.token && /^vellic-browser-[a-f0-9]{16}$/.test(config.checkpoint || ''));
  let vm, remote;
  const failures = [];
  // Independent synthetic checks should report all failures, especially expiry.
  // Never use customer credentials or capture response bodies in this harness.
  const check = async (label, test) => {
    try { await test(); console.log('PASS ' + label); }
    catch (error) { failures.push(new Error(label, { cause: error })); console.log('FAIL ' + label); }
  };
  const release = async () => {
    const current = remote;
    remote = null;
    await current?.close();
  };
  try {
    vm = await Sandbox.create(config.checkpoint, {
      ...config, webSocketImpl: RailwayBrowserTransport,
      networkIsolation: 'ISOLATED', domains: [], env: {}, idleTimeoutMinutes: 5,
      resources: { cpu: 2, memoryGB: 2 },
    });
    console.log('Created one isolated staging test machine: ' + vm.id);
    // First two synthetic leases reuse this VM. The last lease exercises real
    // provider destruction on expiry; finally also removes it after any failure.
    const provider = (destroyOnClose = false) => ({ create: async () => ({
      id: vm.id, environmentId: vm.environmentId, networkIsolation: vm.networkIsolation,
      domains: vm.domains, exec: vm.exec.bind(vm),
      destroy: destroyOnClose ? vm.destroy.bind(vm) : async () => {},
      ...(destroyOnClose ? { refresh: vm.refresh.bind(vm) } : {}),
    }) });
    const open = async (seconds, destroyOnClose = false) => {
      remote = await openIsolatedBrowser({ config, expiresAt: Date.now() + seconds * 1000,
        connect: chromium.connect.bind(chromium), provider: provider(destroyOnClose) });
    };
    await check('public/proxy/namespace setup', async () => {
      await open(120);
      const context = await remote.browser.newContext({ proxy: remote.proxy });
      const page = await context.newPage();
      await check('public page and image through restricted proxy', async () => {
        assert.equal((await page.goto('https://example.com/', { timeout: 30000 })).status(), 200);
        assert.equal(await page.title(), 'Example Domain');
        assert((await page.screenshot()).length > 1000);
      });
      await check('private, metadata, loopback and IPv6 destinations denied', async () => {
        for (const url of ['http://169.254.169.254/', 'http://10.0.0.1/', 'http://127.0.0.1:4002/', 'http://[::1]/']) await denied(page, url);
      });
      const direct = await remote.browser.newContext();
      await check('direct network bypass denied', async () => {
        const directPage = await direct.newPage();
        for (const url of ['https://example.com/', 'http://169.254.169.254/']) await denied(directPage, url);
      });
      await check('separate browser contexts do not share cookies', async () => {
        await context.addCookies([{ name: 'synthetic', value: 'fixture-only', url: 'https://example.com' }]);
        assert.equal((await direct.cookies()).length, 0);
      });
      await check('only loopback is active/addressed; application checkout absent', async () => {
        const proof = await vm.exec("test ! -e /app/server.js && pid=$(pgrep -u 1001 -f '/opt/vellic-browser/worker.cjs' | head -1) && test -n \"$pid\" && nsenter -t \"$pid\" -n ip -j address", {
          ephemeral: true, captureOutput: true, maxOutputBytes: 4000, timeoutSec: 10, signal: AbortSignal.timeout(20000),
        });
        assert.equal(proof.exitCode, 0);
        verifyNamespace(JSON.parse(proof.stdout));
      });
    });
    await check('first connection cleanup', release);
    await check('browser connection interruption closes its remote process', async () => {
      await open(30);
      await remote.browser.close();
      await remote.close();
      const proof = await vm.exec("for attempt in 1 2 3 4 5; do if ! pgrep -u 1001 -f '/opt/vellic-browser/worker.cjs' >/dev/null; then exit 0; fi; sleep 1; done; exit 1", {
        ephemeral: true, captureOutput: false, timeoutSec: 10, signal: AbortSignal.timeout(20000),
      });
      assert.equal(proof.exitCode, 0);
    });
    await check('interrupted connection cleanup', release);
    await check('hard expiry disconnects browser and destroys its real cloud machine', async () => {
      await open(20, true);
      const deadline = Date.now() + 25000;
      while (remote.browser.isConnected() && Date.now() < deadline) await pause(250);
      assert.equal(remote.browser.isConnected(), false);
      await remote.close();
      await verifyDestroyed(vm);
      remote = null;
    });
  } finally {
    // A failed connection close must never prevent the real provider cleanup.
    try { await check('final connection cleanup', release); }
    finally {
      if (vm) await check('test machine removal verified', async () => {
        if ((await vm.refresh()).status !== 'DESTROYED') await vm.destroy();
        await verifyDestroyed(vm);
      });
    }
  }
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('; '));
}
if (require.main === module) {
  const config = { token: process.env.SCAN_BROWSER_RAILWAY_TOKEN,
    environmentId: 'da475d9e-af16-4895-a572-db8b75f53573', checkpoint: process.env.SCAN_BROWSER_CHECKPOINT };
  run(config).catch(error => {
    // Error details are limited to synthetic assertions; never print credentials.
    console.error(String(error.message).replaceAll(config.token || '__unset__', '[redacted]'));
    process.exitCode = 1;
  });
}
module.exports = { verifyNamespace };
