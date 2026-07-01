export const APP_DEVICE_MIN_WIDTH = 900;
export const APP_DEVICE_MIN_HEIGHT = 600;

const SMALL_SCREEN_MESSAGE = 'Vellic works best on desktop or tablet landscape. Please use a larger screen.';
const TABLET_BROWSER_MESSAGE = 'Vellic tablet support is currently tuned for Safari and Chrome. Please switch browsers or use desktop.';

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getViewportDeviceInfo(source = {}) {
  const win = source.window || (typeof window !== 'undefined' ? window : null);
  const nav = source.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const viewport = win?.visualViewport;

  return {
    width: normalizeNumber(source.width ?? viewport?.width ?? win?.innerWidth, APP_DEVICE_MIN_WIDTH),
    height: normalizeNumber(source.height ?? viewport?.height ?? win?.innerHeight, APP_DEVICE_MIN_HEIGHT),
    userAgent: String(source.userAgent ?? nav?.userAgent ?? ''),
    maxTouchPoints: normalizeNumber(source.maxTouchPoints ?? nav?.maxTouchPoints, 0),
    coarsePointer: Boolean(
      source.coarsePointer ?? (
        typeof win?.matchMedia === 'function'
          ? win.matchMedia('(pointer: coarse)').matches
          : false
      )
    ),
  };
}
function isTabletDevice({ userAgent, maxTouchPoints }) {
  if (/iPad/i.test(userAgent)) return true;
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

function isPhoneDevice({ userAgent }, isTablet) {
  if (isTablet) return false;
  return /iPhone|iPod|Windows Phone/i.test(userAgent)
    || (/Android/i.test(userAgent) && /Mobile/i.test(userAgent));
}

function isSupportedTabletBrowser(userAgent) {
  const isChrome = /CriOS|Chrome/i.test(userAgent) && !/Edg|EdgiOS|FxiOS|Firefox/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/CriOS|Chrome|Edg|EdgiOS|FxiOS|Firefox/i.test(userAgent);
  return isChrome || isSafari;
}

export function getAppDeviceSupport(source = {}) {
  const info = getViewportDeviceInfo(source);
  const isLandscape = info.width >= info.height;
  const isTablet = isTabletDevice(info);
  const isPhone = isPhoneDevice(info, isTablet);
  const hasSupportedSize = info.width >= APP_DEVICE_MIN_WIDTH && info.height >= APP_DEVICE_MIN_HEIGHT;

  if (isPhone || !hasSupportedSize || (isTablet && !isLandscape)) {
    return {
      supported: false,
      reason: isTablet && !isLandscape ? 'tablet_portrait' : 'small_screen',
      message: SMALL_SCREEN_MESSAGE,
      info,
    };
  }

  if (isTablet && !isSupportedTabletBrowser(info.userAgent)) {
    return {
      supported: false,
      reason: 'unsupported_tablet_browser',
      message: TABLET_BROWSER_MESSAGE,
      info,
    };
  }

  return {
    supported: true,
    reason: 'supported',
    message: '',
    info,
  };
}
