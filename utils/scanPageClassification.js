const cheerio = require('cheerio');
const { normalizeText } = require('./scanMetadata');

const CHALLENGE_TITLE_PATTERNS = [
  /^just a moment/i,
  /^attention required/i,
  /^checking your browser/i,
  /^please wait/i,
  /^one more step/i,
  /^security check/i,
  /^verify you are human/i,
];

const CHALLENGE_BODY_PATTERNS = [
  /checking if the site connection is secure/i,
  /enable javascript and cookies/i,
  /verify you are human/i,
  /cf-browser-verification/i,
  /cloudflare ray id/i,
  /captcha/i,
  /bot detection/i,
];

const AUTH_BODY_PATTERNS = [
  /sign in/i,
  /log in/i,
  /login required/i,
  /authentication required/i,
  /access your account/i,
  /unauthorized/i,
];

function getUrlFallbackTitle(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return parsed.hostname;
    return decodeURIComponent(parts[parts.length - 1])
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || parsed.hostname;
  } catch {
    return String(url || '').trim() || 'Untitled page';
  }
}

function extractHtmlTitle(html) {
  try {
    const $ = cheerio.load(html || '');
    const title = normalizeText($('title').first().text());
    const h1 = normalizeText($('h1').first().text());
    return { title, h1, bodyText: normalizeText($('body').first().text()).slice(0, 4000) };
  } catch {
    return { title: '', h1: '', bodyText: '' };
  }
}

function detectChallengePage(html, title = '') {
  const extracted = extractHtmlTitle(html);
  const titleText = normalizeText(title || extracted.title || extracted.h1);
  if (titleText && CHALLENGE_TITLE_PATTERNS.some((pattern) => pattern.test(titleText))) {
    return { isChallengePage: true, blockedReason: 'challenge_page' };
  }
  if (extracted.bodyText && CHALLENGE_BODY_PATTERNS.some((pattern) => pattern.test(extracted.bodyText))) {
    return { isChallengePage: true, blockedReason: 'challenge_page' };
  }
  return { isChallengePage: false, blockedReason: null };
}

function classifyScanResponse({ html = '', status = 0, url = '', finalUrl = '' } = {}) {
  const normalizedStatus = Number(status) || 0;
  const { title, bodyText } = extractHtmlTitle(html);
  const challenge = detectChallengePage(html, title);
  const looksAuthRequired = AUTH_BODY_PATTERNS.some((pattern) => pattern.test(`${title} ${bodyText}`));
  const isAuthStatus = normalizedStatus === 401 || (normalizedStatus === 403 && looksAuthRequired);
  const isBlockedStatus = challenge.isChallengePage || normalizedStatus === 403 || normalizedStatus === 429;
  const isErrorStatus = normalizedStatus >= 500 || normalizedStatus === 404 || normalizedStatus === 410;
  const isInactiveStatus = normalizedStatus === 0;
  const isMetadataReliable = !isAuthStatus && !isBlockedStatus && !isErrorStatus && !isInactiveStatus;
  let blockedReason = challenge.blockedReason;
  let scanStatus = 'active';

  if (isInactiveStatus) {
    blockedReason = 'fetch_failed';
    scanStatus = 'inactive';
  } else if (isAuthStatus) {
    blockedReason = 'auth_required';
    scanStatus = 'auth';
  } else if (isBlockedStatus) {
    blockedReason = blockedReason || 'crawler_blocked';
    scanStatus = 'blocked';
  } else if (isErrorStatus) {
    blockedReason = 'error_status';
    scanStatus = 'error';
  } else if (normalizedStatus >= 300 && normalizedStatus < 400) {
    scanStatus = 'redirect';
  }

  return {
    title,
    titleSource: isMetadataReliable && title ? 'html' : 'url_fallback',
    fallbackTitle: getUrlFallbackTitle(finalUrl || url),
    isAuthStatus,
    isBlockedStatus,
    isErrorStatus,
    isInactiveStatus,
    isChallengePage: challenge.isChallengePage,
    blockedReason,
    scanStatus,
    metadataAvailable: isMetadataReliable,
    shouldExtractMetadata: isMetadataReliable,
    shouldExtractLinks: isMetadataReliable,
  };
}

module.exports = {
  classifyScanResponse,
  detectChallengePage,
  getUrlFallbackTitle,
};
