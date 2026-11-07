const { normalizeScanUrl } = require('./scanOptimization');

// Only a successful, observed upgrade on the same host/default ports establishes
// a transport alias. Do not weaken the application's strict origin comparison.
function getScanHttpsUpgrade(requestedUrl, response) {
  try {
    const requested = new URL(normalizeScanUrl(requestedUrl));
    const resolved = new URL(normalizeScanUrl(response?.finalUrl));
    if (requested.protocol !== 'http:' || resolved.protocol !== 'https:'
      || requested.port || resolved.port || requested.hostname !== resolved.hostname
      || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300
      || !/^\s*(text\/html|application\/xhtml\+xml)(?:;|\s|$)/i.test(response.contentType || '')) return null;
    const seed = new URL(requested);
    seed.protocol = 'https:';
    return { requestedUrl: requested.href, seed: seed.href, fromOrigin: requested.origin, toOrigin: resolved.origin };
  } catch {
    return null;
  }
}

function normalizeScanRedirectUrl(raw, upgrade = null) {
  const normalized = normalizeScanUrl(raw);
  if (!normalized || !upgrade) return normalized;
  const url = new URL(normalized);
  if (url.origin === upgrade.fromOrigin) url.protocol = 'https:';
  return url.href;
}

module.exports = { getScanHttpsUpgrade, normalizeScanRedirectUrl };
