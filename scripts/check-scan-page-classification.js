const assert = require('assert');
const { classifyScanResponse } = require('../utils/scanPageClassification');
const { analyzeMapInsights } = require('../utils/mapInsights');

const normal = classifyScanResponse({
  url: 'https://example.com/about',
  finalUrl: 'https://example.com/about',
  status: 200,
  html: '<html><head><title>About Example</title><meta name="description" content="About Example company"></head><body><h1>About</h1><a href="/pricing">Pricing</a></body></html>',
});
assert.strictEqual(normal.metadataAvailable, true);
assert.strictEqual(normal.shouldExtractLinks, true);
assert.strictEqual(normal.titleSource, 'html');

const challenge = classifyScanResponse({
  url: 'https://example.com/app',
  finalUrl: 'https://example.com/app',
  status: 200,
  html: '<html><head><title>Just a moment...</title></head><body>Checking if the site connection is secure</body></html>',
});
assert.strictEqual(challenge.isChallengePage, true);
assert.strictEqual(challenge.metadataAvailable, false);
assert.strictEqual(challenge.shouldExtractLinks, false);
assert.strictEqual(challenge.fallbackTitle, 'app');

const error = classifyScanResponse({
  url: 'https://example.com/missing-page',
  finalUrl: 'https://example.com/missing-page',
  status: 404,
  html: '<html><head><title>Just a moment...</title></head><body><a href="/fake-child">Fake</a></body></html>',
});
assert.strictEqual(error.metadataAvailable, false);
assert.strictEqual(error.shouldExtractLinks, false);
assert.strictEqual(error.fallbackTitle, 'missing page');

const insights = analyzeMapInsights({
  root: {
    id: 'home',
    url: 'https://example.com/',
    title: 'Example Home',
    statusCode: 200,
    description: 'A useful description for the homepage.',
    h1s: ['Example Home'],
    children: [
      {
        id: 'blocked-a',
        url: 'https://example.com/a',
        title: 'Just a moment...',
        statusCode: 200,
        isChallengePage: true,
        blockedReason: 'challenge_page',
        metadataAvailable: false,
        children: [],
      },
      {
        id: 'blocked-b',
        url: 'https://example.com/b',
        title: 'Just a moment...',
        statusCode: 403,
        authRequired: true,
        blockedReason: 'auth_required',
        metadataAvailable: false,
        children: [],
      },
    ],
  },
  scanId: 'classification-fixture',
});

assert.ok(insights.findings.some((finding) => finding.title === '4xx page'));
assert.ok(!insights.findings.some((finding) => (
  finding.title === 'Duplicate title'
    && finding.evidence?.value === 'just a moment...'
)));

console.log('Scan page classification fixture check passed.');
