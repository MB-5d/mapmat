const crypto = require('crypto');
const dns = require('dns').promises;
const http = require('http');
const net = require('net');

function isRestrictedIpv4(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

async function resolveScanAuthTarget(hostname, { allowPrivateNetworks = false, lookup = dns.lookup } = {}) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    if (!allowPrivateNetworks) throw new Error('Blocked host');
  }
  if (net.isIP(host) === 6) throw new Error('IPv6 destinations are not supported by authenticated scan beta');
  const records = net.isIP(host) === 4
    ? [{ address: host }]
    : await lookup(host, { all: true, family: 4, verbatim: true });
  if (!records.length || (!allowPrivateNetworks && records.some(({ address }) => isRestrictedIpv4(address)))) {
    throw new Error('Blocked host');
  }
  const address = records[0].address;
  if (net.isIP(address) !== 4) throw new Error('Invalid destination');
  return address;
}

function readProxyAuthority(authority, allowPrivateNetworks = false) {
  const parsed = new URL(`http://${authority}`);
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Invalid destination');
  }
  const port = Number(parsed.port || 80);
  if (!allowPrivateNetworks && ![80, 443].includes(port)) throw new Error('Unsupported destination port');
  return { hostname: parsed.hostname, port };
}

function createScanAuthProxy({ allowPrivateNetworks = false, lookup = dns.lookup } = {}) {
  const password = crypto.randomBytes(24).toString('hex');
  const expectedAuthorization = `Basic ${Buffer.from(`scan-auth:${password}`).toString('base64')}`;
  const authorized = (headers) => {
    const value = String(headers['proxy-authorization'] || '');
    const received = Buffer.from(value);
    const expected = Buffer.from(expectedAuthorization);
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  };
  const resolve = (hostname) => resolveScanAuthTarget(hostname, { allowPrivateNetworks, lookup });
  const server = http.createServer(async (req, res) => {
    if (!authorized(req.headers)) {
      res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="Vellic scan browser"' });
      res.end();
      return;
    }
    try {
      const target = new URL(req.url);
      if (target.protocol !== 'http:' || target.username || target.password || (!allowPrivateNetworks && target.port && target.port !== '80')) {
        throw new Error('Unsupported destination');
      }
      const address = await resolve(target.hostname);
      const headers = { ...req.headers, host: target.host };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      const upstream = http.request({
        hostname: address,
        port: Number(target.port || 80),
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers,
        timeout: 20000,
      }, (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy(new Error('Target timed out')));
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(upstream);
    } catch {
      res.writeHead(403);
      res.end();
    }
  });
  server.on('connect', async (req, client, head) => {
    if (!authorized(req.headers)) {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Vellic scan browser"\r\n\r\n');
      return;
    }
    try {
      const { hostname, port } = readProxyAuthority(req.url, allowPrivateNetworks);
      const address = await resolve(hostname);
      const upstream = net.connect({ host: address, port });
      upstream.setTimeout(20000, () => upstream.destroy());
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
      client.on('close', () => upstream.destroy());
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    }
  });

  return {
    async start() {
      await new Promise((resolveStart, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolveStart);
      });
      return {
        server: `http://127.0.0.1:${server.address().port}`,
        username: 'scan-auth',
        password,
      };
    },
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

module.exports = { createScanAuthProxy, isRestrictedIpv4, resolveScanAuthTarget };
