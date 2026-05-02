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
  const { title } = extractHtmlTitle(html);
  const challenge = detectChallengePage(html, title);
  const isAuthStatus = normalizedStatus === 401 || normalizedStatus === 403;
  const isErrorStatus = normalizedStatus >= 400;
  const isInactiveStatus = normalizedStatus === 0 || normalizedStatus >= 400;
  const isMetadataReliable = !isAuthStatus && !isErrorStatus && !challenge.isChallengePage;
  let blockedReason = challenge.blockedReason;

  if (!blockedReason && isAuthStatus) blockedReason = 'auth_required';
  if (!blockedReason && isErrorStatus) blockedReason = 'error_status';
  if (!blockedReason && normalizedStatus === 0) blockedReason = 'fetch_failed';

  return {
    title,
    titleSource: isMetadataReliable && title ? 'html' : 'url_fallback',
    fallbackTitle: getUrlFallbackTitle(finalUrl || url),
    isAuthStatus,
    isErrorStatus,
    isInactiveStatus,
    isChallengePage: challenge.isChallengePage,
    blockedReason,
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
