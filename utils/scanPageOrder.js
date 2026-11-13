const cheerio = require('cheerio');
const { normalizeScanUrl } = require('./scanOptimization');

// Navigation leads, followed by content links in document order. XML sitemap
// position and fetch completion time are not the site's navigation order.
function extractPageLinkOrder(html, baseUrl, normalize = normalizeScanUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  const add = (_, element) => {
    const anchor = $(element);
    if (anchor.closest('[hidden], [aria-hidden="true"], template, noscript').length) return;
    const href = (anchor.attr('href') || '').trim();
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) return;
    try {
      const parsed = new URL(href, baseUrl);
      if (!/^https?:$/.test(parsed.protocol)) return;
      const url = normalize(parsed.toString());
      if (url) links.add(url);
    } catch { /* Invalid links cannot establish page order. */ }
  };
  $('nav a[href], [role="navigation"] a[href]')
    .filter((_, element) => !$(element).closest('footer, aside').length).each(add);
  $('a[href]').filter((_, element) => !$(element).closest('header, footer, aside, nav, [role="navigation"]').length).each(add);
  $('a[href]').each(add);
  return [...links];
}

function getSiblingLinkRanks(children, orderedLinks = [], normalize = normalizeScanUrl) {
  const indices = new Map(orderedLinks.map((url, index) => [normalize(url), index]));
  const ranks = new Map();
  const minimumRank = (node) => {
    let rank = Math.min(indices.get(normalize(node.url)) ?? Infinity, indices.get(normalize(node.finalUrl)) ?? Infinity);
    for (const child of node.children || []) rank = Math.min(rank, minimumRank(child));
    return rank;
  };
  // A structural parent inherits the first linked child's position, rather
  // than jumping ahead merely because its URL creates a deeper branch.
  for (const child of children) ranks.set(child, minimumRank(child));
  return ranks;
}

module.exports = { extractPageLinkOrder, getSiblingLinkRanks };
