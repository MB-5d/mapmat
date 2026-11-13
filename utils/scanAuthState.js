const normalizeHost = (value) => String(value || '').replace(/^\./, '').replace(/^www\./i, '').toLowerCase();

function isHostnameInAuthScope(hostname, session) {
  const host = normalizeHost(hostname);
  const baseHost = normalizeHost(session?.baseHost);
  return Boolean(host && baseHost && (host === baseHost || host.endsWith(`.${baseHost}`)));
}

function isScanAuthSessionExpired(session, now = Date.now()) {
  return !session || !Number.isFinite(session.expiresAt) || session.expiresAt <= now;
}

function scopeScanAuthStorageState(storageState, session) {
  if (!storageState || typeof storageState !== 'object') return null;
  const baseHost = normalizeHost(session?.baseHost);
  const rootDomain = normalizeHost(session?.rootDomain);
  return {
    cookies: (Array.isArray(storageState.cookies) ? storageState.cookies : []).filter((cookie) => {
      const domain = normalizeHost(cookie?.domain);
      return domain === baseHost
        || (domain === rootDomain && baseHost.endsWith(`.${domain}`))
        || domain.endsWith(`.${baseHost}`);
    }),
    origins: (Array.isArray(storageState.origins) ? storageState.origins : []).filter((entry) => {
      try {
        return isHostnameInAuthScope(new URL(entry.origin).hostname, session);
      } catch {
        return false;
      }
    }),
  };
}

module.exports = { isHostnameInAuthScope, isScanAuthSessionExpired, scopeScanAuthStorageState };
