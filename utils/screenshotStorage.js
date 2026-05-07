const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_PUBLIC_BASE = '/screenshots';
const SCREENSHOT_LOCAL_DIR = path.join(__dirname, '..', 'screenshots');
const SCREENSHOT_STORAGE_PROVIDER = String(process.env.SCREENSHOT_STORAGE_PROVIDER || 'local').trim().toLowerCase();

const R2_BUCKET = process.env.R2_BUCKET || process.env.SCREENSHOT_R2_BUCKET || '';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL || process.env.SCREENSHOT_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const R2_ENDPOINT = String(
  process.env.R2_ENDPOINT
  || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')
).replace(/\/+$/, '');

const isR2Configured = () => (
  SCREENSHOT_STORAGE_PROVIDER === 'r2'
  && R2_BUCKET
  && R2_ENDPOINT
  && R2_ACCESS_KEY_ID
  && R2_SECRET_ACCESS_KEY
);

function ensureLocalDir() {
  if (!fs.existsSync(SCREENSHOT_LOCAL_DIR)) {
    fs.mkdirSync(SCREENSHOT_LOCAL_DIR, { recursive: true });
  }
}

ensureLocalDir();

function localPublicUrl(filename, baseUrl) {
  return `${baseUrl}${SCREENSHOT_PUBLIC_BASE}/${filename}`;
}

function buildPublicUrl(key, baseUrl) {
  if (isR2Configured()) {
    if (R2_PUBLIC_BASE_URL) return `${R2_PUBLIC_BASE_URL}/${key}`;
    return `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
  }
  return localPublicUrl(key, baseUrl);
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

function signedR2Request({ method, key, body = Buffer.alloc(0), contentType = 'application/octet-stream' }) {
  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''));
  const bodyHash = hash(bodyBuffer);
  const now = amzDate();
  const dateValue = dateStamp(now);
  const host = new URL(R2_ENDPOINT).host;
  const canonicalUri = `/${encodeURIComponent(R2_BUCKET)}/${encodeKey(key)}`;
  const headers = {
    host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': now,
  };
  if (method !== 'HEAD') {
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
    '',
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
    url: `${R2_ENDPOINT}${canonicalUri}`,
    headers: requestHeaders,
    body: method === 'HEAD' ? undefined : bodyBuffer,
  };
}

async function putR2Object(key, buffer, contentType) {
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
  return {
    mtimeMs: modified ? new Date(modified).getTime() : Date.now(),
  };
}

async function saveScreenshotObject({ key, buffer, contentType, baseUrl }) {
  if (isR2Configured()) {
    await putR2Object(key, buffer, contentType);
    return buildPublicUrl(key, baseUrl);
  }
  ensureLocalDir();
  await fs.promises.writeFile(path.join(SCREENSHOT_LOCAL_DIR, key), buffer);
  return buildPublicUrl(key, baseUrl);
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
  if (isR2Configured()) return null;
  try {
    const raw = await fs.promises.readFile(path.join(SCREENSHOT_LOCAL_DIR, key), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function statScreenshotObject(key) {
  if (isR2Configured()) {
    try {
      return await headR2Object(key);
    } catch (error) {
      console.warn('R2 metadata read skipped:', error.message);
      return null;
    }
  }
  try {
    return await fs.promises.stat(path.join(SCREENSHOT_LOCAL_DIR, key));
  } catch {
    return null;
  }
}

async function listLocalScreenshotFiles() {
  if (isR2Configured()) return [];
  ensureLocalDir();
  return fs.promises.readdir(SCREENSHOT_LOCAL_DIR, { withFileTypes: true });
}

async function removeLocalScreenshotFile(filename) {
  if (isR2Configured()) return;
  await fs.promises.unlink(path.join(SCREENSHOT_LOCAL_DIR, filename));
}

module.exports = {
  SCREENSHOT_LOCAL_DIR,
  SCREENSHOT_PUBLIC_BASE,
  isR2Configured,
  buildPublicUrl,
  saveScreenshotObject,
  saveScreenshotJson,
  readScreenshotJson,
  statScreenshotObject,
  listLocalScreenshotFiles,
  removeLocalScreenshotFile,
};
