const assert = require('assert');

const { buildMapDisplaySummary, buildMapScene } = require('../utils/mapScene');

const root = {
  id: 'home',
  title: 'Home',
  children: [
    {
      id: 'primary-1',
      title: 'Primary',
      isDuplicate: true,
      annotations: { status: 'moved' },
      children: [
        {
          id: 'primary-1-missing',
          title: 'Missing',
          isMissing: true,
          isVirtualMissing: true,
          scanStatus: 'missing',
        },
        {
          id: 'primary-1-inactive',
          title: 'Inactive',
          isInactive: true,
        },
        {
          id: 'primary-1-1',
          title: 'Deep',
          isError: true,
          children: [
            { id: 'primary-1-1-1', title: 'Deepest' },
          ],
        },
      ],
    },
  ],
};

const orphans = [
  {
    id: 'subdomain-root',
    title: 'Subdomain',
    subdomainRoot: true,
    orphanType: 'subdomain',
    authRequired: true,
    children: [{ id: 'subdomain-child', title: 'Sub child' }],
  },
  {
    id: 'orphan-root',
    title: 'Orphan root',
    orphanType: 'orphan',
    children: [
      {
        id: 'orphan-broken-child',
        title: 'Broken child',
        isBroken: true,
        annotations: { status: 'to_delete' },
      },
    ],
  },
];

const summary = buildMapDisplaySummary(root, orphans);
assert.strictEqual(summary.maxDepth, 3);
assert.strictEqual(summary.scanLayerAvailability.placementPrimary, true);
assert.strictEqual(summary.scanLayerAvailability.placementSubdomain, true);
assert.strictEqual(summary.scanLayerAvailability.placementOrphan, true);
assert.strictEqual(summary.scanLayerAvailability.statusMissing, true);
assert.strictEqual(summary.scanLayerAvailability.statusBroken, true);
assert.strictEqual(summary.scanLayerAvailability.statusError, true);
assert.strictEqual(summary.scanLayerAvailability.statusInactive, true);
assert.strictEqual(summary.scanLayerAvailability.statusAuth, true);
assert.strictEqual(summary.scanLayerAvailability.statusDuplicate, true);
assert.deepStrictEqual(
  new Set(summary.markerStatusValues),
  new Set(['moved', 'to_delete'])
);

const nearScene = buildMapScene({
  root,
  orphans,
  includeDisplaySummary: true,
  viewport: { x: 0, y: 0, w: 320, h: 240, zoom: 1, overscan: 0 },
});
const farScene = buildMapScene({
  root,
  orphans,
  includeDisplaySummary: true,
  viewport: { x: 100000, y: 100000, w: 320, h: 240, zoom: 1, overscan: 0 },
});

const assertSameSummary = (actual, expected) => {
  assert.strictEqual(actual.maxDepth, expected.maxDepth);
  assert.deepStrictEqual(actual.scanLayerAvailability, expected.scanLayerAvailability);
  assert.deepStrictEqual(new Set(actual.markerStatusValues), new Set(expected.markerStatusValues));
};

assertSameSummary(nearScene.displaySummary, summary);
assertSameSummary(farScene.displaySummary, summary);
assert.strictEqual(farScene.visibleNodeCount < farScene.nodeCount, true);

console.log('Map display summary checks passed');
