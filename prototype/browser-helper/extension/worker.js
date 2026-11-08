// Revoke temporary site grants even if the popup closes mid-request. No login
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
