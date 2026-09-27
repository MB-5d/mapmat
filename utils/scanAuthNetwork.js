function isLocalBrowserUrl(rawUrl) {
  try {
    return ['about:', 'blob:', 'data:'].includes(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
}

async function installScanAuthNetworkGuard(context, assertSafeUrl) {
  await context.route('**/*', async (route) => {
    if (await isAllowedScanAuthRequest(route.request().url(), assertSafeUrl)) return route.continue();
    return route.abort('blockedbyclient');
  });

  // Page routes do not cover WebSocket handshakes.
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', async (socket) => {
      try {
        const url = new URL(socket.url());
        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('Invalid WebSocket URL');
        url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        await assertSafeUrl(url.toString());
      } catch {
        socket.close();
        return;
      }
      socket.connectToServer();
    });
  }
}

async function isAllowedScanAuthRequest(url, assertSafeUrl) {
  if (isLocalBrowserUrl(url)) return true;
  try {
    await assertSafeUrl(url);
    return true;
  } catch {
    return false;
  }
}

module.exports = { installScanAuthNetworkGuard, isAllowedScanAuthRequest };
