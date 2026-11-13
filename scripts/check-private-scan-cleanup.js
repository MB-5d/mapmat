const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPrivateScanCaptureCleanup } = require('../utils/privateScanCaptureCleanup');
const key = n => `private_scan_${n.toString(16).padStart(48, '0')}.bin`;
const header = expires => { const b = Buffer.alloc(21); b[0] = 1; b.writeBigUInt64BE(BigInt(expires), 1); return b; };
async function main() {
  const objects = new Map([[key(1), header(100)], [key(2), header(101)], [key(3), header(99)],
    [key(4), Buffer.from('bad')], ['public.png', header(1)], ['private_scan_malformed.bin', header(1)]]);
  let failedOnce = false;
  const options = {
    now: () => 100, batchSize: 2,
    listObjects: async ({ cursor, limit }) => {
      const keys = [...objects.keys()].sort().filter(k => !cursor || k > cursor);
      const page = keys.slice(0, limit); return { keys: page, cursor: keys.length > limit ? page.at(-1) : null };
    },
    readHeader: async k => objects.get(k),
    removeObject: async k => { if (k === key(3) && !failedOnce) { failedOnce = true; throw new Error('temporary provider failure'); } objects.delete(k); },
  };
  const sweep = createPrivateScanCaptureCleanup(options);
  const first = sweep.run(); assert.equal(sweep.run(), first, 'overlapping sweeps coalesce');
  assert.equal((await first).deleted, 1, 'expiry boundary is inclusive');
  assert.equal((await sweep.run()).failed, 2, 'invalid headers and provider failures are visible');
  await sweep.run(); // Exhaust the prefix before restarting the cursor.
  await sweep.run();
  assert(!objects.has(key(3)), 'failed deletion is retried on the next pass');
  assert(objects.has(key(2)), 'unexpired private image must survive');
  assert(objects.has('public.png') && objects.has('private_scan_malformed.bin'), 'never remove public or malformed keys');
  const restarted = createPrivateScanCaptureCleanup({ ...options, now: () => 101 });
  await restarted.run(); assert(!objects.has(key(2)), 'restart discovers newly expired files');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-private-cleanup-'));
  try {
    process.env.SCREENSHOT_STORAGE_PROVIDER = 'local'; process.env.SCREENSHOT_STORAGE_DIR = dir;
    const storage = require('../utils/screenshotStorage');
    for (let n = 1; n <= 3; n++) await storage.saveScreenshotObject({ key: key(n), buffer: header(n === 2 ? 101 : 99) });
    await storage.saveScreenshotObject({ key: 'public.png', buffer: header(1) });
    const local = createPrivateScanCaptureCleanup({ listObjects: storage.listScreenshotObjects, readHeader: storage.readScreenshotObjectPrefix,
      removeObject: storage.removeScreenshotObject, now: () => 100, batchSize: 1 });
    await local.run(); await local.run(); await local.run();
    assert.deepEqual(fs.readdirSync(dir).sort(), [key(2), 'public.png'].sort());
    // A symlink must not cause the local reader to inspect files outside storage.
    fs.symlinkSync(path.join(dir, 'public.png'), path.join(dir, key(9)));
    await assert.rejects(() => storage.readScreenshotObjectPrefix(key(9), 21));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  delete require.cache[require.resolve('../utils/screenshotStorage')];
  process.env.SCREENSHOT_STORAGE_PROVIDER = 'r2'; process.env.R2_BUCKET = 'test-bucket'; process.env.R2_ENDPOINT = 'https://r2.test';
  process.env.R2_ACCESS_KEY_ID = 'fixture-access'; process.env.R2_SECRET_ACCESS_KEY = 'fixture-secret';
  const originalFetch = global.fetch;
  try {
    const calls = [];
    global.fetch = async (raw, options) => {
      const url = new URL(raw); calls.push({ url, options });
      assert(options.headers.authorization.startsWith('AWS4-HMAC-SHA256 '));
      if (url.searchParams.get('list-type') === '2') return new Response(`<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>${key(1)}</Key></Contents><NextContinuationToken>a+b/=&amp;</NextContinuationToken></ListBucketResult>`);
      if (options.method === 'DELETE') return new Response(null, { status: 204 });
      assert.equal(options.headers.range, 'bytes=0-20');
      return new Response(header(99), { status: 206, headers: { 'content-length': '21' } });
    };
    const r2 = require('../utils/screenshotStorage');
    const page = await r2.listScreenshotObjects({ prefix: 'private_scan_', cursor: 'a+b/=&', limit: 2 });
    assert.equal(page.cursor, 'a+b/=&'); assert.deepEqual(page.keys, [key(1)]);
    assert.equal(calls[0].url.searchParams.get('continuation-token'), 'a+b/=&');
    assert.equal(calls[0].url.pathname, '/test-bucket');
    assert.deepEqual(await r2.readScreenshotObjectPrefix(key(1), 21), header(99));
    await r2.removeScreenshotObject(key(1));
    assert.equal(calls.at(-1).options.method, 'DELETE');
    global.fetch = async () => new Response('Denied', { status: 403 });
    await assert.rejects(() => r2.listScreenshotObjects({ prefix: 'private_scan_' }));
    await assert.rejects(() => r2.removeScreenshotObject(key(1)));
    await assert.rejects(() => r2.readScreenshotObjectPrefix(key(1), 21));
  } finally { global.fetch = originalFetch; fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('[private-cleanup] Expiry, active/public isolation, pagination, retry, overlap, restart, local files, and R2 requests passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
