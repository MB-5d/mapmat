const assert = require('assert');
const http = require('http');
const net = require('net');
const { chromium } = require('playwright');
const { createScanAuthProxy, isRestrictedIpv4, resolveScanAuthTarget } = require('../utils/scanAuthProxy');

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function requestProxy(proxy, url, authorization) {
  const endpoint = new URL(proxy.server);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: endpoint.hostname,
      port: endpoint.port,
      method: 'GET',
      path: url,
      headers: authorization ? { 'Proxy-Authorization': authorization } : {},
    }, (response) => {
      const parts = [];
      response.on('data', (part) => parts.push(part));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(parts).toString() }));
    });
    request.on('error', reject);
    request.end();
  });
}

async function connectThroughProxy(proxy, authority, authorization) {
  const endpoint = new URL(proxy.server);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: endpoint.hostname,
      port: endpoint.port,
      method: 'CONNECT',
      path: authority,
      headers: authorization ? { 'Proxy-Authorization': authorization } : {},
    });
    request.on('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        resolve({ status: response.statusCode });
        return;
      }
      socket.once('data', (data) => {
        socket.destroy();
        resolve({ status: response.statusCode, body: data.toString() });
      });
      socket.once('error', reject);
      socket.write('ping');
    });
    request.on('error', reject);
    request.end();
  });
}

async function main() {
  for (const address of ['127.0.0.1', '169.254.169.254', '10.0.0.1', '100.64.0.1', '172.16.0.1', '192.168.1.1', '198.18.0.1']) {
    assert.strictEqual(isRestrictedIpv4(address), true, address);
  }
  assert.strictEqual(isRestrictedIpv4('8.8.8.8'), false);
  await assert.rejects(() => resolveScanAuthTarget('site.example', {
    lookup: async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }],
  }), /Blocked host/);
  assert.strictEqual(await resolveScanAuthTarget('site.example', {
    lookup: async () => [{ address: '8.8.8.8' }],
  }), '8.8.8.8');

  const target = http.createServer((_, response) => response.end('target reached'));
  const port = await listen(target);
  const tunnelTarget = net.createServer((socket) => socket.on('data', () => socket.end('pong')));
  const tunnelPort = await listen(tunnelTarget);
  const proxy = createScanAuthProxy({ allowPrivateNetworks: true });
  const options = await proxy.start();
  const authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`;
  try {
    assert.strictEqual((await requestProxy(options, `http://127.0.0.1:${port}/`, null)).status, 407);
    assert.deepStrictEqual(await requestProxy(options, `http://127.0.0.1:${port}/`, authorization), {
      status: 200,
      body: 'target reached',
    });
    assert.deepStrictEqual(await connectThroughProxy(options, `127.0.0.1:${tunnelPort}`, authorization), {
      status: 200,
      body: 'pong',
    });
  } finally {
    await proxy.close();
    await new Promise((resolve) => target.close(resolve));
    await new Promise((resolve) => tunnelTarget.close(resolve));
  }

  const blockedProxy = createScanAuthProxy({
    lookup: async () => [{ address: '127.0.0.1' }],
  });
  const blockedOptions = await blockedProxy.start();
  try {
    const blockedAuthorization = `Basic ${Buffer.from(`${blockedOptions.username}:${blockedOptions.password}`).toString('base64')}`;
    assert.strictEqual((await requestProxy(blockedOptions, 'http://site.example/', blockedAuthorization)).status, 403);
  } finally {
    await blockedProxy.close();
  }

  let browserTargetHits = 0;
  const browserTarget = http.createServer((_, response) => {
    browserTargetHits += 1;
    response.end('browser target');
  });
  const browserPort = await listen(browserTarget);
  const browserProxy = createScanAuthProxy();
  const browserOptions = await browserProxy.start();
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ proxy: browserOptions });
    try {
      const page = await context.newPage();
      const response = await page.goto(`http://127.0.0.1:${browserPort}/`, { timeout: 10000 }).catch(() => null);
      assert.notStrictEqual(response?.status(), 200, 'browser bypassed authenticated scan proxy');
      assert.strictEqual(browserTargetHits, 0, 'private target received a browser request');
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    await browserProxy.close();
    await new Promise((resolve) => browserTarget.close(resolve));
  }
  console.log('[scan-auth-proxy] Passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
