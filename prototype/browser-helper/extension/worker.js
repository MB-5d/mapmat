// Revoke temporary site grants even if the connection window closes. No login
// state, pairing codes or site content is persisted by this worker.
const cleanupAlarm = 'revoke-temporary-site-access';
async function revoke() {
  const permissions = await chrome.permissions.getAll();
  const origins = (permissions.origins || []).filter(origin => origin !== 'http://127.0.0.1:4349/*');
  if (origins.length) await chrome.permissions.remove({ origins });
}
chrome.permissions.onAdded.addListener(permissions => {
  if (permissions.origins?.some(origin => origin !== 'http://127.0.0.1:4349/*')) {
    chrome.alarms.create(cleanupAlarm, { when: Date.now() + 30000 });
  }
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === cleanupAlarm) revoke().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => revoke().catch(() => {}));
chrome.runtime.onInstalled.addListener(() => revoke().catch(() => {}));

// A toolbar popup is destroyed by Chrome's site-permission prompt. Keep the
// explicit connection flow alive in its own window, bound to the clicked tab.
chrome.action.onClicked.addListener(tab => {
  if (!Number.isInteger(tab.id) || tab.incognito) return;
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html') + '?targetTab=' + tab.id,
    type: 'popup', width: 440, height: 680,
  }).catch(() => {});
});
