import {
  APP_LOCALE_COOKIE,
  APP_LOCALE_STORAGE_KEY,
  detectBrowserLocale,
  getMissingTranslations,
  normalizeAppLocale,
  persistAppLocale,
  translateAppText,
} from './localeRegistry';

describe('app locale registry', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${APP_LOCALE_COOKIE}=; Max-Age=0; Path=/`;
  });

  test('normalizes supported regional browser languages', () => {
    expect(normalizeAppLocale('es-MX')).toBe('es');
    expect(detectBrowserLocale(['fr-FR', 'es-ES'])).toBe('es');
    expect(detectBrowserLocale(['fr-FR'])).toBe('en');
  });

  test('persists an explicit choice in local storage and a first-party cookie', () => {
    persistAppLocale('es');
    expect(window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)).toBe('es');
    expect(document.cookie).toContain(`${APP_LOCALE_COOKIE}=es`);
  });

  test('translates registered Spanish app-shell copy and reports gaps', () => {
    expect(translateAppText('es', 'Settings')).toBe('Configuración');
    expect(getMissingTranslations('es', ['Settings', 'Language'])).toEqual([]);
    expect(getMissingTranslations('es', ['Unregistered copy'])).toEqual(['Unregistered copy']);
  });
});
