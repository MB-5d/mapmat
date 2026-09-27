/* eslint-disable no-console */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

// Test-only HTTP transport. The real crawler and API run unchanged; no TLS
// validation is disabled and no fixture host reaches the public network.
if (process.env.SCAN_REDIRECT_FIXTURE_TRANSPORT === '1') {
  const axios = require('axios');
  const dns = require('dns').promises;
  const lookup = dns.lookup;
  const fixtureHosts = new Set(['redirect-fixture.test', 'scope-failure.test']);
  dns.lookup = async (host, options) => fixtureHosts.has(host.replace(/^www\./, ''))
    ? (options?.all ? [{ address: '93.184.215.14', family: 4 }] : { address: '93.184.215.14', family: 4 })
    : lookup(host, options);
  axios.defaults.adapter = async (config) => {
    const requested = new URL(config.url);
    if (!fixtureHosts.has(requested.hostname.replace(/^www\./, '')) || requested.port) {
      throw new Error(`Out-of-scope request: ${config.url}`);
    }
    fs.appendFileSync(process.env.SCAN_REDIRECT_FIXTURE_LOG, `${requested.href}\n`);
    const scopeFailure = requested.hostname === 'scope-failure.test';
    const origin = scopeFailure ? 'http://scope-failure.test' : 'https://redirect-fixture.test';
    const pages = {
      '/': '<title>Home</title><a href="/section">Section</a><a href="http://www.redirect-fixture.test/section">Alias</a><a href="http://redirect-fixture.test/">Home alias</a><a href="https://external.test/">External</a><a href="https://sub.redirect-fixture.test/">Subdomain</a><a href="https://redirect-fixture.test:8443/">Port</a>',
      '/section': '<title>Section</title><a href="/section/child">Child</a><a href="/unrelated">Unrelated</a>',
      '/section/child': '<title>Child</title><a href="/section/child/detail">Detail</a>',
      '/section/child/detail': '<title>Detail</title>',
      '/section/sitemap-only': '<title>Sitemap page</title>',
      '/unrelated': '<title>Unrelated</title>',
    };
    if (scopeFailure) {
      pages['/'] = '<title>Home</title><a href="https://scope-failure.test/section">Section</a><a href="https://scope-failure.test/section/child">Child</a>';
      pages['/about'] = '<title>About</title>';
      pages['/legal'] = '<title>Legal</title>';
    }
    let data = pages[requested.pathname] || '<title>Not found</title>';
    let status = pages[requested.pathname] ? 200 : 404;
    let contentType = 'text/html';
    if (requested.pathname === '/robots.txt') {
      data = `User-agent: *\nSitemap: ${origin}/fixture.xml`;
      status = 200;
      contentType = 'text/plain';
    }
    if (requested.pathname === '/fixture.xml') {
      data = scopeFailure
        ? `<urlset><url><loc>${origin}/about</loc></url><url><loc>${origin}/legal</loc></url></urlset>`
        : `<urlset><url><loc>http://www.redirect-fixture.test/section/sitemap-only</loc></url><url><loc>${origin}/section/sitemap-only</loc></url><url><loc>${origin}/section</loc></url></urlset>`;
      status = 200;
      contentType = 'application/xml';
    }
    return { data, status, statusText: String(status), headers: { 'content-type': contentType }, config,
      request: { res: { responseUrl: `${origin}${requested.pathname}${requested.search}` } } };
  };
}

async function main() {
  const liveApple = process.argv.includes('--live-apple');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-redirect-'));
  const portServer = net.createServer();
  await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const requestLog = path.join(temp, 'requests.log');
  const child = spawn(process.execPath, [...(liveApple ? [] : ['--require', __filename]), 'server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', DB_PROVIDER: 'sqlite', DB_PATH: path.join(temp, 'test.db'),
      HOST: '127.0.0.1', PORT: String(port), RUN_MODE: 'web', JOB_WORKER_TYPES: 'scan',
      ALLOW_PRIVATE_NETWORKS: 'true', SCREENSHOT_STORAGE_PROVIDER: 'local',
      SCAN_REDIRECT_FIXTURE_TRANSPORT: liveApple ? '0' : '1', SCAN_REDIRECT_FIXTURE_LOG: requestLog },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const json = async (route, body, token) => {
    const res = await fetch(`${base}${route}`, { method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await res.json();
    assert(res.ok, `${route}: ${JSON.stringify(result)}`);
    return result;
  };
  try {
    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      try { await json('/health'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
    assert(ready, `Backend did not start: ${output}`);
    const { token } = await json('/auth/login', { email: 'admin@vellic.io', password: 'Admin123' });
    const flatten = (node) => [node, ...(node.children || []).flatMap(flatten)];
    if (liveApple) {
      for (const url of ['http://apple.com/', 'https://www.apple.com/']) {
        const result = await json('/scan', { url, maxPages: 60, maxDepth: 3,
          options: { errorPages: false, inactivePages: false, subdomains: false } }, token);
        const nodes = flatten(result.root);
        const captured = nodes.filter((node) => node.httpStatus >= 200 && node.httpStatus < 300 && !node.isMissing);
        const paths = captured.map((node) => new URL(node.url).pathname);
        assert(result.scanDiagnostics.rootAllowedLinks > 0, 'Apple navigation must be accepted');
        const productSections = ['/mac', '/iphone', '/ipad', '/airpods', '/airtag', '/watch'].filter((value) => paths.includes(value));
        assert(productSections.length >= 2, `Apple product sections must be captured within the page budget: ${JSON.stringify(paths)}`);
        assert(paths.some((value) => value.split('/').filter(Boolean).length >= 2), 'nested Apple pages must be captured');
        assert.strictEqual(result.scanScope.seed, 'https://apple.com/');
        assert.strictEqual(nodes.filter((node) => node.url && new URL(node.url).pathname === '/').length, 1, 'only one homepage');
        console.log(JSON.stringify({ url, seed: result.scanScope.seed, captured: captured.length,
          acceptedHomepageLinks: result.scanDiagnostics.rootAllowedLinks, productSections,
          nestedPages: paths.filter((value) => value.split('/').filter(Boolean).length >= 2).length,
          partialReason: result.partialReason || null, fetched: result.scanDiagnostics.fetchedPageCount }));
      }
      console.log('Bounded live Apple HTTP/HTTPS scans passed');
      return;
    }
    for (const suffix of ['/', '/section']) {
      const results = [];
      for (const protocol of ['http:', 'https:']) {
        fs.writeFileSync(requestLog, '');
        const result = await json('/scan', { url: `${protocol}//www.redirect-fixture.test${suffix}`, maxPages: 12,
          options: { errorPages: false, inactivePages: false, subdomains: false, orphanPages: true } }, token);
        const nodes = [result.root, ...(result.orphans || [])].flatMap(flatten);
        const urls = nodes.filter((node) => !node.isStructuralContext && !node.isMissing).map((node) => node.url);
        assert(urls.includes('https://redirect-fixture.test/section/child/detail'), 'nested page must survive');
        assert(urls.includes('https://redirect-fixture.test/section/sitemap-only'), 'HTTP sitemap aliases must be accepted after verified upgrade');
        assert.strictEqual(result.scanScope.seed, `https://redirect-fixture.test${suffix}`);
        assert.strictEqual(nodes.filter((node) => node.url === `https://redirect-fixture.test${suffix}`).length, 1);
        assert.strictEqual(new Set(urls).size, urls.length, 'no alias duplicates');
        assert(!urls.some((url) => !url.startsWith('https://redirect-fixture.test/')));
        if (suffix === '/section') assert(!urls.includes('https://redirect-fixture.test/unrelated'));
        assert.strictEqual(result.scanDiagnostics.requestedSeedUrl, `${protocol}//redirect-fixture.test${suffix}`);
        assert.strictEqual(result.scanDiagnostics.transportUpgradeApplied, protocol === 'http:');
        const requests = fs.readFileSync(requestLog, 'utf8').trim().split('\n');
        assert.strictEqual(requests.filter((url) => new URL(url).pathname === suffix).length, 1, 'root response must be reused');
        assert(requests.filter((url) => /robots\.txt|fixture\.xml/.test(url)).every((url) => url.startsWith('https:')));
        assert.strictEqual(result.scanDiagnostics.failedFetches, 0, 'excluded domains and ports must never be requested');
        results.push(urls.sort());
      }
      assert.deepStrictEqual(results[0], results[1], 'HTTP/HTTPS scans should capture equivalent pages');
    }
    const shallow = await json('/scan', { url: 'http://redirect-fixture.test/', maxPages: 12, maxDepth: 1,
      options: { errorPages: false, inactivePages: false, subdomains: false } }, token);
    const shallowCaptured = flatten(shallow.root).filter((node) => node.httpStatus === 200 && !node.isMissing);
    assert(shallowCaptured.some((node) => node.url === 'https://redirect-fixture.test/section'));
    assert(!shallowCaptured.some((node) => new URL(node.url).pathname.split('/').filter(Boolean).length > 1), 'explicit depth limit must remain enforced');
    const failedDiscovery = await json('/scan', { url: 'http://scope-failure.test/', maxPages: 12,
      options: { errorPages: false, inactivePages: false, subdomains: false } }, token);
    assert(flatten(failedDiscovery.root).length > 1, 'failure fixture must contain multiple fallback pages');
    assert.strictEqual(failedDiscovery.partial, true);
    assert.strictEqual(failedDiscovery.partialReason, 'root_discovery_failed');
    assert(failedDiscovery.scanDiagnostics.rootSameSiteLinksRejectedByScope > 0);
    console.log('Scan redirect integration fixture passed: HTTP/HTTPS parity, nested pages, aliases, sitemap, focused scope, external/port exclusions');
  } catch (error) {
    console.error(error.message);
    console.error(output.slice(-6000));
    throw error;
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
