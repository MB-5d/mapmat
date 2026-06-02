const crypto = require('crypto');
const usageStore = require('../stores/usageStore');

function normalizeIp(ip) {
  return ip && ip.startsWith('::ffff:') ? ip.slice(7) : (ip || '');
}

function getClientIp(req) {
  return normalizeIp(req?.ip || req?.connection?.remoteAddress || 'unknown');
}

function getApiKey(req) {
  return req?.get?.('x-api-key') || req?.query?.api_key || req?.body?.api_key || null;
}

function hashIp(ip) {
  return ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;
}

function trimMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const safeMeta = {};
  Object.entries(meta).forEach(([key, value]) => {
    if (!key) return;
    if (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      safeMeta[key] = value;
      return;
    }
    if (Array.isArray(value)) {
      safeMeta[key] = value.slice(0, 50);
    }
  });
  const serialized = JSON.stringify(safeMeta);
  if (serialized.length <= 5000) return safeMeta;
  return {
    truncated: true,
    originalBytes: serialized.length,
  };
}

function recordUsageEvent(req, eventType, quantity = 1, meta = null) {
  const safeEventType = String(eventType || '').trim();
  if (!safeEventType) return;

  usageStore.insertUsageEventAsync({
    id: crypto.randomUUID(),
    userId: req?.user?.id || null,
    apiKey: getApiKey(req),
    ipHash: hashIp(getClientIp(req)),
    eventType: safeEventType,
    quantity: Math.max(1, Number.parseInt(quantity, 10) || 1),
    meta: trimMeta(meta),
  }).catch((error) => {
    console.warn('Usage record error:', error.message);
  });
}

module.exports = {
  getApiKey,
  getClientIp,
  hashIp,
  recordUsageEvent,
};
