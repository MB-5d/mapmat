/* eslint-disable no-console */
const assert = require('assert');
const {
  extractSeoMetadata,
  getPrimaryDescription,
  getPrimaryMetaTags,
} = require('../utils/scanMetadata');

const html = `
<!doctype html>
<html lang="en-US">
  <head>
    <title>Example title</title>
    <meta name="description" content="Primary page description.">
    <meta name="keywords" content="seo, crawl, sitemap">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="/canonical-page">
    <meta property="og:title" content="OG title">
    <meta property="og:description" content="OG description">
    <meta property="og:image" content="/og-image.jpg">
    <meta property="og:url" content="/og-url">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Twitter title">
    <meta name="twitter:description" content="Twitter description">
    <meta name="twitter:image" content="/twitter-image.jpg">
  </head>
  <body>
    <h1>Primary heading</h1>
    <h2>Secondary heading</h2>
  </body>
</html>
`;

const metadata = extractSeoMetadata(html, 'https://example.com/page');

assert.strictEqual(metadata.description, 'Primary page description.');
assert.strictEqual(metadata.keywords, 'seo, crawl, sitemap');
assert.strictEqual(metadata.robots, 'index, follow');
assert.strictEqual(metadata.canonicalUrl, 'https://example.com/canonical-page');
assert.strictEqual(metadata.h1, 'Primary heading');
assert.strictEqual(metadata.h2, 'Secondary heading');
assert.strictEqual(metadata.language, 'en-US');
assert.strictEqual(metadata.openGraph.title, 'OG title');
assert.strictEqual(metadata.openGraph.description, 'OG description');
assert.strictEqual(metadata.openGraph.image, 'https://example.com/og-image.jpg');
assert.strictEqual(metadata.openGraph.url, 'https://example.com/og-url');
assert.strictEqual(metadata.openGraph.type, 'article');
assert.strictEqual(metadata.twitter.card, 'summary_large_image');
assert.strictEqual(metadata.twitter.title, 'Twitter title');
assert.strictEqual(metadata.twitter.description, 'Twitter description');
assert.strictEqual(metadata.twitter.image, 'https://example.com/twitter-image.jpg');
assert.strictEqual(getPrimaryDescription(metadata), 'Primary page description.');
assert.strictEqual(getPrimaryMetaTags(metadata), 'seo, crawl, sitemap');

console.log('Scan metadata extraction check passed');
