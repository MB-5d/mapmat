export const APP_LOCALE_STORAGE_KEY = 'vellic_app_locale';
export const APP_LOCALE_COOKIE = 'vellic_app_locale';

export const APP_LOCALES = Object.freeze({
  en: Object.freeze({ code: 'en', label: 'English' }),
  es: Object.freeze({ code: 'es', label: 'Español' }),
});

export const APP_LOCALE_OPTIONS = Object.freeze(Object.values(APP_LOCALES));

const SPANISH_TRANSLATIONS = Object.freeze({
  'Account': 'Cuenta',
  'Account menu': 'Menú de cuenta',
  'Appearance': 'Apariencia',
  'Auto': 'Automático',
  'Auto follows your system preference.': 'Automático sigue la preferencia de tu sistema.',
  'Billing': 'Facturación',
  'Canvas': 'Lienzo',
  'Collaboration': 'Colaboración',
  'Cookie consent': 'Consentimiento de cookies',
  'Cookie consent settings': 'Configuración de cookies',
  'Dark': 'Oscuro',
  'History': 'Historial',
  'Horizontal': 'Horizontal',
  'Invites': 'Invitaciones',
  'Keep numbering visible in every view.': 'Mantén la numeración visible en todas las vistas.',
  'Language': 'Idioma',
  'Language preference': 'Preferencia de idioma',
  'Language preference could not be saved.': 'No se pudo guardar la preferencia de idioma.',
  'Light': 'Claro',
  'Log out': 'Cerrar sesión',
  'Map orientation': 'Orientación del mapa',
  'Maps': 'Mapas',
  'Optional research tools are off.': 'Las herramientas opcionales de investigación están desactivadas.',
  'Personalize your workspace': 'Personaliza tu espacio de trabajo',
  'Profile': 'Perfil',
  'Requests': 'Solicitudes',
  'Screen size not supported': 'Tamaño de pantalla no compatible',
  'Settings': 'Configuración',
  'Show page numbers': 'Mostrar números de página',
  'Sign up / log in': 'Regístrate / inicia sesión',
  'Some optional research tools are allowed.': 'Se permiten algunas herramientas opcionales de investigación.',
  'Support': 'Soporte',
  'Theme': 'Tema',
  'Use desktop or tablet landscape': 'Usa una computadora o una tableta en horizontal',
  'Vellic tablet support is currently tuned for Safari and Chrome. Please switch browsers or use desktop.': 'La compatibilidad de Vellic con tabletas está optimizada para Safari y Chrome. Cambia de navegador o usa una computadora.',
  'Vellic works best on desktop or tablet landscape. Please use a larger screen.': 'Vellic funciona mejor en una computadora o una tableta en horizontal. Usa una pantalla más grande.',
  'Vertical': 'Vertical',
  'Workspace': 'Espacio de trabajo',
  'Your selection is saved to this browser and your account when signed in.': 'Tu selección se guarda en este navegador y, al iniciar sesión, en tu cuenta.',
});

const TRANSLATIONS = Object.freeze({
  en: Object.freeze({}),
  es: SPANISH_TRANSLATIONS,
});

export function normalizeAppLocale(value, fallback = 'en') {
  const normalized = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  return APP_LOCALES[normalized] ? normalized : fallback;
}

export function detectBrowserLocale(browserLanguages = []) {
  const candidates = Array.isArray(browserLanguages) ? browserLanguages : [browserLanguages];
  for (const candidate of candidates) {
    const locale = normalizeAppLocale(candidate, '');
    if (locale) return locale;
  }
  return 'en';
}

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const prefix = `${encodeURIComponent(name)}=`;
  const match = String(document.cookie || '').split('; ').find((entry) => entry.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
}

export function readStoredAppLocale() {
  if (typeof window === 'undefined') return '';
  try {
    const stored = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
    if (stored) return normalizeAppLocale(stored, '');
  } catch (error) {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return normalizeAppLocale(readCookie(APP_LOCALE_COOKIE), '');
}

export function getInitialAppLocale() {
  const stored = readStoredAppLocale();
  if (stored) return stored;
  if (typeof navigator === 'undefined') return 'en';
  return detectBrowserLocale(navigator.languages?.length ? navigator.languages : navigator.language);
}

export function persistAppLocale(value) {
  const locale = normalizeAppLocale(value);
  if (typeof window === 'undefined') return locale;
  try {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
  } catch (error) {
    // The cookie remains as a fallback when localStorage is unavailable.
  }
  const secure = window.location?.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${encodeURIComponent(APP_LOCALE_COOKIE)}=${encodeURIComponent(locale)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  return locale;
}

export function translateAppText(locale, source, variables = {}) {
  const resolvedLocale = normalizeAppLocale(locale);
  const template = TRANSLATIONS[resolvedLocale]?.[source] || source;
  return Object.entries(variables).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

export function getMissingTranslations(locale, requiredSources) {
  const resolvedLocale = normalizeAppLocale(locale);
  if (resolvedLocale === 'en') return [];
  return requiredSources.filter((source) => !TRANSLATIONS[resolvedLocale]?.[source]);
}
