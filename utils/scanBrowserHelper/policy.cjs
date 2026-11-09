const BLOCKED_HOSTS = ['google.com', 'googleusercontent.com', 'gstatic.com', 'microsoftonline.com', 'live.com', 'appleid.apple.com'];

function targetUrl(raw, allowFixture = false) {
  const url = new URL(raw);
  if (url.username || url.password || url.hash) throw Error('Use a page URL without credentials or a fragment.');
  if (allowFixture && url.origin === 'http://localhost:4399') return url;
  if (url.protocol !== 'https:' || url.port || !url.hostname.includes('.')
    || BLOCKED_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) {
    throw Error('Choose a protected page on the target site, not its identity provider.');
  }
  return url;
}

// Only an exact-origin, bounded cookie/localStorage snapshot is accepted. Parent
// cookies are narrowed to the selected host by the extension before transport.
function validateState(input, origin, now = Date.now()) {
  if (!input || !Array.isArray(input.cookies) || !Array.isArray(input.origins)
    || Buffer.byteLength(JSON.stringify(input)) > 512 * 1024
    || input.cookies.length > 200 || input.origins.length > 1) throw Error('Invalid or oversized site session.');
  const host = new URL(origin).hostname;
  const cookies = input.cookies.map(cookie => {
    if (!cookie || cookie.domain !== host || typeof cookie.name !== 'string' || !cookie.name
      || typeof cookie.value !== 'string' || cookie.name.length > 256 || cookie.value.length > 16384
      || typeof cookie.path !== 'string' || !cookie.path.startsWith('/')
      || typeof cookie.httpOnly !== 'boolean' || typeof cookie.secure !== 'boolean'
      || !['Strict', 'Lax', 'None'].includes(cookie.sameSite)
      || !Number.isFinite(cookie.expires) || (cookie.expires !== -1 && cookie.expires * 1000 <= now)
      || cookie.partitionKey) throw Error('Unsupported or out-of-scope cookie.');
    return { name: cookie.name, value: cookie.value, domain: host, path: cookie.path,
      httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite, expires: cookie.expires };
  });
  const origins = input.origins.map(entry => {
    if (entry.origin !== origin || !Array.isArray(entry.localStorage) || entry.localStorage.length > 300
      || entry.indexedDB) throw Error('Unsupported or out-of-scope site storage.');
    return { origin, localStorage: entry.localStorage.map(item => {
      if (typeof item?.name !== 'string' || typeof item?.value !== 'string'
        || item.name.length > 1024 || item.value.length > 128 * 1024) throw Error('Invalid site storage.');
      return { name: item.name, value: item.value };
    }) };
  });
  if (!cookies.length && !origins.some(entry => entry.localStorage.length)) throw Error('No transferable session found.');
  return { cookies, origins };
}

// Some sites conceal private resources with 404 while signed out. Acceptance
// still requires the same URL to return active content after session import.
function isSignedOutRestricted(status, classification) {
  return classification.isAuthStatus === true || status === 404;
}

function isHelperNavigationAllowed(raw, seed) {
  try {
    const url = new URL(raw), target = new URL(seed);
    const prefix = target.pathname.replace(/\/+$/, '') || '/';
    return url.origin === target.origin && (prefix === '/' || url.pathname === prefix || url.pathname.startsWith(prefix + '/'));
  } catch { return false; }
}

module.exports = { targetUrl, validateState, isSignedOutRestricted, isHelperNavigationAllowed };
