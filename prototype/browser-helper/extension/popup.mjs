import { assertTarget, normalizeCookies, readLocalStorage } from './capture.mjs';

const api = 'http://127.0.0.1:4349/scan-auth/helper/';
const $ = id => document.getElementById(id);
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
  event.preventDefault(); $('review').disabled = true; status('Checking the local pairing…');
  try {
    pairing = $('pair').value.trim();
    if (!/^[a-f0-9]{64}$/.test(pairing)) throw Error('Copy the complete pairing code from local Vellic.');
    connection = await request('describe', {});
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || activeTab.incognito) throw Error('Use a regular Chrome tab for this local trial.');
    assertTarget(activeTab.url, connection.origin);
    $('site').textContent = connection.origin;
    $('destination').textContent = connection.destination;
    $('pair-form').hidden = true; $('connection').hidden = false;
    status('Review the selected site and allow the connection below. Pairing expires in five minutes.');
  } catch (error) { reset(error.message || 'Could not reach local Vellic. Check that it is running.'); }
  finally { $('review').disabled = false; }
});
$('cancel').addEventListener('click', () => reset('Nothing was copied. Close the login dialog in Vellic to cancel the pairing.'));
$('connect').addEventListener('click', async () => {
  if (!connection || !$('consent').checked) { status('Allow the selected site connection before continuing.'); return; }
  const pattern = connection.origin + '/*';
  let granted = false;
  $('connect').disabled = true; $('cancel').disabled = true;
  try {
    // Must run directly from this user gesture, before any unrelated awaits.
    granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) throw Error('Site access was declined. Nothing was copied.');
    if (Date.now() >= connection.expiresAt) throw Error('Pairing expired. Start again in Vellic.');
    const current = await chrome.tabs.get(activeTab.id);
    assertTarget(current.url, connection.origin);
    const stores = await chrome.cookies.getAllCookieStores();
    const store = stores.find(entry => entry.tabIds.includes(activeTab.id));
    if (!store) throw Error('The selected browser session is unavailable.');
    status('Connecting this site to the local scanner…');
    const cookies = normalizeCookies(await chrome.cookies.getAll({ url: current.url, storeId: store.id }), current.url);
    let origins = [];
    if ($('include-storage').checked) {
      const results = await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, func: readLocalStorage, args: [connection.origin] });
      if (results.length !== 1 || results[0].result?.origin !== connection.origin) throw Error('Site storage could not be read safely.');
      origins = [results[0].result];
    }
    // Detect redirects/navigation during collection before transferring anything.
    assertTarget((await chrome.tabs.get(activeTab.id)).url, connection.origin);
    await request('import', { origin: connection.origin, storageState: { cookies, origins } });
    reset('Connected. Return to Vellic and choose Use this login. If access cannot be verified, this site may require a different session method.');
  } catch (error) { reset(error.message || 'Connection failed. No credentials were saved by the helper.'); }
  finally {
    if (granted) await chrome.permissions.remove({ origins: [pattern] }).catch(() => {});
    $('connect').disabled = false; $('cancel').disabled = false;
  }
});
