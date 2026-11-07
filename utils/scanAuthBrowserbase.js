const crypto = require('node:crypto');

const API_BASE = 'https://api.browserbase.com/v1/sessions';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = new Set(['COMPLETED', 'TIMED_OUT', 'ERROR']);

function browserbaseError(code, message) {
  return Object.assign(new Error(message), { code });
}

function createBrowserbaseClient({ apiKey, projectId, fetchImpl = fetch, timeoutSeconds = 600 }) {
  if (!apiKey || !UUID.test(projectId || '')) {
    throw browserbaseError('scan_auth_provider_configuration', 'The temporary browser is not configured.');
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 60 || timeoutSeconds > 600) {
    throw browserbaseError('scan_auth_provider_configuration', 'The temporary browser timeout must be between one and ten minutes.');
  }
  const request = async (url, method, body) => {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { 'X-BB-API-Key': apiKey, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw browserbaseError('scan_auth_provider_connection', 'The temporary browser did not respond. Any session created expires within ten minutes.');
    }
    if (!response.ok) {
      throw browserbaseError('scan_auth_provider_rejected', `The temporary browser rejected the request (HTTP ${response.status}).`);
    }
    try { return await response.json(); } catch {
      throw browserbaseError('scan_auth_provider_response', 'The temporary browser returned an invalid response.');
    }
  };
  const release = async (id) => {
    if (!UUID.test(id || '')) throw browserbaseError('scan_auth_provider_session', 'Invalid temporary browser identifier.');
    await request(`${API_BASE}/${id}`, 'POST', { status: 'REQUEST_RELEASE' });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await request(`${API_BASE}/${id}`, 'GET');
      if (TERMINAL_STATUSES.has(result.status)) return;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw browserbaseError('scan_auth_provider_cleanup', 'Browser closure was requested but is not confirmed.');
  };
  return {
    timeoutMs: timeoutSeconds * 1000,
    release,
    async create(targetUrl) {
      let target;
      try {
        target = new URL(targetUrl);
        if (target.protocol !== 'https:' || target.username || target.password) throw new Error();
      } catch {
        throw browserbaseError('scan_auth_provider_scope', 'A valid HTTPS site is required.');
      }
      const result = await request(API_BASE, 'POST', {
        projectId,
        timeout: timeoutSeconds,
        keepAlive: true,
        browserSettings: {
          viewport: { width: 1365, height: 900 },
          recordSession: false,
          logSession: false,
          solveCaptchas: false,
          ignoreCertificateErrors: false,
          // Provider allowlisting covers main-frame navigation only, not network isolation.
          allowedDomains: [target.hostname],
        },
      });
      if (!UUID.test(result.id || '')) {
        throw browserbaseError('scan_auth_provider_session', 'The provider returned no valid session identifier. Check provider cleanup before retrying.');
      }
      try {
        const endpoint = new URL(result.connectUrl);
        if (endpoint.protocol !== 'wss:' || endpoint.username || endpoint.password
          || !(endpoint.hostname === 'connect.browserbase.com' || endpoint.hostname.endsWith('.browserbase.com'))) throw new Error();
      } catch {
        await release(result.id);
        throw browserbaseError('scan_auth_provider_endpoint', 'The temporary browser returned an unexpected connection endpoint.');
      }
      return { id: result.id, connectUrl: result.connectUrl };
    },
  };
}

// In-memory, single-job ownership. Restart recovery and safe artifact storage belong
// to the application integration; neither credentials nor endpoints go in job payloads.
function createBrowserbaseScanSessionManager({ client, connect, installNetworkGuard, assertSafeUrl,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!client || !Number.isFinite(client.timeoutMs) || client.timeoutMs <= 0 || typeof connect !== 'function' || typeof installNetworkGuard !== 'function' || typeof assertSafeUrl !== 'function') {
    throw browserbaseError('scan_auth_provider_configuration', 'Browser connection and network protection are required.');
  }
  const sessions = new Map();
  const access = (id, ownerKey) => {
    const session = sessions.get(id);
    if (!session || session.ownerKey !== ownerKey) throw browserbaseError('scan_auth_session_unavailable', 'This temporary login is missing or no longer available.');
    return session;
  };
  const close = async (session, reason) => {
    if (session.closing) return session.closing;
    session.status = reason;
    clearTimer(session.timer);
    session.controller.abort();
    session.closing = (async () => {
      try {
        await session.browser?.close().catch(() => {});
        await client.release(session.providerId);
        session.browser = null;
        session.context = null;
        sessions.delete(session.id);
        session.connectUrl = null;
      } catch {
        session.browser = null;
        session.context = null;
        session.status = 'cleanup_failed';
        session.closing = null;
        session.connectUrl = null;
        throw browserbaseError('scan_auth_provider_cleanup', 'Browser closure could not be confirmed. Retry cleanup before another scan.');
      }
    })();
    return session.closing;
  };
  return {
    async create({ ownerKey, targetUrl }) {
      if (typeof ownerKey !== 'string' || !ownerKey.startsWith('user:') || !ownerKey.slice(5).trim()) {
        throw browserbaseError('scan_auth_owner_required', 'Sign in to Vellic before connecting a temporary browser.');
      }
      const safeUrl = await assertSafeUrl(targetUrl);
      const origin = new URL(safeUrl).origin;
      const createdAt = now();
      const remote = await client.create(safeUrl);
      const session = {
        id: crypto.randomBytes(18).toString('hex'), ownerKey, origin,
        providerId: remote.id, connectUrl: remote.connectUrl, expiresAt: createdAt + client.timeoutMs,
        controller: new AbortController(), status: 'login', busy: false,
      };
      sessions.set(session.id, session);
      try {
        session.browser = await connect(remote.connectUrl);
        session.context = session.browser.contexts()[0];
        if (!session.context) throw new Error();
        await installNetworkGuard(session.context, assertSafeUrl);
        if (now() >= session.expiresAt) throw new Error();
        session.timer = setTimer(() => {
          // Provider TTL still bounds a session if cleanup cannot reach its API.
          close(session, 'expired').catch(() => {});
        }, session.expiresAt - now());
        session.timer?.unref?.();
        return { sessionId: session.id, expiresAt: session.expiresAt };
      } catch {
        await close(session, 'failed');
        throw browserbaseError('scan_auth_browser_unavailable', 'The temporary browser could not be prepared safely.');
      }
    },
    async runPhase({ sessionId, ownerKey, targetUrl, phase }, work) {
      const session = access(sessionId, ownerKey);
      let origin;
      try { origin = new URL(targetUrl).origin; } catch {}
      if (origin !== session.origin) throw browserbaseError('scan_auth_scope_mismatch', 'This login belongs to another site.');
      if (session.busy) throw browserbaseError('scan_auth_session_busy', 'This login is already in use.');
      if (session.closing || now() >= session.expiresAt) {
        await close(session, 'expired');
        throw browserbaseError('scan_auth_session_expired', 'The temporary login expired. Sign in again.');
      }
      const expected = { login: 'login', scan: 'ready', capture: 'scanned' }[phase];
      if (!expected || session.status !== expected) throw browserbaseError('scan_auth_phase_invalid', 'This scan step is not ready.');
      session.busy = true;
      try {
        const result = await work({ context: session.context, signal: session.controller.signal, origin: session.origin });
        if (session.controller.signal.aborted || now() >= session.expiresAt) {
          throw browserbaseError('scan_auth_session_expired', 'The temporary login ended before this step finished.');
        }
        session.status = { login: 'ready', scan: 'scanned', capture: 'captured' }[phase];
        return result;
      } catch (error) {
        await close(session, 'failed');
        // Browser errors can include cookies, submitted passwords, or connection URLs.
        throw browserbaseError('scan_auth_step_failed', 'The authenticated step did not finish. Sign in again and retry.');
      } finally {
        session.busy = false;
      }
    },
    async complete({ sessionId, ownerKey }) {
      const session = access(sessionId, ownerKey);
      if (session.busy || session.status !== 'captured') throw browserbaseError('scan_auth_not_complete', 'The scan and requested captures have not finished.');
      await close(session, 'completed');
    },
    async reconnect({ sessionId, ownerKey }) {
      const session = access(sessionId, ownerKey);
      if (session.busy || session.closing) throw browserbaseError('scan_auth_session_busy', 'This login is already in use.');
      if (now() >= session.expiresAt) {
        await close(session, 'expired');
        throw browserbaseError('scan_auth_session_expired', 'The temporary login expired. Sign in again.');
      }
      if (!['ready', 'scanned', 'captured'].includes(session.status)) {
        throw browserbaseError('scan_auth_phase_invalid', 'Finish signing in before reconnecting this scan.');
      }
      session.busy = true;
      try {
        await session.browser.close();
        session.browser = await connect(session.connectUrl);
        if (session.controller.signal.aborted) {
          await session.browser.close().catch(() => {});
          throw new Error();
        }
        session.context = session.browser.contexts()[0];
        if (!session.context) throw new Error();
        await installNetworkGuard(session.context, assertSafeUrl);
        if (session.controller.signal.aborted || now() >= session.expiresAt) throw new Error();
      } catch {
        await close(session, 'failed');
        throw browserbaseError('scan_auth_browser_unavailable', 'The temporary browser could not reconnect safely.');
      } finally {
        session.busy = false;
      }
    },
    async cancel({ sessionId, ownerKey }) {
      await close(access(sessionId, ownerKey), 'canceled');
    },
    async dispose() {
      const results = await Promise.allSettled([...sessions.values()].map((session) => close(session, 'stopped')));
      if (results.some((result) => result.status === 'rejected')) throw browserbaseError('scan_auth_provider_cleanup', 'One or more browser closures could not be confirmed.');
    },
  };
}

module.exports = { createBrowserbaseClient, createBrowserbaseScanSessionManager };
