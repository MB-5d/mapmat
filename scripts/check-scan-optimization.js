const assert = require('assert');
const {
  buildPreservedNumberMap,
  buildRepetitiveGroups,
  createFocusedScanDescriptor,
  getFocusedAncestorUrls,
  isUrlWithinFocusedPath,
  sampleSignalsAreCompatible,
} = require('../utils/scanOptimization');

const focus = createFocusedScanDescriptor('https://example.com/blog');
assert.equal(focus.focused, true);
assert.equal(focus.siteRootUrl, 'https://example.com/');
assert.equal(isUrlWithinFocusedPath('https://example.com/blog', focus), true);
assert.equal(isUrlWithinFocusedPath('https://example.com/blog/post-1', focus), true);
assert.equal(isUrlWithinFocusedPath('https://example.com/blogger', focus), false);
assert.equal(isUrlWithinFocusedPath('https://example.com/pricing', focus), false);
assert.equal(isUrlWithinFocusedPath('https://other.example.com/blog', focus), false);

const queryFocus = createFocusedScanDescriptor('https://example.com/blog?edition=gb');
assert.equal(isUrlWithinFocusedPath('https://example.com/blog?edition=gb', queryFocus), true);
assert.equal(isUrlWithinFocusedPath('https://example.com/blog', queryFocus), false);
assert.equal(isUrlWithinFocusedPath('https://example.com/blog?edition=us', queryFocus), false);
assert.equal(isUrlWithinFocusedPath('https://example.com/blog/post-1', queryFocus), true);

assert.deepEqual(
  getFocusedAncestorUrls('https://example.com/blog/category/news'),
  [
    'https://example.com/',
    'https://example.com/blog',
    'https://example.com/blog/category',
    'https://example.com/blog/category/news',
  ]
);
assert.deepEqual(
  getFocusedAncestorUrls('https://example.com/blog/post-1?edition=gb'),
  [
    'https://example.com/',
    'https://example.com/blog',
  ]
);

const numbers = buildPreservedNumberMap([
  { url: 'https://example.com/about', order: 0 },
  { url: 'https://example.com/blog', order: 1 },
  { url: 'https://example.com/blog/post-1', order: 2 },
  { url: 'https://example.com/pricing', order: 3 },
], 'https://example.com/blog/post-1');
assert.equal(numbers.get('https://example.com/'), '0');
assert.equal(numbers.get('https://example.com/blog'), '2');
assert.equal(numbers.get('https://example.com/blog/post-1'), '2.1');
assert.notEqual(numbers.get('https://example.com/blog/post-1'), '0');

const queryNumbers = buildPreservedNumberMap([
  { url: 'https://example.com/about', order: 0 },
  { url: 'https://example.com/blog', order: 1 },
  { url: 'https://example.com/blog/post-1', order: 2 },
], 'https://example.com/blog/post-1?edition=gb');
assert.equal(queryNumbers.get('https://example.com/blog/post-1'), '2.1');
assert.equal(queryNumbers.get('https://example.com/blog/post-1?edition=gb'), '2.2');
assert.notEqual(queryNumbers.get('https://example.com/blog/post-1?edition=gb'), '0');

const blogUrls = Array.from({ length: 20 }, (_, index) => `https://example.com/blog/post-${index + 1}`);
const newsUrls = Array.from({ length: 20 }, (_, index) => `https://example.com/news/story-${index + 1}`);
const datedUrls = Array.from(
  { length: 20 },
  (_, index) => `https://example.com/archive/2026/${String((index % 12) + 1).padStart(2, '0')}/entry-${index + 1}`
);
const groups = buildRepetitiveGroups([...blogUrls, blogUrls[0], ...newsUrls, ...datedUrls]);
assert.equal(groups.length, 3);
assert.equal(groups[0].capturedEntries.length, 10);
assert.equal(groups[0].deferredEntries.length, 10);
assert.equal(groups[1].capturedEntries.length, 10);
assert.equal(groups[1].deferredEntries.length, 10);
assert.equal(groups[0].parentUrl, 'https://example.com/blog');
assert.equal(groups[1].parentUrl, 'https://example.com/news');
assert.equal(groups[2].parentUrl, 'https://example.com/archive');
assert.equal(groups[2].routeTemplate, 'archive/:number/:number/:mixed');

assert.equal(sampleSignalsAreCompatible(['schema:article', 'schema:article', 'schema:article']), true);
assert.equal(sampleSignalsAreCompatible(['schema:article', 'schema:jobposting', 'element:product']), false);

console.log('Scan optimization checks passed');
