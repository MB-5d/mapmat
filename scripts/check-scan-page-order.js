const assert = require('node:assert/strict');
const { extractPageLinkOrder, getSiblingLinkRanks } = require('../utils/scanPageOrder');
const base = 'https://order.test';
const html = '<header><a href="/cart">Cart</a><nav><a href="/">Work</a><a href="/personal">Personal</a><a href="/about">About</a></nav></header><main><a href="/project-z">Z</a><a href="/project-a">A</a><a href="/ibm/cognitive">Sculpture</a><a href="/project-z">Again</a><div hidden><a href="/hidden">Hidden</a></div></main>';
const links = extractPageLinkOrder(html, base);
assert.deepEqual(links.map(u => new URL(u).pathname), ['/', '/personal', '/about', '/project-z', '/project-a', '/ibm/cognitive', '/cart']);
const children = ['/ibm', '/project-a', '/about', '/project-z', '/personal'].map(url => ({ url: base + url, children: url === '/ibm' ? [{ url: base + '/ibm/cognitive' }] : [] }));
const ranks = getSiblingLinkRanks(children, links);
children.sort((a, b) => ranks.get(a) - ranks.get(b));
assert.deepEqual(children.map(n => new URL(n.url).pathname), ['/personal', '/about', '/project-z', '/project-a', '/ibm']);
console.log('[scan-page-order] Navigation, content order, duplicate/hidden links, and structural-parent positioning passed.');
if (process.argv.includes('--http')) runHttp().catch(e => { console.error(e); process.exitCode = 1; });

async function runHttp() {
  const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
  const { spawn } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-order-'));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const password = crypto.randomBytes(16).toString('hex');
  const fixture = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://fixture.local').pathname;
    const reply = (body, status = 200, type = 'text/html') => { res.writeHead(status, { 'content-type': type }); res.end(body); };
    if (req.method === 'POST' && pathname === '/project-z') { let data = ''; req.on('data', c => data += c); req.on('end', () => {
      if (new URLSearchParams(data).get('password') !== password) return reply('Incorrect password', 401);
      res.writeHead(303, { location: '/project-z', 'set-cookie': 'order_fixture=ok; Path=/; SameSite=Lax' }); res.end();
    }); return; }
    if (pathname === '/') return reply('<title>Home</title>' + html);
    if (pathname === '/sitemap.xml') return reply(`<urlset>${['/project-a', '/project-z', '/ibm/cognitive', '/about', '/personal'].map(p => `<url><loc>http://127.0.0.1:${fixture.address().port}${p}</loc></url>`).join('')}</urlset>`, 200, 'application/xml');
    if (pathname === '/robots.txt') return reply('User-agent: *\nAllow: /', 200, 'text/plain');
    if (!['/personal', '/about', '/project-a', '/project-z', '/ibm/cognitive'].includes(pathname)) return reply('<title>Not found</title>', 404);
    if (pathname === '/project-z' && !String(req.headers.cookie || '').includes('order_fixture=ok')) return reply('<title>Secure</title><form method="post"><input type="password" name="password"><button>Unlock</button></form>', 401);
    setTimeout(() => reply(`<title>${pathname}</title><meta name="date" content="2020-01-01"><a href="/project-a">Unrelated crosslink</a><h1>${pathname}</h1>`), pathname === '/personal' ? 300 : pathname === '/project-z' ? 600 : 20);
  });
  await new Promise(r => fixture.listen(0, '127.0.0.1', r)); const site = `http://127.0.0.1:${fixture.address().port}`;
  try {
    for (const enabled of [false, true]) {
      const socket = http.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); const port = socket.address().port; await new Promise(r => socket.close(r));
      const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DB_PROVIDER: 'sqlite', DB_PATH: path.join(dir, `test-${enabled}.db`), RUN_MODE: 'web', ALLOW_PRIVATE_NETWORKS: 'true', SCAN_AUTH_FEATURE_ENABLED: String(enabled), TEST_AUTH_ENABLED: 'true', AUTH_HEADER_FALLBACK: 'true', TEST_AUTH_SEED_EMAIL: 'admin@vellic.io', TEST_AUTH_SEED_PASSWORD: password, SCREENSHOT_STORAGE_PROVIDER: 'local', SCREENSHOT_STORAGE_DIR: dir, EMAIL_PROVIDER: 'log' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let logs = ''; child.stdout.on('data', c => { logs = (logs + c).slice(-10000); }); child.stderr.on('data', c => { logs = (logs + c).slice(-10000); });
      let token;
      const request = async (route, body) => { const r = await fetch(`http://127.0.0.1:${port}` + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000) }); const j = await r.json(); assert(r.ok, JSON.stringify(j)); return j; };
      try {
        for (let i = 0; i < 100; i++) { try { if ((await request('/health')).ok && /Seeded test account/.test(logs)) break; } catch {} await sleep(200); }
        token = (await request('/auth/login', { email: 'admin@vellic.io', password })).token;
        let sessionId;
        if (enabled) { const s = await request('/scan-auth/sessions', { url: site, sampleUrls: [site + '/project-z'] }); sessionId = s.sessionId;
          await request(`/scan-auth/sessions/${sessionId}/action`, { action: 'password', text: password }); await request(`/scan-auth/sessions/${sessionId}/complete`, {}); }
        const created = await request('/scan-jobs', { url: site, maxPages: 30, options: { authenticatedPages: true, inactivePages: true, errorPages: true }, ...(sessionId ? { authSessionId: sessionId } : {}) });
        let result;
        for (let i = 0; i < 120; i++) { const { job } = await request(`/scan-jobs/${created.jobId}?access_token=${created.jobAccessToken}`); if (job.status === 'failed') throw new Error(job.error); if (job.status === 'complete') { result = job.result; break; } await sleep(500); }
        assert(result, 'scan did not finish');
        const expected = ['/personal', '/about', '/project-z', '/project-a', '/ibm'];
        const actual = result.root.children.map(n => new URL(n.url).pathname).filter(p => expected.includes(p));
        assert.deepEqual(actual, expected, `actual sibling order with authentication ${enabled}`);
        assert.equal(result.root.children.find(n => n.url.endsWith('/project-z')).authRequired, !enabled);
        console.log(`[scan-page-order] Real ${enabled ? 'authenticated' : 'ordinary, beta-disabled'} scan kept navigation/content order despite reversed sitemap and delayed responses.`);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const stopped = new Promise(r => child.once('exit', r));
          child.kill('SIGTERM');
          const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
          await stopped;
          clearTimeout(timer);
        }
      }
    }
  } finally { fixture.closeAllConnections(); await new Promise(r => fixture.close(r)); fs.rmSync(dir, { recursive: true, force: true }); }
}
