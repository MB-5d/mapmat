const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const SCREENSHOT_PUBLIC_BASE = '/screenshots';
const railwayVolumeDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_VOLUME_PATH || null;
const SCREENSHOT_LOCAL_DIR = process.env.SCREENSHOT_STORAGE_DIR
  || process.env.SCREENSHOT_DIR
  || (railwayVolumeDir ? path.join(railwayVolumeDir, 'screenshots') : path.join(__dirname, '..', 'screenshots'));
const SCREENSHOT_STORAGE_PROVIDER = String(process.env.SCREENSHOT_STORAGE_PROVIDER || 'local').trim().toLowerCase();

const R2_BUCKET = process.env.R2_BUCKET || process.env.SCREENSHOT_R2_BUCKET || '';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_ENDPOINT = String(
  process.env.R2_ENDPOINT
  || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')
).replace(/\/+$/, '');

const isR2Selected = () => SCREENSHOT_STORAGE_PROVIDER === 'r2';

const isR2Configured = () => (
  isR2Selected()
  && R2_BUCKET
  && R2_ENDPOINT
  && R2_ACCESS_KEY_ID
  && R2_SECRET_ACCESS_KEY
);

function assertR2Configured() {
  if (!isR2Configured()) {
    throw new Error('R2 screenshot storage is selected but not fully configured');
  }
}

function ensureLocalDir() {
  if (!fs.existsSync(SCREENSHOT_LOCAL_DIR)) {
    fs.mkdirSync(SCREENSHOT_LOCAL_DIR, { recursive: true });
  }
}

ensureLocalDir();

function normalizeStorageKey(key) {
  const normalized = path.basename(String(key || '').trim());
  if (!normalized || normalized !== String(key || '').trim()) {
    throw new Error('Invalid screenshot storage key');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error('Invalid screenshot storage key');
  }
  return normalized;
}

function extractScreenshotStorageKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const extractFromPath = (candidate) => {
    const cleaned = String(candidate || '').split(/[?#]/)[0];
    const marker = `${SCREENSHOT_PUBLIC_BASE}/`;
    const markerIndex = cleaned.indexOf(marker);
    const basename = markerIndex >= 0
      ? path.basename(cleaned.slice(markerIndex + marker.length))
      : path.basename(cleaned);
    try {
      return normalizeStorageKey(decodeURIComponent(basename));
    } catch {
      return '';
    }
  };

  try {
    return extractFromPath(new URL(raw).pathname);
  } catch {
    return extractFromPath(raw);
  }
}

function buildPublicUrl(key, baseUrl) {
  const safeKey = normalizeStorageKey(key);
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  return `${normalizedBase}${SCREENSHOT_PUBLIC_BASE}/${encodeURIComponent(safeKey)}`;
}

function getScreenshotStorageProvider() {
  return isR2Selected() ? 'r2' : 'local';
}

function getContentTypeForKey(key) {
  const ext = path.extname(String(key || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function dateStamp(amzDateValue) {
  return amzDateValue.slice(0, 8);
}

function signingKey(secretKey, dateValue) {
  const kDate = hmac(`AWS4${secretKey}`, dateValue);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function encodeKey(key) {
  return String(key || '').split('/').map(encodeURIComponent).join('/');
}

function signedR2Request({ method, key, query = {}, extraHeaders = {}, body = Buffer.alloc(0), contentType = 'application/octet-stream' }) {
  const safeKey = key === undefined ? null : normalizeStorageKey(key);
  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''));
  const bodyHash = hash(bodyBuffer);
  const now = amzDate();
  const dateValue = dateStamp(now);
  const host = new URL(R2_ENDPOINT).host;
  const canonicalUri = `/${encodeURIComponent(R2_BUCKET)}${safeKey === null ? '' : `/${encodeKey(safeKey)}`}`;
  const encodeQuery = (value) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const canonicalQuery = Object.entries(query).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeQuery(name)}=${encodeQuery(value)}`).join('&');
  const headers = {
    ...extraHeaders,
    host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': now,
  };
  if (method === 'PUT') {
    headers['content-type'] = contentType;
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');
  const credentialScope = `${dateValue}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    now,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');
  const signature = hmac(signingKey(R2_SECRET_ACCESS_KEY, dateValue), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestHeaders = {
    ...headers,
    authorization,
  };
  delete requestHeaders.host;

  return {
    url: `${R2_ENDPOINT}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`,
    headers: requestHeaders,
    body: method === 'HEAD' ? undefined : bodyBuffer,
  };
}

async function putR2Object(key, buffer, contentType) {
  assertR2Configured();
  const request = signedR2Request({
    method: 'PUT',
    key,
    body: buffer,
    contentType,
  });
  const response = await fetch(request.url, {
    method: 'PUT',
    headers: request.headers,
    body: request.body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`R2 upload failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}

async function headR2Object(key) {
  assertR2Configured();
  const request = signedR2Request({ method: 'HEAD', key });
  const response = await fetch(request.url, {
    method: 'HEAD',
    headers: request.headers,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 metadata read failed (${response.status})`);
  }
  const modified = response.headers.get('last-modified');
  const size = Number(response.headers.get('content-length') || 0);
  return {
    mtimeMs: modified ? new Date(modified).getTime() : Date.now(),
    size: Number.isFinite(size) ? size : 0,
    contentType: response.headers.get('content-type') || getContentTypeForKey(key),
  };
}

async function getR2Object(key) {
  assertR2Configured();
  const request = signedR2Request({ method: 'GET', key });
  const response = await fetch(request.url, {
    method: 'GET',
    headers: request.headers,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 object read failed (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    buffer,
    size: buffer.length,
    contentType: response.headers.get('content-type') || getContentTypeForKey(key),
  };
}

async function saveScreenshotObject({ key, buffer, contentType, baseUrl }) {
  const safeKey = normalizeStorageKey(key);
  if (isR2Selected()) {
    await putR2Object(safeKey, buffer, contentType || getContentTypeForKey(safeKey));
    return buildPublicUrl(safeKey, baseUrl);
  }
  ensureLocalDir();
  await fs.promises.writeFile(path.join(SCREENSHOT_LOCAL_DIR, safeKey), buffer);
  return buildPublicUrl(safeKey, baseUrl);
}

async function saveScreenshotJson({ key, value, baseUrl }) {
  const buffer = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
  return saveScreenshotObject({
    key,
    buffer,
    contentType: 'application/json; charset=utf-8',
    baseUrl,
  });
}

async function readScreenshotJson(key) {
  const safeKey = normalizeStorageKey(key);
  try {
    let raw = null;
    if (isR2Selected()) {
      const object = await getR2Object(safeKey);
      raw = object?.buffer?.toString('utf8') || null;
    } else {
      raw = await fs.promises.readFile(path.join(SCREENSHOT_LOCAL_DIR, safeKey), 'utf8');
    }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readScreenshotObject(key) {
  const safeKey = normalizeStorageKey(key);
  if (isR2Selected()) {
    try {
      return await getR2Object(safeKey);
    } catch (error) {
      console.warn('R2 object read skipped:', error.message);
      return null;
    }
  }
  try {
    const filepath = path.join(SCREENSHOT_LOCAL_DIR, safeKey);
    const buffer = await fs.promises.readFile(filepath);
    return {
      buffer,
      size: buffer.length,
      contentType: getContentTypeForKey(safeKey),
    };
  } catch {
    return null;
  }
}

async function statScreenshotObject(key) {
  const safeKey = normalizeStorageKey(key);
  if (isR2Selected()) {
    try {
      return await headR2Object(safeKey);
    } catch (error) {
      console.warn('R2 metadata read skipped:', error.message);
      return null;
    }
  }
  try {
    const stats = await fs.promises.stat(path.join(SCREENSHOT_LOCAL_DIR, safeKey));
    return {
      mtimeMs: stats.mtimeMs,
      size: stats.size || 0,
      contentType: getContentTypeForKey(safeKey),
      isFile: () => stats.isFile(),
    };
  } catch {
    return null;
  }
}

async function listLocalScreenshotFiles() {
  if (isR2Selected()) return [];
  ensureLocalDir();
  return fs.promises.readdir(SCREENSHOT_LOCAL_DIR, { withFileTypes: true });
}

async function removeLocalScreenshotFile(filename) {
  if (isR2Selected()) return;
  await fs.promises.unlink(path.join(SCREENSHOT_LOCAL_DIR, normalizeStorageKey(filename)));
}

// Bounded storage operations used by the private-image expiry sweep. These
// throw on provider failures so cleanup cannot report a failed pass as success.
async function listScreenshotObjects({ prefix, cursor = null, limit = 200 }) {
  if (!prefix || !/^[a-zA-Z0-9_-]+$/.test(prefix)) throw new Error('Invalid storage prefix');
  const pageSize = Math.max(1, Math.min(1000, Math.floor(limit)));
  if (isR2Selected()) {
    assertR2Configured();
    const query = { 'list-type': '2', prefix, 'max-keys': String(pageSize), ...(cursor ? { 'continuation-token': cursor } : {}) };
    const request = signedR2Request({ method: 'GET', query });
    const response = await fetch(request.url, { headers: request.headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`R2 listing failed (${response.status})`);
    const $ = cheerio.load(await response.text(), { xmlMode: true });
    if (!$('ListBucketResult').length || $('Error').length) throw new Error('Invalid R2 listing');
    const keys = $('Contents > Key').map((_, el) => $(el).text()).get();
    const nextCursor = $('NextContinuationToken').text() || null;
    if ($('IsTruncated').text() === 'true' && !nextCursor) throw new Error('R2 listing cursor missing');
    return { keys, cursor: nextCursor };
  }
  const keys = [];
  for await (const entry of await fs.promises.opendir(SCREENSHOT_LOCAL_DIR)) {
    if (!entry.isFile() || !entry.name.startsWith(prefix) || (cursor && entry.name <= cursor)) continue;
    keys.push(entry.name);
    keys.sort();
    if (keys.length > pageSize + 1) keys.pop();
  }
  const hasMore = keys.length > pageSize;
  if (hasMore) keys.pop();
  return { keys, cursor: hasMore ? keys.at(-1) : null };
}

async function readScreenshotObjectPrefix(key, bytes) {
  const safeKey = normalizeStorageKey(key);
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > 1024) throw new Error('Invalid prefix length');
  if (isR2Selected()) {
    assertR2Configured();
    const request = signedR2Request({ method: 'GET', key: safeKey, extraHeaders: { range: `bytes=0-${bytes - 1}` } });
    const response = await fetch(request.url, { headers: request.headers, signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return null;
    if (response.status !== 206 || Number(response.headers.get('content-length')) > bytes) {
      await response.body?.cancel();
      throw new Error(`R2 prefix read failed (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  let file;
  try {
    file = await fs.promises.open(path.join(SCREENSHOT_LOCAL_DIR, safeKey), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const buffer = Buffer.alloc(bytes);
    const result = await file.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  } finally { await file?.close(); }
}

async function removeScreenshotObject(key) {
  const safeKey = normalizeStorageKey(key);
  if (isR2Selected()) {
    assertR2Configured();
    const request = signedR2Request({ method: 'DELETE', key: safeKey });
    const response = await fetch(request.url, { method: 'DELETE', headers: request.headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok && response.status !== 404) throw new Error(`R2 deletion failed (${response.status})`);
    return;
  }
  await fs.promises.unlink(path.join(SCREENSHOT_LOCAL_DIR, safeKey)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

module.exports = {
  SCREENSHOT_LOCAL_DIR,
  SCREENSHOT_PUBLIC_BASE,
  isR2Selected,
  isR2Configured,
  getScreenshotStorageProvider,
  getContentTypeForKey,
  normalizeStorageKey,
  extractScreenshotStorageKey,
  buildPublicUrl,
  saveScreenshotObject,
  saveScreenshotJson,
  readScreenshotJson,
  readScreenshotObject,
  statScreenshotObject,
  listLocalScreenshotFiles,
  removeLocalScreenshotFile,
  listScreenshotObjects,
  readScreenshotObjectPrefix,
  removeScreenshotObject,
};
