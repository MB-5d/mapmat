// Read-only checks of the latest scan performed through the local Vellic UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Database = require('better-sqlite3');

(async () => {
  const directory = '/private/tmp/vellic-protected-site-live';
  const account = JSON.parse(fs.readFileSync(directory + '/account.json', 'utf8'));
  const db = new Database(directory + '/lab.db', { readonly: true });
  const row = db.prepare('SELECT root_data, orphans_data, scanned_at FROM scan_history WHERE url = ? ORDER BY scanned_at DESC LIMIT 1').get('http://localhost:4399/');
  db.close();
  assert(row, 'No completed local UI scan found');
  const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
  const nodes = [...flatten(JSON.parse(row.root_data)), ...JSON.parse(row.orphans_data || '[]').flatMap(flatten)];
  const expected = ['/members', '/members/about', '/members/projects', '/members/projects/sample'];
  for (const path of expected) {
    const page = nodes.find(node => node.url === 'http://localhost:4399' + path);
    assert(page, 'Missing protected page: ' + path);
    assert.equal(page.httpStatus, 200);
    assert(!page.authRequired);
    assert(page.thumbnailUrl?.startsWith('/api/private-scan-captures/'));
    const url = new URL(page.thumbnailUrl, 'http://127.0.0.1:4349');
    assert.equal(url.origin, 'http://127.0.0.1:4349');
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: 'Bearer ' + account.token } })).status, 200);
  }
  const report = { scannedAt: row.scanned_at, protectedPages: expected.length, protectedPagesHttp200: true, protectedThumbnails: expected.length, anonymousImagesDenied: true, ownerImagesAccessible: true };
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
