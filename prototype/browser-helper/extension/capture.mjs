const blocked = ['google.com', 'googleusercontent.com', 'gstatic.com', 'microsoftonline.com', 'live.com', 'appleid.apple.com'];

export function assertTarget(raw, origin) {
  const url = new URL(raw);
  if (url.origin !== origin || url.username || url.password
    || !((url.protocol === 'https:' && !url.port) || url.origin === 'http://localhost:4399')
    || blocked.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) {
    throw Error('Open the protected target page, not Google or another sign-in provider, then reopen this helper.');
  }
  return url;
}

export function normalizeCookies(cookies, raw, now = Date.now()) {
  const url = new URL(raw);
  return cookies.filter(cookie => {
    const domain = cookie.domain.replace(/^\./, '').toLowerCase();
    return (cookie.hostOnly ? url.hostname === domain : url.hostname === domain || url.hostname.endsWith('.' + domain))
      && !cookie.partitionKey && (cookie.session || cookie.expirationDate * 1000 > now);
  }).map(cookie => ({
    name: cookie.name, value: cookie.value, domain: url.hostname, path: cookie.path,
    secure: cookie.secure, httpOnly: cookie.httpOnly,
    sameSite: ({ strict: 'Strict', lax: 'Lax', no_restriction: 'None', unspecified: 'Lax' })[cookie.sameSite] || 'Lax',
    expires: cookie.session ? -1 : cookie.expirationDate,
  }));
}

// Runs in Chrome's isolated world. No DOM/forms, IndexedDB, sessionStorage,
// provider pages or third-party frames are read.
export function readLocalStorage(expectedOrigin) {
  if (location.origin !== expectedOrigin) throw Error('Site changed during connection.');
  const values = Object.keys(localStorage).map(name => ({ name, value: localStorage.getItem(name) }));
  if (values.length > 300 || JSON.stringify(values).length > 256 * 1024) throw Error('Site storage is too large for this helper.');
  return { origin: location.origin, localStorage: values };
}
