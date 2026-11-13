importScripts('config.js', 'permissions.js');
const permanentOrigin = self.VELLIC_HELPER.origin + '/*';
// Revoke temporary site grants even if the connection window closes. No login
// state, pairing codes or site content is persisted by this worker.
const cleanupAlarm = 'revoke-temporary-site-access';
async function revoke() {
  return self.VELLIC_PERMISSIONS.revoke(chrome, permanentOrigin);
}
chrome.permissions.onAdded.addListener(permissions => {
  if (permissions.origins?.some(origin => origin !== permanentOrigin) || permissions.permissions?.some(name => ['cookies','scripting'].includes(name))) {
    chrome.alarms.create(cleanupAlarm, { when: Date.now() + 30000 });
  }
});
async function cleanup() {
  try {
    await revoke();
    await chrome.alarms.clear(cleanupAlarm);
    await chrome.action.setBadgeText({ text: '' });
  } catch {
    // A closed popup cannot report an error. Keep retrying independently and
    // make a failed cleanup visible instead of silently abandoning the grant.
    chrome.alarms.create(cleanupAlarm, { when: Date.now() + 30000 });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setTitle({ title: 'Helper access could not be removed. Open Chrome extension settings.' });
  }
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === cleanupAlarm) cleanup(); });
chrome.runtime.onStartup.addListener(cleanup);
chrome.windows.onRemoved.addListener(cleanup);
chrome.runtime.onInstalled.addListener(cleanup);

// A toolbar popup is destroyed by Chrome's site-permission prompt. Keep the
// explicit connection flow alive in its own window, bound to the clicked tab.
chrome.action.onClicked.addListener(tab => {
  if (!Number.isInteger(tab.id) || (tab.incognito && !self.VELLIC_HELPER.allowIncognito)) return;
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html') + '?targetTab=' + tab.id,
    type: 'popup', width: 440, height: 680, incognito: Boolean(tab.incognito),
  }).catch(() => {});
});

// Only the exact app can query status or request Chrome's own update check.
// Neither message can read a site, expand permissions or initiate a transfer.
chrome.runtime.onMessageExternal?.addListener((message, sender, reply) => {
  if (!self.VELLIC_HELPER.appOrigin || sender.origin !== self.VELLIC_HELPER.appOrigin
    || !['vellic-helper-status', 'vellic-helper-update'].includes(message?.type)) return false;
  chrome.permissions.getAll().then(async grants => {
    const temporaryAccessRemoved = !grants.permissions.some(name => ['cookies', 'scripting'].includes(name))
      && !grants.origins.some(origin => origin !== permanentOrigin);
    const status = { version: chrome.runtime.getManifest().version, protocolVersion: 1,
      origin: self.VELLIC_HELPER.origin, temporaryAccessRemoved };
    if (message.type === 'vellic-helper-status') return reply(status);
    if (!temporaryAccessRemoved) return reply({ ...status, updateStatus: 'busy' });
    try {
      const update = await chrome.runtime.requestUpdateCheck();
      reply({ ...status, updateStatus: update.status });
    } catch { reply({ ...status, updateStatus: 'unavailable' }); }
  }).catch(() => reply({ error: 'Permission status unavailable' }));
  return true;
});
