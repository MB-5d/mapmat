const assert = require('assert');
const { installScanAuthNetworkGuard, isAllowedScanAuthRequest } = require('../utils/scanAuthNetwork');

const checked = [];
const assertSafeUrl = async (rawUrl) => {
  checked.push(rawUrl);
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
  if (['localhost', '127.0.0.1', '169.254.169.254'].includes(url.hostname)) {
    throw new Error('Blocked host');
  }
};

async function main() {
  assert.strictEqual(await isAllowedScanAuthRequest('https://accounts.google.com/login', assertSafeUrl), true);
  assert.strictEqual(await isAllowedScanAuthRequest('http://127.0.0.1/admin', assertSafeUrl), false);
  assert.strictEqual(await isAllowedScanAuthRequest('http://169.254.169.254/latest/meta-data', assertSafeUrl), false);
  assert.strictEqual(await isAllowedScanAuthRequest('file:///etc/passwd', assertSafeUrl), false);
  assert.strictEqual(await isAllowedScanAuthRequest('data:image/png;base64,AA==', assertSafeUrl), true);

  let requestHandler;
  let socketHandler;
  await installScanAuthNetworkGuard({
    route: async (_, handler) => { requestHandler = handler; },
    routeWebSocket: async (_, handler) => { socketHandler = handler; },
  }, assertSafeUrl);

  const routeRequest = async (url) => {
    let result = null;
    await requestHandler({
      request: () => ({ url: () => url }),
      continue: () => { result = 'continued'; },
      abort: () => { result = 'blocked'; },
    });
    return result;
  };
  assert.strictEqual(await routeRequest('https://example.com/page'), 'continued');
  assert.strictEqual(await routeRequest('http://localhost/private'), 'blocked');

  const routeSocket = async (url) => {
    let result = null;
    await socketHandler({
      url: () => url,
      connectToServer: () => { result = 'connected'; },
      close: () => { result = 'blocked'; },
    });
    return result;
  };
  assert.strictEqual(await routeSocket('wss://example.com/events'), 'connected');
  assert.strictEqual(await routeSocket('ws://127.0.0.1/events'), 'blocked');
  assert(checked.includes('https://example.com/events'));
  console.log('[scan-auth-network] Passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
