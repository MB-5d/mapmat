const path = require('node:path');
const { buildExtension } = require('../prototype/browser-helper/build-extension.cjs');
const { extensionIdForKey } = require('../utils/scanBrowserHelper/distribution.cjs');
const { key } = require('../extensions/scan-helper/staging-key.json');
if (!process.argv[2]) throw Error('Pass a new output directory for the staging package.');
const manifest = buildExtension('https://api-staging.vellic.io', path.resolve(process.argv[2]), {
  publicKey: key, appOrigin: 'https://app-staging.vellic.io', staging: true, packageRelease: true,
});
console.log('Built reviewed staging helper ' + manifest.version + ' (' + extensionIdForKey(key) + ').');
