const crypto = require('node:crypto');

const PRIVATE_CAPTURE_PREFIX = 'private_scan_';
const PRIVATE_CAPTURE_KEY = /^private_scan_[a-f0-9]{48}\.bin$/;
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const MAX_RETENTION_MS = 24 * 60 * 60 * 1000;
const HEADER_BYTES = 21;

function isPrivateScanCaptureKey(key) {
  // Reserve the entire prefix, including malformed names, from public delivery.
  return String(key || '').toLowerCase().startsWith(PRIVATE_CAPTURE_PREFIX);
}

function captureError(code, message) { return Object.assign(new Error(message), { code }); }

function createPrivateScanCaptureStore({ encryptionKey, saveObject, readObject, now = Date.now }) {
  if (!/^[a-f0-9]{64}$/i.test(encryptionKey || '') || typeof saveObject !== 'function' || typeof readObject !== 'function') {
    throw captureError('private_capture_configuration', 'Private screenshot storage is not configured.');
  }
  const masterKey = Buffer.from(encryptionKey, 'hex');
  const owner = (ownerKey) => {
    if (typeof ownerKey !== 'string' || !ownerKey.startsWith('user:') || !ownerKey.slice(5).trim()) {
      throw captureError('private_capture_owner', 'Sign in to view private screenshots.');
    }
    return ownerKey;
  };
  const derive = (ownerKey, key) => crypto.hkdfSync('sha256', masterKey, Buffer.from(key), Buffer.from(`vellic-private-capture-v1:${ownerKey}`), 32);
  const mime = (buffer) => {
    if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
    if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
    return null;
  };
  return {
    async save({ ownerKey, buffer, retentionMs = MAX_RETENTION_MS }) {
      owner(ownerKey);
      if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_CAPTURE_BYTES || !mime(buffer)) {
        throw captureError('private_capture_invalid', 'The private capture must be a PNG or JPEG within the size limit.');
      }
      if (!Number.isSafeInteger(retentionMs) || retentionMs <= 0 || retentionMs > MAX_RETENTION_MS) {
        throw captureError('private_capture_retention', 'Private pilot screenshots can be retained for up to 24 hours.');
      }
      const key = `${PRIVATE_CAPTURE_PREFIX}${crypto.randomBytes(24).toString('hex')}.bin`;
      const expiresAt = now() + retentionMs;
      const header = Buffer.alloc(HEADER_BYTES);
      header[0] = 1;
      header.writeBigUInt64BE(BigInt(expiresAt), 1);
      crypto.randomFillSync(header, 9, 12);
      const cipher = crypto.createCipheriv('aes-256-gcm', derive(ownerKey, key), header.subarray(9));
      cipher.setAAD(Buffer.concat([Buffer.from(key), header]));
      const encrypted = Buffer.concat([header, cipher.update(buffer), cipher.final(), cipher.getAuthTag()]);
      // Reuse existing local/R2 storage only for ciphertext; discard its public URL.
      await saveObject({ key, buffer: encrypted, contentType: 'application/octet-stream' });
      return { key, url: `/api/private-scan-captures/${key}`, expiresAt };
    },
    async read({ ownerKey, key }) {
      owner(ownerKey);
      if (!PRIVATE_CAPTURE_KEY.test(String(key || ''))) return null;
      const object = await readObject(key);
      const encrypted = object?.buffer;
      if (!Buffer.isBuffer(encrypted) || encrypted.length < HEADER_BYTES + 16 || encrypted.length > MAX_CAPTURE_BYTES + HEADER_BYTES + 16) return null;
      try {
        const header = encrypted.subarray(0, HEADER_BYTES);
        if (header[0] !== 1 || header.readBigUInt64BE(1) <= BigInt(now())) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', derive(ownerKey, key), header.subarray(9));
        decipher.setAAD(Buffer.concat([Buffer.from(key), header]));
        decipher.setAuthTag(encrypted.subarray(-16));
        const buffer = Buffer.concat([decipher.update(encrypted.subarray(HEADER_BYTES, -16)), decipher.final()]);
        const contentType = mime(buffer);
        return contentType ? { buffer, contentType } : null;
      } catch {
        // Wrong owner, key rotation, corruption, and missing assets share the same response.
        return null;
      }
    },
  };
}

function createPrivateScanCaptureHandler({ getStore, enabled }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Vary', 'Cookie, Authorization');
    if (!req.user?.id) return res.status(401).json({ error: 'Sign in to view private screenshots.' });
    if (!enabled()) return res.status(503).json({ error: 'Private screenshot capture is not enabled.' });
    try {
      const object = await getStore().read({ ownerKey: `user:${req.user.id}`, key: req.params.filename });
      if (!object) return res.status(404).send('Not found');
      res.setHeader('Content-Type', object.contentType);
      return res.send(object.buffer);
    } catch (error) {
      if (error.code === 'private_capture_configuration') return res.status(503).json({ error: 'Private screenshot storage is not configured.' });
      return res.status(404).send('Not found');
    }
  };
}

module.exports = { createPrivateScanCaptureStore, createPrivateScanCaptureHandler, isPrivateScanCaptureKey };
