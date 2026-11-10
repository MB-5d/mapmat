/* eslint-disable no-console */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ttl = Number(process.env.SCAN_AUTH_EXPIRY_TEST_TTL_MS || 300000);
assert(ttl >= 300000 && ttl <= 1800000, 'Use the supported 5–30 minute lifetime');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-active-expiry-'));
  const password = crypto.randomBytes(18).toString('hex');
  const requests = [];
  let scanning = false;
  const fixture = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://fixture.local').pathname;
    const unlocked = String(req.headers.cookie || '').includes('expiry_fixture=ok');
    const send = (body, status = 200) => { if (!res.destroyed) { res.writeHead(status, { 'content-type': 'text/html' }); res.end(`<html><head><title>Expiry fixture ${pathname}</title></head><body>${body}</body></html>`); } };
    if (req.method === 'POST' && pathname === '/protected') {
      let data = ''; req.on('data', c => { data += c; }); req.on('end', () => {
        if (new URLSearchParams(data).get('password') !== password) return send('Incorrect password', 401);
        res.writeHead(303, { location: '/protected', 'set-cookie': 'expiry_fixture=ok; Path=/; SameSite=Lax' }); res.end();
      }); return;
    }
    if (pathname === '/protected') return send(unlocked ? '<h1>Protected content</h1>' : '<form method="post" action="/protected"><input type="password" name="password"><button>Unlock</button></form>', unlocked ? 200 : 401);
    if (pathname === '/') return send(Array.from({ length: 10 }, (_, i) => `<a href="/section-${i}">Section ${i}</a>`).join(''));
    if (/^\/section-\d+(\/page-\d+)?$/.test(pathname)) {
      requests.push({ at: Date.now(), unlocked });
      if (!unlocked) return send('<h1>Login required</h1>', 401);
      const content = pathname.includes('/page-') ? '<h1>Private page</h1>' : Array.from({ length: 10 }, (_, i) => `<a href="${pathname}/page-${i}">Page ${i}</a>`).join('');
      // Each request stays below the browser timeout; serial work outlasts the login.
      const timer = setTimeout(() => send(content), scanning ? 18000 : 0);
      res.on('close', () => clearTimeout(timer)); return;
    }
    send('Not found', 404);
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const site = `http://127.0.0.1:${fixture.address().port}`;
  const portServer = http.createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  const backend = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: {
    ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DB_PROVIDER: 'sqlite', DB_PATH: path.join(directory, 'test.db'), RUN_MODE: 'web',
    TEST_AUTH_ENABLED: 'true', AUTH_HEADER_FALLBACK: 'true', TEST_AUTH_SEED_EMAIL: 'admin@vellic.io', TEST_AUTH_SEED_PASSWORD: password,
    SCAN_AUTH_FEATURE_ENABLED: 'true', SCAN_AUTH_SESSION_TTL_MS: String(ttl), SCAN_PAGE_CONCURRENCY: '1', ALLOW_PRIVATE_NETWORKS: 'true',
    SCREENSHOT_STORAGE_PROVIDER: 'local', SCREENSHOT_STORAGE_DIR: path.join(directory, 'images'), PRIVATE_SCAN_CAPTURE_KEY: crypto.randomBytes(32).toString('hex'), EMAIL_PROVIDER: 'log',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; backend.stdout.on('data', c => { logs = (logs + c).slice(-16000); }); backend.stderr.on('data', c => { logs = (logs + c).slice(-16000); });
  const base = `http://127.0.0.1:${port}`;
  let token;
  const request = (route, body) => fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
  const json = async (route, body) => { const r = await request(route, body); const j = await r.json(); assert(r.ok, `${route}: HTTP ${r.status} ${j.error || ''}`); return j; };
  try {
    for (let i = 0; i < 100; i++) { try { if ((await request('/health')).ok && /Seeded test account|Refreshed test account/.test(logs)) break; } catch {} await sleep(200); }
    token = (await json('/auth/login', { email: 'admin@vellic.io', password })).token; assert(token);
    const session = await json('/scan-auth/sessions', { url: site + '/', sampleUrls: [site + '/protected'] });
    await json(`/scan-auth/sessions/${session.sessionId}/action`, { action: 'password', text: password });
    assert.equal((await json(`/scan-auth/sessions/${session.sessionId}/complete`, {})).ready, true);
    scanning = true;
    const created = await json('/scan-jobs', { url: site + '/', maxPages: 150, options: { authenticatedPages: true }, authSessionId: session.sessionId });
    const runningSession = await json(`/scan-auth/sessions/${session.sessionId}`);
    const expiry = Date.parse(runningSession.expiresAt);
    console.log(JSON.stringify({ phase: 'running', lifetimeMinutes: ttl / 60000, expiresAt: runningSession.expiresAt }));
    let lastRunningAt = 0, finalJob;
    let nextLog = Date.now() + 60000;
    while (Date.now() < expiry + 90000) {
      const { job } = await json(`/scan-jobs/${created.jobId}?access_token=${created.jobAccessToken}`);
      if (job.status === 'running') lastRunningAt = Date.now();
      else if (['failed', 'complete', 'canceled'].includes(job.status)) { finalJob = job; break; }
      if (Date.now() > nextLog) { console.log(JSON.stringify({ phase: 'running', protectedRequests: requests.length, secondsRemaining: Math.ceil((expiry - Date.now()) / 1000) })); nextLog = Date.now() + 60000; }
      await sleep(1000);
    }
    assert(lastRunningAt >= expiry - 3000, 'Scan must still be running at the expiry boundary');
    assert.equal(finalJob?.status, 'failed', 'Expired scan must not publish a successful result');
    assert.match(finalJob.error, /temporary login.*expired|login.*expired/i);
    assert(!finalJob.result?.root, 'Do not publish expired authenticated results');
    assert(requests.some(r => r.unlocked), 'Fixture must actually receive authenticated requests');
    assert(!requests.some(r => r.unlocked && r.at > expiry + 1000), 'Do not start credentialed requests after expiry');
    assert.equal((await request(`/scan-auth/sessions/${session.sessionId}`)).status, 404);
    assert.equal((await request(`/scan-auth/sessions/${session.sessionId}/complete`, {})).status, 410);
    assert.equal((await request('/scan-jobs', { url: site + '/', authSessionId: session.sessionId })).status, 400);
    const result = { lifetimeMinutes: ttl / 60000, protectedRequests: requests.length, activeAtExpiry: true, finalStatus: finalJob.status, error: finalJob.error, noCredentialedRequestsAfterExpiry: true, sessionRemoved: true, passed: true };
    if (process.env.SCAN_AUTH_EXPIRY_TEST_RESULT) fs.writeFileSync(process.env.SCAN_AUTH_EXPIRY_TEST_RESULT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    if (backend.exitCode === null && backend.signalCode === null) {
      const stopped = new Promise(resolve => backend.once('exit', resolve));
      backend.kill('SIGTERM');
      const timer = setTimeout(() => backend.kill('SIGKILL'), 5000);
      await stopped;
      clearTimeout(timer);
    }
    fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)); fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
