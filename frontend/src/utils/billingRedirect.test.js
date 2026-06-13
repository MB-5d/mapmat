import {
  BILLING_FLOW_WINDOW_NAME,
  BILLING_RETURN_EVENT_KEY,
  isBillingFlowWindow,
  openBillingUrlInNewTab,
  publishBillingReturnEvent,
} from './billingRedirect';

describe('openBillingUrlInNewTab', () => {
  test('uses the opened tab when the browser returns a window reference', () => {
    const openedWindow = {
      opener: {},
      location: { href: '' },
    };
    const browserWindow = {
      open: jest.fn(() => openedWindow),
      location: { assign: jest.fn() },
    };

    expect(openBillingUrlInNewTab('https://billing.example/session', browserWindow)).toBe('new-tab');
    expect(browserWindow.open).toHaveBeenCalledWith('', '_blank');
    expect(openedWindow.name).toBe(BILLING_FLOW_WINDOW_NAME);
    expect(openedWindow.opener).toBeNull();
    expect(openedWindow.location.href).toBe('https://billing.example/session');
    expect(browserWindow.location.assign).not.toHaveBeenCalled();
  });

  test('redirects the current tab only when the new tab is blocked', () => {
    const browserWindow = {
      open: jest.fn(() => null),
      location: { assign: jest.fn() },
    };

    expect(openBillingUrlInNewTab('https://billing.example/session', browserWindow)).toBe('same-tab');
    expect(browserWindow.location.assign).toHaveBeenCalledWith('https://billing.example/session');
  });

  test('identifies billing flow windows', () => {
    expect(isBillingFlowWindow({ name: BILLING_FLOW_WINDOW_NAME })).toBe(true);
    expect(isBillingFlowWindow({ name: '' })).toBe(false);
  });

  test('publishes billing return events for other Vellic tabs', () => {
    const storage = new Map();
    const browserWindow = {
      localStorage: {
        setItem: jest.fn((key, value) => storage.set(key, value)),
      },
    };

    publishBillingReturnEvent({ billingResult: 'portal_return' }, browserWindow);

    expect(browserWindow.localStorage.setItem).toHaveBeenCalledWith(
      BILLING_RETURN_EVENT_KEY,
      expect.stringContaining('"billingResult":"portal_return"')
    );
    expect(JSON.parse(storage.get(BILLING_RETURN_EVENT_KEY))).toEqual(expect.objectContaining({
      billingResult: 'portal_return',
      timestamp: expect.any(Number),
    }));
  });
});
