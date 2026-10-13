/* eslint-disable no-console */
const assert = require('node:assert/strict');
const { createBrowserbaseScanSessionManager } = require('../utils/scanAuthBrowserbase');
const { checkContracts } = require('./check-scan-auth-browserbase-pilot');

const site = 'https://site.example/protected';
const ownerKey = 'user:fixture-owner';
const privateEndpoint = 'wss://connect.browserbase.com?apiKey=fixture-secret';

function fixture(overrides = {}) {
  let time = 1000;
  let timeoutCallback;
  let releases = 0;
  let closes = 0;
  let guards = 0;
  let creates = 0;
  const context = { fixtureContext: true };
  const manager = createBrowserbaseScanSessionManager({
    client: {
      timeoutMs: 600000,
      create: async () => { creates += 1; return { id: 'fixture-provider', connectUrl: privateEndpoint }; },
      release: async () => { releases += 1; },
    },
    connect: async () => ({ contexts: () => [context], close: async () => { closes += 1; } }),
    installNetworkGuard: async () => { guards += 1; },
    assertSafeUrl: async (url) => url,
    now: () => time,
    setTimer: (callback) => { timeoutCallback = callback; return { unref() {} }; },
    clearTimer: () => {},
    ...overrides,
  });
  return {
    manager, context,
    create: () => manager.create({ ownerKey, targetUrl: site }),
    phase: (session, phase, work = async () => {}) => manager.runPhase({ ...session, ownerKey, targetUrl: site, phase }, work),
    stats: () => ({ releases, closes, guards, creates }),
    advance: (milliseconds) => { time += milliseconds; },
    expire: () => timeoutCallback(),
  };
}

async function checkLifecycle() {
  const test = fixture();
  const session = await test.create();
  assert.deepEqual(Object.keys(session).sort(), ['expiresAt', 'sessionId']);
  assert.ok(!JSON.stringify(session).includes(privateEndpoint));
  assert.equal(test.stats().guards, 1);
  await assert.rejects(() => test.manager.reconnect({ ...session, ownerKey }), { code: 'scan_auth_phase_invalid' });
  await assert.rejects(() => test.manager.complete({ ...session, ownerKey }), { code: 'scan_auth_not_complete' });
  await assert.rejects(() => test.phase(session, 'capture'), { code: 'scan_auth_phase_invalid' });
  await assert.rejects(() => test.manager.cancel({ ...session, ownerKey: 'user:other' }), { code: 'scan_auth_session_unavailable' });
  await assert.rejects(() => test.manager.runPhase({ ...session, ownerKey, targetUrl: 'https://other.example/', phase: 'login' }, async () => {}), { code: 'scan_auth_scope_mismatch' });
  for (const phase of ['login', 'scan', 'capture']) {
    if (phase === 'capture') await test.manager.reconnect({ ...session, ownerKey });
    const value = await test.phase(session, phase, async ({ context, signal, origin }) => {
      assert.equal(context, test.context, 'login, crawl, and capture must share the same browser context');
      assert.equal(signal.aborted, false);
      assert.equal(origin, 'https://site.example');
      return phase;
    });
    assert.equal(value, phase);
  }
  await test.manager.complete({ ...session, ownerKey });
  assert.deepEqual(test.stats(), { releases: 1, closes: 2, guards: 2, creates: 1 });
  await assert.rejects(() => test.phase(session, 'scan'), { code: 'scan_auth_session_unavailable' });

  const expired = fixture();
  const expiring = await expired.create();
  expired.advance(600001);
  await assert.rejects(() => expired.phase(expiring, 'login'), { code: 'scan_auth_session_expired' });
  assert.equal(expired.stats().releases, 1);

  const active = fixture();
  const activeSession = await active.create();
  let finish;
  let workSignal;
  const phase = active.phase(activeSession, 'login', async ({ signal }) => {
    workSignal = signal;
    await new Promise((resolve) => { finish = resolve; });
  });
  await assert.rejects(() => active.phase(activeSession, 'login'), { code: 'scan_auth_session_busy' });
  await active.manager.cancel({ ...activeSession, ownerKey });
  assert.equal(workSignal.aborted, true);
  finish();
  await assert.rejects(() => phase, { code: 'scan_auth_step_failed' });
  assert.equal(active.stats().releases, 1, 'cancellation and failed work must share cleanup');

  const midStep = fixture();
  const midSession = await midStep.create();
  await assert.rejects(() => midStep.phase(midSession, 'login', async () => { midStep.advance(600001); }), { code: 'scan_auth_step_failed' });
  assert.equal(midStep.stats().releases, 1, 'a step completing after expiry must never become ready');

  const failure = fixture();
  const failedSession = await failure.create();
  await assert.rejects(() => failure.phase(failedSession, 'login', async () => { throw new Error(privateEndpoint); }),
    (error) => error.code === 'scan_auth_step_failed' && !error.message.includes('fixture-secret'));
  assert.equal(failure.stats().releases, 1);

  const noGuard = fixture({ installNetworkGuard: async () => { throw new Error(privateEndpoint); } });
  await assert.rejects(() => noGuard.create(), { code: 'scan_auth_browser_unavailable' });
  assert.equal(noGuard.stats().releases, 1, 'guard failure must release the provider session');

  const unsafe = fixture({ assertSafeUrl: async () => { throw new Error('unsafe URL'); } });
  await assert.rejects(() => unsafe.create(), /unsafe URL/);
  assert.equal(unsafe.stats().creates, 0, 'reject unsafe sites before creating a browser');
  await assert.rejects(() => unsafe.manager.create({ ownerKey: 'anon:fixture', targetUrl: site }), { code: 'scan_auth_owner_required' });

  const timer = fixture();
  const timedSession = await timer.create();
  timer.expire();
  await timer.manager.dispose();
  await assert.rejects(() => timer.phase(timedSession, 'login'), { code: 'scan_auth_session_unavailable' });
  assert.equal(timer.stats().releases, 1);

  let releaseAttempts = 0;
  const retry = fixture({ client: {
    timeoutMs: 600000,
    create: async () => ({ id: 'fixture', connectUrl: privateEndpoint }),
    release: async () => { releaseAttempts += 1; if (releaseAttempts === 1) throw new Error(privateEndpoint); },
  } });
  const retrySession = await retry.create();
  await assert.rejects(() => retry.manager.cancel({ ...retrySession, ownerKey }), { code: 'scan_auth_provider_cleanup' });
  await retry.manager.cancel({ ...retrySession, ownerKey });
  assert.equal(releaseAttempts, 2, 'unconfirmed cleanup must remain retryable without saving credentials');

  const restarted = fixture();
  await assert.rejects(() => restarted.phase(session, 'scan'), { code: 'scan_auth_session_unavailable' });
  console.log('[scan-auth-browserbase] Ownership, scope, phase ordering, shared context, expiry, cancellation, restart rejection, cleanup, and redaction passed.');
}

async function main() { await checkContracts(); await checkLifecycle(); }
if (require.main === module) main().catch(() => { console.error('[scan-auth-browserbase] A lifecycle check failed.'); process.exitCode = 1; });
module.exports = { checkLifecycle };
