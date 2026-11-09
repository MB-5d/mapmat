const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hostedOrigin } = require('./config.cjs');

function buildExtension(origin, output) {
  origin = hostedOrigin(origin);
  const source = path.join(__dirname, 'extension');
  if (fs.existsSync(output)) throw Error('Use a new empty output path for the reviewed helper build.');
  fs.cpSync(source, output, { recursive: true, errorOnExist: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
  // Public key pins the pilot's separate Chrome ID before deployment. No private
  // signing key is saved; this remains an explicitly approved unpacked test build.
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  manifest.key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  manifest.name = 'Vellic Cloud Test Helper';
  manifest.incognito = 'split';
  manifest.description = 'Connect one chosen site to the explicitly named isolated Vellic cloud test.';
  manifest.host_permissions = [origin + '/*'];
  manifest.optional_host_permissions = ['https://*/*'];
  manifest.action.default_title = 'Connect this site to the Vellic cloud test';
  manifest.content_security_policy.extension_pages = "script-src 'self'; object-src 'none'; connect-src " + origin + ';';
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'config.js'), 'self.VELLIC_HELPER = Object.freeze(' + JSON.stringify({ origin, mode: 'hosted', allowIncognito: true, label: 'Isolated Vellic cloud test' }) + ');\n');
  return manifest;
}
module.exports = { buildExtension };
if (require.main === module) {
  const [origin, output] = process.argv.slice(2);
  if (!origin || !output) throw Error('Usage: node build-extension.cjs HTTPS_ORIGIN NEW_OUTPUT_DIRECTORY');
  buildExtension(origin, path.resolve(output));
  const manifest = JSON.parse(fs.readFileSync(path.join(path.resolve(output), 'manifest.json')));
  const id = crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex')
    .slice(0, 32).replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
  console.log('Prepared cloud-only helper ID: ' + id + '. Load only after approval, then verify this ID in Chrome.');
}
