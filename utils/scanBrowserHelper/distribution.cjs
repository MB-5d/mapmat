const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const VERSION = '0.4.0';
const PROTOCOL_VERSION = 1;
function storeUrlFor(config, raw) {
  if (!raw) return null;
  const url = new URL(raw);
  if (url.origin !== 'https://chromewebstore.google.com' || url.username || url.password
    || url.search || url.hash || !url.pathname.startsWith('/detail/')
    || url.pathname.split('/').at(-1) !== config.extensionId) throw Error('Helper store URL must match its configured extension identity.');
  return url.href;
}
const extensionIdForKey = key => crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex')
  .slice(0, 32).replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
const allowed = (config, user) => !!config && (config.mode !== 'staging' || config.allowedUserIds.includes(String(user?.id)));
function readArtifact(directory, config) {
  if (!directory) return null;
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
  const file = path.resolve(directory, 'vellic-scan-helper.zip');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (metadata.version !== VERSION || metadata.extensionId !== config.extensionId
    || metadata.origin !== config.origin || metadata.appOrigin !== (config.appOrigin || config.origin)
    || metadata.sha256 !== digest) throw Error('Browser helper release does not match this environment.');
  return { ...metadata, file };
}
function installDistribution({ app, config, authenticate, requireAuth, env = process.env }) {
  if (!config) return;
  // Fail startup rather than offer a stale, mismatched, or damaged package.
  const artifact = readArtifact(env.SCAN_AUTH_HELPER_ARTIFACT_DIR, config);
  const storeUrl = storeUrlFor(config, env.SCAN_AUTH_HELPER_STORE_URL);
  const guard = (req, res, next) => allowed(config, req.user) ? next() : res.status(403).json({ error: 'Browser helper is not available for this account.' });
  app.get('/scan-auth/helper/config', authenticate, requireAuth, guard, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ enabled: true, extensionId: config.extensionId, version: VERSION,
      origin: config.origin, appOrigin: config.appOrigin || config.origin,
      downloadAvailable: !!artifact && !storeUrl, sha256: artifact?.sha256 || null,
      distribution: storeUrl ? 'webstore' : 'unpacked', storeUrl, protocolVersion: PROTOCOL_VERSION });
  });
  app.get('/scan-auth/helper/download', authenticate, requireAuth, guard, (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!artifact) return res.status(503).json({ error: 'The reviewed helper package is not available yet.' });
    res.download(artifact.file, 'vellic-scan-helper-' + VERSION + '.zip');
  });
}
module.exports = { VERSION, PROTOCOL_VERSION, storeUrlFor, extensionIdForKey, allowed, readArtifact, installDistribution };
