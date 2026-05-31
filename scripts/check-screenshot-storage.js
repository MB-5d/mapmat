const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vellic-screenshot-storage-'));
process.env.SCREENSHOT_STORAGE_PROVIDER = 'local';
process.env.SCREENSHOT_STORAGE_DIR = tempDir;

const {
  SCREENSHOT_LOCAL_DIR,
  buildPublicUrl,
  extractScreenshotStorageKey,
  readScreenshotJson,
  readScreenshotObject,
  removeLocalScreenshotFile,
  saveScreenshotJson,
  saveScreenshotObject,
  statScreenshotObject,
} = require('../utils/screenshotStorage');

async function run() {
  assert.strictEqual(SCREENSHOT_LOCAL_DIR, tempDir);

  const imageKey = `${'a'.repeat(64)}_thumb_small_v3.jpg`;
  const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
  const url = await saveScreenshotObject({
    key: imageKey,
    buffer: imageBuffer,
    contentType: 'image/jpeg',
    baseUrl: 'http://127.0.0.1:4002',
  });

  assert.strictEqual(url, buildPublicUrl(imageKey, 'http://127.0.0.1:4002'));
  assert.strictEqual(extractScreenshotStorageKey(url), imageKey);

  const stats = await statScreenshotObject(imageKey);
  assert(stats && stats.size === imageBuffer.length, 'saved image should be stat-able');

  const object = await readScreenshotObject(imageKey);
  assert.deepStrictEqual(object.buffer, imageBuffer);
  assert.strictEqual(object.contentType, 'image/jpeg');

  const metaKey = `${imageKey}.json`;
  await saveScreenshotJson({
    key: metaKey,
    value: { url: 'https://example.com', width: 1200 },
    baseUrl: 'http://127.0.0.1:4002',
  });
  const metadata = await readScreenshotJson(metaKey);
  assert.strictEqual(metadata.width, 1200);

  await removeLocalScreenshotFile(imageKey);
  const missing = await statScreenshotObject(imageKey);
  assert.strictEqual(missing, null);

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('Screenshot storage adapter check passed');
}

run().catch((error) => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors.
  }
  console.error(error);
  process.exit(1);
});
