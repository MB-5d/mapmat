import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export const CONSENT_STORAGE_KEY = 'vellic_consent_v1';
export const CONSENT_PROMPT_SEEN_KEY = 'vellic_consent_prompt_seen_v1';
const LEGACY_CONSENT_STORAGE_KEY = 'mapmat_consent_v1';
export const CONSENT_VERSION = '2026-04-27';
const COOKIE_YEAR = 60 * 60 * 24 * 365;

export const createDefaultConsent = () => ({
  necessary: true,
  analytics: false,
  experienceResearch: false,
  marketing: false,
  version: CONSENT_VERSION,
  updatedAt: new Date().toISOString(),
});

const normalizeConsent = (value) => ({
  necessary: true,
  analytics: value?.analytics === true,
  experienceResearch: value?.experienceResearch === true,
  marketing: false,
  version: CONSENT_VERSION,
  updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
});

const getCookieDomain = () => {
  if (typeof window === 'undefined') return '';
  const hostname = window.location?.hostname || '';
  return hostname === 'vellic.io' || hostname.endsWith('.vellic.io') ? '; Domain=.vellic.io' : '';
};

const readCookie = (name) => {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  const entry = document.cookie
    .split('; ')
    .find((candidate) => candidate.startsWith(prefix));
  if (!entry) return '';
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch (error) {
    return entry.slice(prefix.length);
  }
};

const writeCookie = (name, value, maxAge = COOKIE_YEAR) => {
  if (typeof document === 'undefined') return;
  const secure = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${getCookieDomain()}${secure}`;
};

export const readConsentPromptSeen = (
  storage = typeof window !== 'undefined' ? window.localStorage : null
) => {
  if (readCookie(CONSENT_PROMPT_SEEN_KEY) === 'true') return true;
  try {
    return storage?.getItem(CONSENT_PROMPT_SEEN_KEY) === 'true';
  } catch (error) {
    return false;
  }
};

export const readStoredConsent = (
  storage = typeof window !== 'undefined' ? window.localStorage : null
) => {
  if (!storage) {
    return { consent: createDefaultConsent(), hasStoredConsent: false };
  }

  try {
    let raw = storage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) {
      raw = storage.getItem(LEGACY_CONSENT_STORAGE_KEY);
      if (raw) {
        storage.setItem(CONSENT_STORAGE_KEY, raw);
        storage.removeItem(LEGACY_CONSENT_STORAGE_KEY);
      }
    }
    if (!raw) {
      raw = readCookie(CONSENT_STORAGE_KEY);
      if (raw) {
        storage.setItem(CONSENT_STORAGE_KEY, raw);
        storage.removeItem(LEGACY_CONSENT_STORAGE_KEY);
      }
    }
    if (!raw) {
      return { consent: createDefaultConsent(), hasStoredConsent: false };
    }

    const parsed = JSON.parse(raw);
    if (parsed?.version !== CONSENT_VERSION) {
      return { consent: createDefaultConsent(), hasStoredConsent: false };
    }

    const normalized = normalizeConsent(parsed);
    writeCookie(CONSENT_STORAGE_KEY, JSON.stringify(normalized));
    return { consent: normalized, hasStoredConsent: true };
  } catch (error) {
    console.warn('Failed to load consent settings', error);
    return { consent: createDefaultConsent(), hasStoredConsent: false };
  }
};

const ConsentContext = createContext(null);

const fallbackConsent = createDefaultConsent();
const fallbackContext = {
  consent: fallbackConsent,
  hasStoredConsent: false,
  hasSeenConsentPrompt: false,
  hadSeenConsentPromptOnLoad: false,
  needsConsent: true,
  isSettingsOpen: false,
  acceptResearch: () => fallbackConsent,
  rejectOptional: () => fallbackConsent,
  saveChoices: () => fallbackConsent,
  markConsentPromptSeen: () => {},
  openSettings: () => {},
  closeSettings: () => {},
};

export function ConsentProvider({ children }) {
  const initial = useMemo(() => ({
    ...readStoredConsent(),
    hasSeenConsentPrompt: readConsentPromptSeen(),
  }), []);
  const [consent, setConsent] = useState(initial.consent);
  const [hasStoredConsent, setHasStoredConsent] = useState(initial.hasStoredConsent);
  const [hasSeenConsentPrompt, setHasSeenConsentPrompt] = useState(initial.hasSeenConsentPrompt);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hadSeenConsentPromptOnLoad] = useState(initial.hasSeenConsentPrompt);

  const persistConsent = useCallback((nextConsent) => {
    const normalized = normalizeConsent({
      ...nextConsent,
      updatedAt: new Date().toISOString(),
    });

    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(normalized));
      window.localStorage.removeItem(LEGACY_CONSENT_STORAGE_KEY);
      window.localStorage.setItem(CONSENT_PROMPT_SEEN_KEY, 'true');
      writeCookie(CONSENT_STORAGE_KEY, JSON.stringify(normalized));
      writeCookie(CONSENT_PROMPT_SEEN_KEY, 'true');
    } catch (error) {
      console.warn('Failed to save consent settings', error);
      writeCookie(CONSENT_STORAGE_KEY, JSON.stringify(normalized));
      writeCookie(CONSENT_PROMPT_SEEN_KEY, 'true');
    }

    setConsent(normalized);
    setHasStoredConsent(true);
    setHasSeenConsentPrompt(true);
    return normalized;
  }, []);

  const acceptResearch = useCallback(() => persistConsent({
    necessary: true,
    analytics: true,
    experienceResearch: true,
    marketing: false,
  }), [persistConsent]);

  const rejectOptional = useCallback(() => persistConsent({
    necessary: true,
    analytics: false,
    experienceResearch: false,
    marketing: false,
  }), [persistConsent]);

  const saveChoices = useCallback((choices) => persistConsent({
    necessary: true,
    analytics: choices?.analytics === true,
    experienceResearch: choices?.experienceResearch === true,
    marketing: false,
  }), [persistConsent]);

  const markConsentPromptSeen = useCallback(() => {
    if (hasSeenConsentPrompt) return;
    try {
      window.localStorage.setItem(CONSENT_PROMPT_SEEN_KEY, 'true');
      writeCookie(CONSENT_PROMPT_SEEN_KEY, 'true');
    } catch (error) {
      writeCookie(CONSENT_PROMPT_SEEN_KEY, 'true');
    }
    setHasSeenConsentPrompt(true);
  }, [hasSeenConsentPrompt]);

  const value = useMemo(() => ({
    consent,
    hasStoredConsent,
    hasSeenConsentPrompt,
    hadSeenConsentPromptOnLoad,
    needsConsent: !hasStoredConsent,
    isSettingsOpen,
    acceptResearch,
    rejectOptional,
    saveChoices,
    markConsentPromptSeen,
    openSettings: () => setIsSettingsOpen(true),
    closeSettings: () => setIsSettingsOpen(false),
  }), [
    acceptResearch,
    consent,
    hasStoredConsent,
    hasSeenConsentPrompt,
    hadSeenConsentPromptOnLoad,
    isSettingsOpen,
    markConsentPromptSeen,
    rejectOptional,
    saveChoices,
  ]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent() {
  const context = useContext(ConsentContext);
  return context || fallbackContext;
}
