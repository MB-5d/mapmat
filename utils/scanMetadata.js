const cheerio = require('cheerio');

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeUrlValue(value, baseUrl) {
  const raw = normalizeText(value);
  if (!raw || /^data:/i.test(raw)) return '';
  try {
    const parsed = new URL(raw, baseUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function readMeta($, selector) {
  return normalizeText($(selector).first().attr('content'));
}

function readMetaAliases($, selectors) {
  for (const selector of selectors) {
    const value = readMeta($, selector);
    if (value) return value;
  }
  return '';
}

function readAbsoluteMeta($, selectors, baseUrl) {
  for (const selector of selectors) {
    const value = normalizeUrlValue($(selector).first().attr('content'), baseUrl);
    if (value) return value;
  }
  return '';
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => {
      if (entryValue === undefined || entryValue === null) return false;
      if (typeof entryValue === 'string') return entryValue.trim() !== '';
      if (typeof entryValue === 'object') return Object.keys(compactObject(entryValue)).length > 0;
      return true;
    })
  );
}

function extractSeoMetadata(html, baseUrl) {
  try {
    const $ = cheerio.load(html);
    const canonicalHref = normalizeText($('link[rel="canonical"]').first().attr('href'));
    const canonicalUrl = normalizeUrlValue(canonicalHref, baseUrl);
    const description = readMetaAliases($, [
      'meta[name="description"]',
      'meta[property="description"]',
    ]);
    const keywords = readMetaAliases($, [
      'meta[name="keywords"]',
      'meta[property="keywords"]',
    ]);
    const robots = readMetaAliases($, [
      'meta[name="robots"]',
      'meta[name="googlebot"]',
    ]);

    const h1s = $('h1').map((_, el) => normalizeText($(el).text())).get().filter(Boolean);
    const h2s = $('h2').map((_, el) => normalizeText($(el).text())).get().filter(Boolean);
    const images = $('img');
    let missingImageAltCount = 0;
    images.each((_, el) => {
      const alt = $(el).attr('alt');
      if (alt === undefined || normalizeText(alt) === '') {
        missingImageAltCount += 1;
      }
    });

    const metadata = {
      description,
      keywords,
      robots,
      canonicalUrl,
      h1: h1s[0] || '',
      h2: h2s[0] || '',
      h1s,
      h2s,
      imageCount: images.length,
      missingImageAltCount,
      language: normalizeText($('html').first().attr('lang')),
      openGraph: compactObject({
        title: readMeta($, 'meta[property="og:title"], meta[name="og:title"]'),
        description: readMeta($, 'meta[property="og:description"], meta[name="og:description"]'),
        image: readAbsoluteMeta($, [
          'meta[property="og:image"]',
          'meta[name="og:image"]',
        ], baseUrl),
        url: readAbsoluteMeta($, [
          'meta[property="og:url"]',
          'meta[name="og:url"]',
        ], baseUrl),
        type: readMeta($, 'meta[property="og:type"], meta[name="og:type"]'),
      }),
      twitter: compactObject({
        card: readMeta($, 'meta[name="twitter:card"], meta[property="twitter:card"]'),
        title: readMeta($, 'meta[name="twitter:title"], meta[property="twitter:title"]'),
        description: readMeta($, 'meta[name="twitter:description"], meta[property="twitter:description"]'),
        image: readAbsoluteMeta($, [
          'meta[name="twitter:image"]',
          'meta[property="twitter:image"]',
          'meta[name="twitter:image:src"]',
          'meta[property="twitter:image:src"]',
        ], baseUrl),
      }),
    };

    return compactObject(metadata);
  } catch {
    return {};
  }
}

function getPrimaryDescription(seoMetadata = {}) {
  return normalizeText(
    seoMetadata.description
      || seoMetadata.openGraph?.description
      || seoMetadata.twitter?.description
  );
}

function getPrimaryMetaTags(seoMetadata = {}) {
  return normalizeText(seoMetadata.keywords);
}

module.exports = {
  extractSeoMetadata,
  getPrimaryDescription,
  getPrimaryMetaTags,
  normalizeText,
};
