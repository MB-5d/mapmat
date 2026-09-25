// Hash-router paths identify pages; ordinary document fragments do not.
function getScanRouteHash(url) {
  try {
    const hash = new URL(url).hash;
    if (!/^#!?\//.test(hash)) return '';
    return /^#!?\/$/.test(hash) ? hash : hash.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

module.exports = { getScanRouteHash };
