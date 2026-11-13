const crypto = require('node:crypto');
const { targetUrl, validateState } = require('./policy.cjs');
const { helperConfig } = require('./config.cjs');

function createBrowserHelper({ app, sessions, createContext, expired, now = Date.now }) {
  const config = helperConfig();
  if (!config) return null;
  const { extensionId } = config;
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const find = req => {
    if (config.expiresAt && config.expiresAt <= now()) return null;
    if (req.headers.origin !== 'chrome-extension://' + extensionId) return null;
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const digest = hash(token);
    return [...sessions.values()].find(session => session.helperDigest === digest
      && session.helperExpiresAt > now() && !expired(session) && !session.jobId);
  };
  app.post('/scan-auth/helper/describe', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = find(req);
    if (!session) return res.status(410).json({ error: 'Pairing expired or was cancelled. Start again in Vellic.' });
    return res.json({ origin: session.origin, targetUrl: session.seedUrl, expiresAt: session.helperExpiresAt,
      destination: config.destination, helperOrigin: config.origin });
  });
  app.post('/scan-auth/helper/import', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = find(req);
    if (!session || session.helperImporting || session.browserContext) {
      return res.status(410).json({ error: 'Pairing is expired, used, or cancelled.' });
    }
    let context;
    let disconnected = Boolean(req.aborted || res.destroyed);
    const disconnect = () => {
      if (!res.writableEnded) {
        disconnected = true;
        session.helperDigest = null;
        sessions.delete(session.id);
        context?.close().catch(() => {});
      }
    };
    res.once?.('close', disconnect);
    if (disconnected) disconnect();
    try {
      if (disconnected) throw Error('Connection interrupted.');
      if (req.body?.origin !== session.origin) throw Error('The selected site does not match this scan.');
      const state = validateState(req.body?.storageState, session.origin, now());
      session.helperImporting = true;
      session.helperDigest = null; // Consume before asynchronous work; retries need a new pairing.
      context = await createContext(state, undefined, session);
      if (disconnected || sessions.get(session.id) !== session || expired(session) || session.helperExpiresAt <= now()) throw Error('Login was cancelled or expired.');
      session.browserContext = context;
      session.helperPending = false;
      session.helperImported = true;
      return res.json({ imported: true, message: 'Return to Vellic and choose Use this login to verify access.' });
    } catch {
      await context?.close().catch(() => {});
      if (disconnected) return;
      return res.status(409).json({ error: 'The session could not be imported. Close the login dialog and start again.' });
    } finally {
      res.removeListener?.('close', disconnect);
      session.helperImporting = false;
    }
  });
  return {
    start(session) {
      if (config.expiresAt && config.expiresAt <= now()) throw Error('This hosted pilot has expired.');
      targetUrl(session.seedUrl, process.env.SCAN_AUTH_HELPER_ALLOW_FIXTURE === 'true');
      const token = crypto.randomBytes(32).toString('hex');
      session.helperDigest = hash(token);
      session.helperExpiresAt = Math.min(session.expiresAt, now() + 5 * 60 * 1000);
      session.helperPending = true;
      session.helperNavigationScope = session.seedUrl;
      session.status = 'interactive';
      if (!session.sampleUrls.length) session.sampleUrls = [session.seedUrl];
      return { sessionId: session.id, status: 'interactive', interactiveSupported: true,
        helperPairingCode: token, helperExpiresAt: session.helperExpiresAt, origin: session.origin };
    },
  };
}

module.exports = { createBrowserHelper };
