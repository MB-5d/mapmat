import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  APP_LOCALE_OPTIONS,
  getInitialAppLocale,
  normalizeAppLocale,
  persistAppLocale,
  translateAppText,
} from '../i18n/localeRegistry';

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(getInitialAppLocale);

  const setLocale = useCallback((nextLocale, { persist = true } = {}) => {
    const normalized = normalizeAppLocale(nextLocale);
    setLocaleState(normalized);
    if (persist) persistAppLocale(normalized);
    return normalized;
  }, []);

  useEffect(() => {
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previousLanguage || 'en';
    };
  }, [locale]);

  const t = useCallback(
    (source, variables) => translateAppText(locale, source, variables),
    [locale]
  );

  const value = useMemo(() => ({
    locale,
    localeOptions: APP_LOCALE_OPTIONS,
    setLocale,
    t,
  }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used within LocaleProvider');
  return value;
}
