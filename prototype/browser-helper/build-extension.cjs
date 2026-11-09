const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { VERSION, extensionIdForKey } = require('../../utils/scanBrowserHelper/distribution.cjs');
const { execFileSync } = require('node:child_process');
const { hostedOrigin } = require('./config.cjs');

function buildExtension(origin, output, { publicKey, appOrigin = origin, staging = false, packageRelease = false } = {}) {
  if (staging) {
    if (origin !== 'https://api-staging.vellic.io' || appOrigin !== 'https://app-staging.vellic.io' || !publicKey) throw Error('Use the reviewed staging origin and stable public key.');
  } else { origin = hostedOrigin(origin); if (appOrigin !== origin) throw Error('Pilot app origin must match its API.'); }
  const source = path.join(__dirname, 'extension');
  if (fs.existsSync(output)) throw Error('Use a new empty output path for the reviewed helper build.');
  fs.cpSync(source, output, { recursive: true, errorOnExist: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
  // Public key pins the pilot's separate Chrome ID before deployment. No private
  // signing key is saved; this remains an explicitly approved unpacked test build.
  manifest.key = publicKey || crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  crypto.createPublicKey({ key: Buffer.from(manifest.key, 'base64'), type: 'spki', format: 'der' });
  manifest.version = VERSION;
  manifest.externally_connectable = { matches: [appOrigin + '/*'] };
  manifest.name = staging ? 'Vellic Staging Scan Helper' : 'Vellic Cloud Test Helper';
  manifest.incognito = 'split';
  manifest.description = 'Connect one chosen site to the explicitly named isolated Vellic cloud test.';
  manifest.host_permissions = [origin + '/*'];
  manifest.optional_host_permissions = ['https://*/*'];
  manifest.action.default_title = 'Connect this site to the Vellic cloud test';
  manifest.content_security_policy.extension_pages = "script-src 'self'; object-src 'none'; connect-src " + origin + ';';
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'config.js'), 'self.VELLIC_HELPER = Object.freeze(' + JSON.stringify({ origin, mode: staging ? 'staging' : 'hosted', appOrigin, allowIncognito: true, label: staging ? 'Vellic staging' : 'Isolated Vellic cloud test' }) + ');\n');
  if (packageRelease) {
    // Package only the explicit source files, never local credentials or build directories.
    const files = fs.readdirSync(output).filter(name => /\.(?:js|mjs|html|css|json)$/.test(name));
    execFileSync('zip', ['-q', path.join(output, 'vellic-scan-helper.zip'), ...files], { cwd: output });
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, 'vellic-scan-helper.zip'))).digest('hex');
    fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify({ version: VERSION, extensionId: extensionIdForKey(manifest.key), origin, appOrigin, sha256 }, null, 2));
  }
  return manifest;
}
module.exports = { buildExtension };
if (require.main === module) {
  const [origin, output] = process.argv.slice(2);
  if (!origin || !output) throw Error('Usage: node build-extension.cjs HTTPS_ORIGIN NEW_OUTPUT_DIRECTORY');
  const previous = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4])) : null;
  buildExtension(origin, path.resolve(output), { publicKey: previous?.key, appOrigin: process.argv[5] || origin, staging: origin === 'https://api-staging.vellic.io', packageRelease: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(path.resolve(output), 'manifest.json')));
  const id = crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex')
    .slice(0, 32).replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
  console.log('Prepared cloud-only helper ID: ' + id + '. Load only after approval, then verify this ID in Chrome.');
}
