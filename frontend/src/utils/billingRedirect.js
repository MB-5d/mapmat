export const BILLING_FLOW_WINDOW_NAME = 'vellic_billing_flow';
export const BILLING_RETURN_EVENT_KEY = 'vellic:billing:return';

export function openBillingUrlInNewTab(url, browserWindow = window) {
  if (!url) throw new Error('Billing did not return a checkout link.');

  const openedWindow = browserWindow.open('', '_blank');
  if (openedWindow) {
    openedWindow.name = BILLING_FLOW_WINDOW_NAME;
    openedWindow.opener = null;
    openedWindow.location.href = url;
    return 'new-tab';
  }

  browserWindow.location.assign(url);
  return 'same-tab';
}

export function isBillingFlowWindow(browserWindow = window) {
  return browserWindow.name === BILLING_FLOW_WINDOW_NAME;
}

export function publishBillingReturnEvent(payload = {}, browserWindow = window) {
  const eventPayload = {
    ...payload,
    timestamp: Date.now(),
  };
  browserWindow.localStorage?.setItem(BILLING_RETURN_EVENT_KEY, JSON.stringify(eventPayload));
  return eventPayload;
}
