const assert = require('assert');
const { analyzeMapInsights } = require('../utils/mapInsights');

const root = {
  id: 'home',
  url: 'https://example.com/',
  title: 'Home',
  description: '',
  statusCode: 200,
  responseTime: 120,
  linksIn: 1,
  h1s: [],
  seoMetadata: {
    imageCount: 2,
    missingImageAltCount: 1,
  },
  children: [
    {
      id: 'pricing',
      url: 'https://example.com/products/pricing',
      title: 'Pricing',
      description: 'Pricing',
      statusCode: 200,
      responseTime: 3500,
      linksIn: 1,
      h1s: ['Pricing'],
      children: [],
    },
    {
      id: 'duplicate',
      url: 'https://example.com/services/pricing',
      title: 'Pricing',
      description: 'Pricing',
      statusCode: 404,
      linksIn: 0,
      h1s: ['Pricing'],
      children: [],
    },
  ],
};

const analysis = analyzeMapInsights({
  root,
  orphans: [],
  scanMeta: {
    brokenLinks: [{ url: 'https://example.com/missing', sourceUrl: 'https://example.com/' }],
  },
  scanId: 'fixture-scan',
});

assert.strictEqual(analysis.scanId, 'fixture-scan');
assert.strictEqual(analysis.totals.pages, 3);
assert.strictEqual(analysis.totals.errorPages, 1);
assert.strictEqual(analysis.totals.brokenLinks, 1);
assert.ok(analysis.findings.some((finding) => finding.title === 'Missing H1'));
assert.ok(analysis.findings.some((finding) => finding.title === 'Duplicate title'));
assert.ok(analysis.findings.some((finding) => finding.title === '4xx page'));
assert.ok(analysis.findings.some((finding) => finding.title === 'Images missing alt text'));
assert.ok(analysis.pageInsights.find((entry) => entry.pageId === 'duplicate')?.score < 100);
assert.ok(Number.isFinite(analysis.overallScore));

console.log('Map Insights fixture check passed.');
