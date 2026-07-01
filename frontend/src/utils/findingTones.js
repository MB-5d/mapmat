export const FINDING_TONE_BY_KEY = Object.freeze({
  missing: 'amber',
  duplicates: 'orange',
  brokenLinks: 'red',
  errorPages: 'red',
  scanLimited: 'red',
  inactivePages: 'slate',
  orphanPages: 'sky',
  subdomains: 'teal',
  files: 'blue',
  redirects: 'blue',
  authenticatedPages: 'violet',
  missingTitle: 'yellow',
  missingDescription: 'yellow',
  missingH1: 'yellow',
  shortTitle: 'blue',
  shortDescription: 'blue',
  longTitle: 'indigo',
  longDescription: 'indigo',
  hasImage: 'green',
});

export const NODE_BADGE_TONE_BY_LABEL = Object.freeze({
  Duplicate: 'orange',
  Missing: 'amber',
  File: 'blue',
  'Broken Link': 'red',
  Auth: 'violet',
  Error: 'red',
  Inactive: 'slate',
});

export const getFindingTone = (key, fallback = 'blue') => FINDING_TONE_BY_KEY[key] || fallback;

export const getNodeBadgeTone = (label, fallback = 'slate') => {
  const text = String(label || '').trim();
  const status = Number(text);
  if (/^HTTP\s+\d+/i.test(text) || (Number.isFinite(status) && status >= 400)) return 'red';
  return NODE_BADGE_TONE_BY_LABEL[label] || fallback;
};
