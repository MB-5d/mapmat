const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startLab } = require('../protected-site/run.cjs');

(async () => {
  const { normalizeCookies } = await import('./extension/capture.mjs');
  const inbox = new Map();
  const lab = await startLab({ testInbox: inbox, helper: true, hideProtected: true });
  const apiBase = 'http://127.0.0.1:4349', site = 'http://localhost:4399';
  const extension = 'chrome-extension://chfjcbfapoiglecheoijdnbclmepcobe';
  const api = async (path, body) => {
    const response = await fetch(apiBase + path, { method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer ' + lab.token, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert(response.ok, result.error || 'API failure'); return result;
  };
  const helper = (path, code, body) => fetch(apiBase + '/scan-auth/helper/' + path, {
    method: 'POST', headers: { origin: extension, authorization: 'Bearer ' + code, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const cookieJar = new Map();
  const form = async (path, data) => {
    const response = await fetch(site + path, { redirect: 'manual', method: data ? 'POST' : 'GET',
      headers: { cookie: [...cookieJar].map(([k, v]) => k + '=' + v).join('; '), origin: site, 'content-type': 'application/x-www-form-urlencoded' },
      ...(data ? { body: new URLSearchParams(data) } : {}) });
    for (const raw of response.headers.getSetCookie()) { const pair = raw.split(';')[0], index = pair.indexOf('='); cookieJar.set(pair.slice(0, index), pair.slice(index + 1)); }
    return response;
  };
  const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
  try {
    await form('/login?standalone=1');
    const html = await (await form('/sign-in')).text();
    const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)[1];
    assert.equal((await form('/email/start', { csrf, email: 'helper@example.invalid', password: 'Vellic-local-test-only' })).status, 303);
    assert.equal((await form('/email/verify', { csrf, code: inbox.get('helper@example.invalid') })).status, 200);
    assert.equal((await form('/members')).status, 200);
    assert.equal((await fetch(site + '/members')).status, 404);
    const session = await api('/scan-auth/sessions', { url: site + '/', sampleUrls: [site + '/members'], browserHelper: true });
    assert(session.helperPairingCode);
    const readyBeforeImport = await fetch(apiBase + '/scan-auth/sessions/' + session.sessionId + '/complete', { method: 'POST', headers: { authorization: 'Bearer ' + lab.token } });
    assert.equal(readyBeforeImport.status, 409);
    const cookies = normalizeCookies([{ name: 'protected_test_session', value: cookieJar.get('protected_test_session'), domain: 'localhost', path: '/', httpOnly: true, secure: false, hostOnly: true, sameSite: 'lax', session: true }], site);
    const payload = { origin: site, storageState: { cookies, origins: [] } };
    assert.equal((await helper('import', session.helperPairingCode, payload)).status, 200);
    assert.equal((await helper('import', session.helperPairingCode, payload)).status, 410);
    assert.equal((await api('/scan-auth/sessions/' + session.sessionId + '/complete', {})).ready, true);
    const job = await api('/scan-jobs', { url: site + '/', maxPages: 10, options: { authenticatedPages: true }, authSessionId: session.sessionId, authenticatedCaptureType: 'thumb' });
    let result;
    for (let i = 0; i < 120; i++) {
      const response = await api('/scan-jobs/' + job.jobId + '?access_token=' + job.jobAccessToken);
      assert.notEqual(response.job.status, 'failed', response.job.error);
      if (response.job.status === 'complete') { result = response.job.result; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(result, 'Scan timed out');
    const nodes = flatten(result.root);
    for (const path of ['/members', '/members/about', '/members/projects', '/members/projects/sample']) {
      const node = nodes.find(item => item.url === site + path);
      assert.equal(node?.httpStatus, 200); assert(!node.authRequired);
      assert(node.thumbnailUrl.startsWith('/api/private-scan-captures/'));
      assert.equal((await fetch(apiBase + node.thumbnailUrl)).status, 401);
    }
    assert.equal((await fetch(apiBase + '/scan-auth/sessions/' + session.sessionId, { headers: { authorization: 'Bearer ' + lab.token } })).status, 404);
    const cancelled = await api('/scan-auth/sessions', { url: site + '/members', browserHelper: true });
    await fetch(apiBase + '/scan-auth/sessions/' + cancelled.sessionId, { method: 'DELETE', headers: { authorization: 'Bearer ' + lab.token } });
    assert.equal((await helper('import', cancelled.helperPairingCode, payload)).status, 410);
    // Public pages must not be mistaken for verified authenticated access.
    const publicPage = await api('/scan-auth/sessions', { url: site + '/', browserHelper: true });
    assert.equal((await helper('import', publicPage.helperPairingCode, payload)).status, 200);
    assert.equal((await fetch(apiBase + '/scan-auth/sessions/' + publicPage.sessionId + '/complete', { method: 'POST', headers: { authorization: 'Bearer ' + lab.token } })).status, 409);
    console.log('Passed: standalone password/code session, helper import, signed-out comparison, four-page scan, private captures, replay rejection, cancellation and post-scan deletion. Chrome extension UI and real providers still require live testing.');
  } finally { await lab.close(); fs.rmSync(lab.dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
