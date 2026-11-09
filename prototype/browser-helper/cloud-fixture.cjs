// Disposable public HTTPS target for lifecycle tests. Never installed in normal app mode.
const crypto = require('node:crypto');
function installCloudFixture({ app, config, authenticate }) {
  if (config?.mode !== 'hosted' || process.env.SCAN_AUTH_HELPER_CLOUD_FIXTURE !== 'true') return;
  const token = crypto.randomBytes(32).toString('hex');
  const requests = [];
  let slow = false, importDelay = 0;
  const root = '/__helper-fixture';
  const cookieName = 'vellic_disposable_fixture';
  app.get(root + '/state', async (req, res) => {
    const user = await authenticate(req);
    res.setHeader('Cache-Control', 'no-store');
    if (user?.email?.toLowerCase() !== config.ownerEmail) return res.status(401).end();
    res.json({ token, cookieName, requests, slow, origin: config.origin });
  });
  app.post(root + '/slow', require('express').json({ limit: '1kb' }), async (req, res) => {
    const user = await authenticate(req);
    if (user?.email?.toLowerCase() !== config.ownerEmail) return res.status(401).end();
    slow = req.body?.enabled === true; importDelay = req.body?.delayImport === true ? 15000 : 0; requests.length = 0; res.json({ slow, importDelay });
  });
  app.use('/scan-auth/helper/import', require('express').json({ limit: '1mb' }), (req, _res, next) => {
    if (importDelay && req.body?.origin === config.origin) setTimeout(next, importDelay); else next();
  });
  app.get(root + '/login', (_req, res) => res.set('Referrer-Policy', 'same-origin').type('html').send('<h1>Disposable helper test</h1><p>This contains no account or private information.</p><form method="post"><button>Sign in to test pages</button></form>'));
  app.post(root + '/login', (_req, res) => {
    res.cookie(cookieName, token, { secure: true, httpOnly: true, sameSite: 'lax', path: root, maxAge: 3600000 });
    res.redirect(root + '/members');
  });
  app.get(new RegExp('^' + root + '/members(?:/page-\\d+)?$'), (req, res) => {
    const unlocked = String(req.headers.cookie || '').split(';').some(value => value.trim() === cookieName + '=' + token);
    requests.push({ at: Date.now(), unlocked, path: req.path });
    if (requests.length > 5000) requests.shift();
    res.setHeader('Cache-Control', 'no-store');
    if (!unlocked) return res.status(401).type('html').send('<h1>Login required</h1><a href="' + root + '/login">Sign in</a>');
    const page = Number(req.path.match(/page-(\d+)/)?.[1] || 0);
    const content = `<html><title>Disposable protected page ${page}</title><main><h1>Protected test content ${page}</h1><p>Cloud interruption and expiry validation. No real account data.</p>`
      + (page === 0 ? Array.from({ length: 19 }, (_, i) => `<a href="${root}/members/page-${i + 1}">Test page ${i + 1}</a>`).join('') : '') + '</main></html>';
    const timer = setTimeout(() => { if (!res.destroyed) res.type('html').send(content); }, slow && page > 0 ? 19000 : 0);
    res.on('close', () => clearTimeout(timer));
  });
}
module.exports = { installCloudFixture };
