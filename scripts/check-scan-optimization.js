const assert = require('assert');
const {
  buildPreservedNumberMap,
  buildRepetitiveGroups,
  compareNaturalScanUrls,
  compareScanNumberStrings,
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
  { url: 'https://example.com/about', order: 0, exact: true },
  { url: 'https://example.com/blog', order: 1, exact: true },
  { url: 'https://example.com/blog/post-1', order: 2, exact: true },
  { url: 'https://example.com/pricing', order: 3, exact: true },
], 'https://example.com/blog/post-1', {
  completeParentUrls: ['https://example.com/', 'https://example.com/blog'],
});
assert.equal(numbers.get('https://example.com/'), '0');
assert.equal(numbers.get('https://example.com/blog'), '2');
assert.equal(numbers.get('https://example.com/blog/post-1'), '2.1');
assert.notEqual(numbers.get('https://example.com/blog/post-1'), '0');

const queryNumbers = buildPreservedNumberMap([
  { url: 'https://example.com/about', order: 0, exact: true },
  { url: 'https://example.com/blog', order: 1, exact: true },
  { url: 'https://example.com/blog/post-1', order: 2, exact: true },
  { url: 'https://example.com/blog/post-1?edition=gb', order: 3, exact: true },
], 'https://example.com/blog/post-1?edition=gb', {
  completeParentUrls: ['https://example.com/', 'https://example.com/blog'],
});
assert.equal(queryNumbers.get('https://example.com/blog/post-1'), '2.1');
assert.equal(queryNumbers.get('https://example.com/blog/post-1?edition=gb'), '2.2');
assert.notEqual(queryNumbers.get('https://example.com/blog/post-1?edition=gb'), '0');

const unknownNumbers = buildPreservedNumberMap([
  { url: 'https://example.com/blog', order: 0 },
  ...Array.from({ length: 12 }, (_, index) => ({
    url: `https://example.com/blog/post-${index + 1}`,
    order: index + 1,
  })),
  { url: 'https://example.com/blog/post-1/comments', order: 20 },
], 'https://example.com/blog/post-1');
assert.equal(unknownNumbers.get('https://example.com/blog'), 'X');
assert.equal(unknownNumbers.get('https://example.com/blog/post-1'), 'X.1');
assert.equal(unknownNumbers.get('https://example.com/blog/post-1/comments'), 'X.1.1');

const offPathNumbers = buildPreservedNumberMap([
  { url: 'https://example.com/section/art-design', order: 0 },
  {
    url: 'https://example.com/2026/07/story',
    parentUrl: 'https://example.com/section/art-design',
    order: 1,
    exact: true,
  },
], 'https://example.com/section/art-design');
assert.equal(offPathNumbers.has('https://example.com/2026'), false);
assert.equal(offPathNumbers.has('https://example.com/2026/07'), false);
assert.equal(offPathNumbers.get('https://example.com/section/art-design'), 'X.1');
assert.equal(offPathNumbers.get('https://example.com/2026/07/story'), 'X.1.1');

const stableEntries = [
  { url: 'https://example.com/news/10', order: 99 },
  { url: 'https://example.com/news/2', order: 0 },
  { url: 'https://example.com/news/1', order: 50 },
];
const stableNumbers = buildPreservedNumberMap(
  stableEntries,
  'https://example.com/news'
);
const shuffledStableNumbers = buildPreservedNumberMap(
  [...stableEntries].reverse(),
  'https://example.com/news'
);
assert.equal(stableNumbers.get('https://example.com/news'), 'X.1');
assert.equal(stableNumbers.get('https://example.com/news/1'), 'X.1.1');
assert.equal(stableNumbers.get('https://example.com/news/2'), 'X.1.2');
assert.equal(stableNumbers.get('https://example.com/news/10'), 'X.1.3');
assert.deepEqual(
  Array.from(stableNumbers.entries()),
  Array.from(shuffledStableNumbers.entries())
);
assert.equal(compareNaturalScanUrls('https://example.com/03', 'https://example.com/10') < 0, true);
assert.equal(compareScanNumberStrings('XX.4.3.5', 'XX.4.3.10') < 0, true);

const twentyUrls = Array.from({ length: 20 }, (_, index) => `https://example.com/threshold/item-${index + 1}`);
assert.equal(buildRepetitiveGroups(twentyUrls).length, 0);

const blogUrls = Array.from({ length: 21 }, (_, index) => `https://example.com/blog/post-${index + 1}`);
const newsUrls = Array.from({ length: 21 }, (_, index) => `https://example.com/news/story-${index + 1}`);
const paginationUrls = Array.from({ length: 21 }, (_, index) => `https://example.com/news?page=${index + 1}`);
const datedUrls = Array.from(
  { length: 21 },
  (_, index) => `https://example.com/archive/2026/${String((index % 12) + 1).padStart(2, '0')}/entry-${index + 1}`
);
const groups = buildRepetitiveGroups([...blogUrls, blogUrls[0], ...newsUrls, ...datedUrls, ...paginationUrls]);
assert.equal(groups.length, 4);
assert.equal(groups[0].capturedEntries.length, 10);
assert.equal(groups[0].deferredEntries.length, 11);
assert.equal(groups[1].capturedEntries.length, 10);
assert.equal(groups[1].deferredEntries.length, 11);
assert.equal(groups[0].parentUrl, 'https://example.com/blog');
assert.equal(groups[1].parentUrl, 'https://example.com/news');
assert.equal(groups[2].parentUrl, 'https://example.com/archive');
assert.equal(groups[2].routeTemplate, 'archive/:number/:number/:mixed');
assert.equal(groups[3].parentUrl, 'https://example.com/news');
assert.equal(groups[3].shape, 'query');
assert.equal(groups[3].routeTemplate, 'news?page=:number');
assert.notEqual(groups[1].groupId, groups[3].groupId);

assert.equal(sampleSignalsAreCompatible(['schema:article', 'schema:article', 'schema:article']), true);
assert.equal(sampleSignalsAreCompatible(['schema:article', 'schema:jobposting', 'element:product']), false);

console.log('Scan optimization checks passed');
