import { getAppDeviceSupport } from './deviceSupport';

const IPAD_SAFARI_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_CHROME_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

describe('getAppDeviceSupport', () => {
  test('allows desktop-sized browsers', () => {
    expect(getAppDeviceSupport({
      width: 1280,
      height: 800,
      userAgent: DESKTOP_CHROME_UA,
      maxTouchPoints: 0,
      coarsePointer: false,
    }).supported).toBe(true);
  });

  test('allows iPad landscape in Safari', () => {
    expect(getAppDeviceSupport({
      width: 1024,
      height: 768,
      userAgent: IPAD_SAFARI_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    }).supported).toBe(true);
  });

  test('allows iPad landscape in Chrome', () => {
    expect(getAppDeviceSupport({
      width: 1024,
      height: 768,
      userAgent: IPAD_CHROME_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    }).supported).toBe(true);
  });

  test('blocks iPad portrait', () => {
    const support = getAppDeviceSupport({
      width: 768,
      height: 1024,
      userAgent: IPAD_SAFARI_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    expect(support.supported).toBe(false);
    expect(support.reason).toBe('tablet_portrait');
    expect(support.message).toBe('Vellic works best on desktop or tablet landscape. Please use a larger screen.');
  });

  test('blocks phones', () => {
    const support = getAppDeviceSupport({
      width: 852,
      height: 393,
      userAgent: IPHONE_UA,
      maxTouchPoints: 5,
      coarsePointer: true,
    });

    expect(support.supported).toBe(false);
    expect(support.reason).toBe('small_screen');
  });
});
