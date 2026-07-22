import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export const CONSENT_STORAGE_KEY = 'vellic_consent_v1';
const LEGACY_CONSENT_STORAGE_KEY = 'mapmat_consent_v1';
export const CONSENT_VERSION = '2026-04-27';

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
      return { consent: createDefaultConsent(), hasStoredConsent: false };
    }

    const parsed = JSON.parse(raw);
    if (parsed?.version !== CONSENT_VERSION) {
      return { consent: createDefaultConsent(), hasStoredConsent: false };
    }

    return { consent: normalizeConsent(parsed), hasStoredConsent: true };
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
  needsConsent: true,
  isSettingsOpen: false,
  acceptResearch: () => fallbackConsent,
  rejectOptional: () => fallbackConsent,
  saveChoices: () => fallbackConsent,
  openSettings: () => {},
  closeSettings: () => {},
};

export function ConsentProvider({ children }) {
  const initial = useMemo(() => readStoredConsent(), []);
  const [consent, setConsent] = useState(initial.consent);
  const [hasStoredConsent, setHasStoredConsent] = useState(initial.hasStoredConsent);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const persistConsent = useCallback((nextConsent) => {
    const normalized = normalizeConsent({
      ...nextConsent,
      updatedAt: new Date().toISOString(),
    });

    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(normalized));
      window.localStorage.removeItem(LEGACY_CONSENT_STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to save consent settings', error);
    }

    setConsent(normalized);
    setHasStoredConsent(true);
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

  const value = useMemo(() => ({
    consent,
    hasStoredConsent,
    needsConsent: !hasStoredConsent,
    isSettingsOpen,
    acceptResearch,
    rejectOptional,
    saveChoices,
    openSettings: () => setIsSettingsOpen(true),
    closeSettings: () => setIsSettingsOpen(false),
  }), [
    acceptResearch,
    consent,
    hasStoredConsent,
    isSettingsOpen,
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
