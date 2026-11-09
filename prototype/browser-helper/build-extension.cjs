const fs = require('node:fs');
const path = require('node:path');
const { hostedOrigin } = require('./config.cjs');

function buildExtension(origin, output) {
  origin = hostedOrigin(origin);
  const source = path.join(__dirname, 'extension');
  if (fs.existsSync(output)) throw Error('Use a new empty output path for the reviewed helper build.');
  fs.cpSync(source, output, { recursive: true, errorOnExist: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
  // A different fixed key keeps this build separate from the installed local helper.
  delete manifest.key;
  manifest.name = 'Vellic Cloud Test Helper';
  manifest.description = 'Connect one chosen site to the explicitly named isolated Vellic cloud test.';
  manifest.host_permissions = [origin + '/*'];
  manifest.optional_host_permissions = ['https://*/*'];
  manifest.action.default_title = 'Connect this site to the Vellic cloud test';
  manifest.content_security_policy.extension_pages = "script-src 'self'; object-src 'none'; connect-src " + origin + ';';
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'config.js'), 'self.VELLIC_HELPER = Object.freeze(' + JSON.stringify({ origin, mode: 'hosted', label: 'Isolated Vellic cloud test' }) + ');\n');
  return manifest;
}
module.exports = { buildExtension };
if (require.main === module) {
  const [origin, output] = process.argv.slice(2);
  if (!origin || !output) throw Error('Usage: node build-extension.cjs HTTPS_ORIGIN NEW_OUTPUT_DIRECTORY');
  buildExtension(origin, path.resolve(output));
  console.log('Prepared cloud-only helper. Load only after approval; set its exact Chrome ID on the pilot.');
}
