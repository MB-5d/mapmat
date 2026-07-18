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
    {
      id: 'duplicate-active',
      url: 'https://example.com/compare/pricing',
      title: 'Pricing',
      description: 'Pricing',
      statusCode: 200,
      linksIn: 1,
      h1s: ['Pricing'],
      children: [],
    },
    {
      id: 'cloudflare-blocked',
      url: 'https://example.com/protected',
      title: 'Just a moment...',
      statusCode: 403,
      scanStatus: 'scan_limited',
      isChallengePage: true,
      blockedReason: 'challenge_page',
      metadataAvailable: false,
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
assert.strictEqual(analysis.version, 2);
assert.strictEqual(analysis.totals.pages, 5);
assert.strictEqual(analysis.totals.errorPages, 1);
assert.strictEqual(analysis.totals.brokenLinks, 1);
assert.ok(analysis.findings.some((finding) => finding.title === 'Missing H1'));
assert.ok(analysis.findings.some((finding) => finding.title === 'Duplicate title'));
assert.ok(analysis.findings.some((finding) => (
  finding.title === '4xx page'
    && finding.url === 'https://example.com/services/pricing'
    && finding.evidence?.statusLabel === 'HTTP 404 / Not Found'
)));
assert.ok(analysis.findings.some((finding) => (
  finding.title === 'Scan limited by site protection'
    && finding.url === 'https://example.com/protected'
    && finding.evidence?.statusCode === 403
)));
assert.ok(!analysis.findings.some((finding) => (
  finding.title === '4xx page'
    && finding.url === 'https://example.com/protected'
)));
assert.ok(analysis.findings.some((finding) => finding.title === 'Images missing alt text'));
assert.ok(analysis.pageInsights.find((entry) => entry.pageId === 'duplicate')?.score < 100);
assert.ok(Number.isFinite(analysis.overallScore));

const importedAnalysis = analyzeMapInsights({
  root: {
    id: 'import-container',
    nodeKind: 'import-container',
    children: [{
      id: 'import-ghost',
      title: 'articles',
      nodeKind: 'import-ghost',
      url: '',
      children: [{
        id: 'import-page',
        title: 'Post',
        nodeKind: 'page',
        url: 'https://example.com/articles/post',
        children: [],
      }],
    }],
  },
  orphans: [],
});
assert.strictEqual(importedAnalysis.totals.pages, 1);
assert.deepStrictEqual(importedAnalysis.pageInsights.map((entry) => entry.pageId), ['import-page']);

console.log('Map Insights fixture check passed.');
