const { PRIVATE_CAPTURE_KEY, PRIVATE_CAPTURE_PREFIX, HEADER_BYTES } = require('./privateScanCapture');

function createPrivateScanCaptureCleanup({ listObjects, readHeader, removeObject, now = Date.now, batchSize = 200, concurrency = 5 }) {
  let cursor = null;
  let running = null;
  async function sweep() {
    const page = await listObjects({ prefix: PRIVATE_CAPTURE_PREFIX, cursor, limit: batchSize });
    const keys = page.keys.filter(key => PRIVATE_CAPTURE_KEY.test(key));
    const summary = { checked: 0, deleted: 0, failed: 0, more: Boolean(page.cursor) };
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, async () => {
      while (index < keys.length) {
        const key = keys[index++];
        try {
          const header = await readHeader(key, HEADER_BYTES);
          summary.checked++;
          if (!header) continue; // Another instance may already have removed it.
          if (header.length !== HEADER_BYTES || header[0] !== 1) { summary.failed++; continue; }
          const expiresAt = header.readBigUInt64BE(1);
          if (expiresAt > 0n && expiresAt <= BigInt(now())) {
            await removeObject(key);
            summary.deleted++;
          }
        } catch { summary.failed++; }
      }
    }));
    // Continue through the bucket without retaining an unbounded key list.
    // Failed objects are retried on the next full pass, including after restart.
    cursor = page.cursor;
    return summary;
  }
  return {
    run() {
      if (!running) running = sweep().finally(() => { running = null; });
      return running;
    },
  };
}

module.exports = { createPrivateScanCaptureCleanup };
