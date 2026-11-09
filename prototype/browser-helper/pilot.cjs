const path = require('node:path');

// Only the explicitly isolated pilot calls this. Normal runtimes are unchanged.
function installPilot({ app, express, config, authenticate, now = Date.now, buildDirectory }) {
  if (config?.mode !== 'hosted') return;
  const build = buildDirectory || path.resolve(__dirname, '../../frontend/build');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (now() >= config.expiresAt) return res.status(410).json({ error: 'This cloud test has expired.' });
    const requestOrigin = req.headers.origin;
    if (requestOrigin && requestOrigin !== config.origin && requestOrigin !== 'chrome-extension://' + config.extensionId) {
      return res.status(403).json({ error: 'Origin is not allowed for this pilot.' });
    }
    return next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, pilot: true }));
  app.use(express.static(build, { index: false, dotfiles: 'deny' }));
  app.get(['/', /^\/app(?:\/.*)?$/], (_req, res) => res.sendFile(path.join(build, 'index.html')));
  app.use(async (req, res, next) => {
    if ((req.method === 'POST' && ['/auth/login', '/auth/logout', '/scan-auth/helper/describe', '/scan-auth/helper/import'].includes(req.path))
      || (req.method === 'GET' && req.path === '/auth/config')) return next();
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Sign in to the isolated pilot first.' });
    if (user.email?.toLowerCase() !== config.ownerEmail) return res.status(403).json({ error: 'This account is not allowed in the pilot.' });
    req.user = user;
    // No signups, password resets, Google account creation, billing or admin writes.
    if (req.path.startsWith('/auth/') && !(req.path === '/auth/me' && req.method === 'GET')) {
      return res.status(403).json({ error: 'Account changes are disabled in the pilot.' });
    }
    if (/^\/api\/(admin|billing|email)(\/|$)/.test(req.path)
      && !(req.path === '/api/billing/config' && req.method === 'GET')) {
      return res.status(403).json({ error: 'This service is disabled in the pilot.' });
    }
    return next();
  });
}
module.exports = { installPilot };
