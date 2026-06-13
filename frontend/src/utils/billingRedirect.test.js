import { openBillingUrlInNewTab } from './billingRedirect';

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
});
