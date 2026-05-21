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

const GENERIC_ERROR_TITLE_PATTERNS = [
  /^404\b/i,
  /^not found$/i,
  /^page not found$/i,
  /^error$/i,
  /^server error$/i,
  /^internal server error$/i,
  /^something went wrong$/i,
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
    const openGraphTitle = normalizeText($('meta[property="og:title"], meta[name="og:title"]').first().attr('content'));
    const twitterTitle = normalizeText($('meta[name="twitter:title"], meta[property="twitter:title"]').first().attr('content'));
    const h1 = normalizeText($('h1').first().text());
    const bestTitle = title || openGraphTitle || twitterTitle || h1;
    return {
      title: bestTitle,
      htmlTitle: title,
      openGraphTitle,
      twitterTitle,
      h1,
      bodyText: normalizeText($('body').first().text()).slice(0, 4000),
    };
  } catch {
    return { title: '', htmlTitle: '', openGraphTitle: '', twitterTitle: '', h1: '', bodyText: '' };
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
  const hasHttpErrorStatus = normalizedStatus >= 400;
  const isErrorStatus = hasHttpErrorStatus && !isAuthStatus && !isBlockedStatus;
  const isInactiveStatus = normalizedStatus === 0;
  const hasGenericErrorTitle = title && GENERIC_ERROR_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  const isViewableError = isErrorStatus && Boolean(title) && !hasGenericErrorTitle;
  const isMetadataReliable = !isAuthStatus && !isBlockedStatus && !isInactiveStatus && (!isErrorStatus || isViewableError);
  let blockedReason = challenge.blockedReason;
  let scanStatus = 'active';

  if (isInactiveStatus) {
    blockedReason = 'fetch_failed';
    scanStatus = 'inactive';
  } else if (isAuthStatus) {
    blockedReason = 'auth_required';
    scanStatus = 'auth';
  } else if (isBlockedStatus) {
    blockedReason = blockedReason || 'crawler_limited';
    scanStatus = 'scan_limited';
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
    hasHttpErrorStatus,
    isViewableError,
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
