import { assertTarget, normalizeCookies, readLocalStorage, permissionOrigins, cookieQuery, assertBrowserContext } from './capture.mjs';

const config = self.VELLIC_HELPER;
const api = config.origin + '/scan-auth/helper/';
const $ = id => document.getElementById(id);
$('environment').textContent = config.mode === 'hosted' ? 'ISOLATED CLOUD TEST' : 'LOCAL TEST ONLY';
$('fixed-destination').textContent = config.label + ' — ' + config.origin;
let pairing = '';
let connection = null;
let activeTab = null;

function status(message) { $('status').textContent = message; }
function reset(message) {
  pairing = ''; connection = null; activeTab = null;
  $('pair').value = ''; $('consent').checked = false; $('include-storage').checked = false;
  $('connection').hidden = true; $('pair-form').hidden = false;
  status(message);
}
async function request(path, body) {
  const response = await fetch(api + path, {
    method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + pairing },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Connection failed. Start a new login in Vellic.');
  return result;
}
$('pair-form').addEventListener('submit', async event => {
  event.preventDefault(); $('review').disabled = true; status('Checking the pairing…');
  try {
    pairing = $('pair').value.trim();
    if (!/^[a-f0-9]{64}$/.test(pairing)) throw Error('Copy the complete pairing code from Vellic.');
    connection = await request('describe', {});
    if (connection.helperOrigin !== config.origin) throw Error('The scanner address does not match this helper build.');
    if (config.mode === 'hosted' && !connection.origin?.startsWith('https://')) throw Error('Cloud tests require a public HTTPS target.');
    const targetTab = new URLSearchParams(location.search).get('targetTab');
    if (!targetTab || !/^\d+$/.test(targetTab)) throw Error('Open the helper from the protected site tab.');
    activeTab = await chrome.tabs.get(Number(targetTab));
    assertBrowserContext(activeTab, await chrome.windows.getCurrent(), config.allowIncognito);
    // The selected tab's URL is available only after the exact-site grant.
    // Avoid activeTab: its implicit grant cannot be removed by permissions.remove.
    $('site').textContent = connection.origin;
    $('destination').textContent = connection.destination;
    $('pair-form').hidden = true; $('connection').hidden = false;
    status('Review the selected site and allow the connection below. Pairing expires in five minutes.');
  } catch (error) { reset(error.message || 'Could not reach the test scanner. Check its address and availability.'); }
  finally { $('review').disabled = false; }
});
$('cancel').addEventListener('click', () => reset('Nothing was copied. Close the login dialog in Vellic to cancel the pairing.'));
$('connect').addEventListener('click', async () => {
  if (!connection || !$('consent').checked) { status('Allow the selected site connection before continuing.'); return; }
  const patterns = permissionOrigins(connection.origin);
  let granted = false;
  let connected = false;
  $('connect').disabled = true; $('cancel').disabled = true;
  try {
    // Must run directly from this user gesture, before any unrelated awaits.
    granted = await chrome.permissions.request({ origins: patterns });
    if (!granted) throw Error('Site access was declined. Nothing was copied.');
    if (Date.now() >= connection.expiresAt) throw Error('Pairing expired. Start again in Vellic.');
    const current = await chrome.tabs.get(activeTab.id);
    assertBrowserContext(current, await chrome.windows.getCurrent(), config.allowIncognito);
    assertTarget(current.url, connection.origin);
    const stores = await chrome.cookies.getAllCookieStores();
    const store = stores.find(entry => entry.tabIds.includes(activeTab.id));
    if (!store) throw Error('The selected browser session is unavailable.');
    status('Connecting this site to the selected scanner…');
    const rawCookies = await chrome.cookies.getAll(cookieQuery(current.url, store.id));
    const cookies = normalizeCookies(rawCookies, current.url);
    if (!cookies.length && !$('include-storage').checked) throw Error('No transferable login cookies were found. Sign in again, or this site may use an unsupported session method. Nothing was copied.');
    let origins = [];
    if ($('include-storage').checked) {
      const results = await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, func: readLocalStorage, args: [connection.origin] });
      if (results.length !== 1 || results[0].result?.origin !== connection.origin) throw Error('Site storage could not be read safely.');
      origins = [results[0].result];
    }
    // Detect redirects/navigation during collection before transferring anything.
    assertTarget((await chrome.tabs.get(activeTab.id)).url, connection.origin);
    await request('import', { origin: connection.origin, storageState: { cookies, origins } });
    connected = true;
  } catch (error) { reset(error.message || 'Connection failed. No credentials were saved by the helper.'); }
  finally {
    if (granted) {
      await chrome.permissions.remove({ origins: patterns }).catch(() => {});
      const remaining = await chrome.permissions.getAll();
      if (patterns.some(pattern => remaining.origins?.includes(pattern))) {
        reset('Site access could not be removed. Remove this helper in Chrome before continuing.');
        connected = false;
      }
    }
    if (connected) reset('Connected. Temporary site access removed. Return to Vellic and choose Use this login.');
    $('connect').disabled = false; $('cancel').disabled = false;
  }
});
