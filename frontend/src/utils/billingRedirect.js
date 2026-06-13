export function openBillingUrlInNewTab(url, browserWindow = window) {
  if (!url) throw new Error('Billing did not return a checkout link.');

  const openedWindow = browserWindow.open('', '_blank');
  if (openedWindow) {
    openedWindow.opener = null;
    openedWindow.location.href = url;
    return 'new-tab';
  }

  browserWindow.location.assign(url);
  return 'same-tab';
}
