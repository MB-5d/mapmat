const crypto = require('node:crypto');
const { targetUrl, validateState } = require('./policy.cjs');

function createBrowserHelper({ app, sessions, createContext, expired, now = Date.now }) {
  if (process.env.SCAN_AUTH_BROWSER_HELPER !== 'true') return null;
  if (process.env.NODE_ENV !== 'test' || process.env.HOST !== '127.0.0.1'
    || process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.VERCEL) {
    throw Error('Browser helper is restricted to the isolated local test backend.');
  }
  const extensionId = process.env.SCAN_AUTH_HELPER_EXTENSION_ID;
  if (!/^[a-p]{32}$/.test(extensionId || '')) throw Error('Set the exact browser helper extension ID.');
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const find = req => {
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
      destination: 'Local Vellic only — http://127.0.0.1:4349' });
  });
  app.post('/scan-auth/helper/import', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = find(req);
    if (!session || session.helperImporting || session.browserContext) {
      return res.status(410).json({ error: 'Pairing is expired, used, or cancelled.' });
    }
    let context;
    try {
      if (req.body?.origin !== session.origin) throw Error('The selected site does not match this scan.');
      const state = validateState(req.body?.storageState, session.origin, now());
      session.helperImporting = true;
      session.helperDigest = null; // Consume before asynchronous work; retries need a new pairing.
      context = await createContext(state, undefined, session);
      if (sessions.get(session.id) !== session || expired(session) || session.helperExpiresAt <= now()) throw Error('Login was cancelled or expired.');
      session.browserContext = context;
      session.helperPending = false;
      session.helperImported = true;
      return res.json({ imported: true, message: 'Return to Vellic and choose Use this login to verify access.' });
    } catch {
      await context?.close().catch(() => {});
      return res.status(409).json({ error: 'The session could not be imported. Close the login dialog and start again.' });
    } finally {
      session.helperImporting = false;
    }
  });
  return {
    start(session) {
      targetUrl(session.seedUrl, process.env.SCAN_AUTH_HELPER_ALLOW_FIXTURE === 'true');
      const token = crypto.randomBytes(32).toString('hex');
      session.helperDigest = hash(token);
      session.helperExpiresAt = Math.min(session.expiresAt, now() + 5 * 60 * 1000);
      session.helperPending = true;
      session.status = 'interactive';
      if (!session.sampleUrls.length) session.sampleUrls = [session.seedUrl];
      return { sessionId: session.id, status: 'interactive', interactiveSupported: true,
        helperPairingCode: token, helperExpiresAt: session.helperExpiresAt, origin: session.origin };
    },
  };
}

module.exports = { createBrowserHelper };
