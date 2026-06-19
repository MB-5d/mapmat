/* eslint-disable no-console */
const assert = require('assert');

const {
  countScanTreeNodes,
  getRootOnlyCollapseReasons,
  hardenCollapsedScanResult,
} = require('../utils/scanResultQuality');

function makeRootOnlyResult() {
  return {
    root: {
      id: 'n_aHR0cHM6Ly9mbG9yYS5haS8',
      url: 'https://flora.ai/',
      title: 'FLORA - Your Creative Environment',
      children: [],
    },
    orphans: [],
    subdomains: [],
    errors: [],
    inactivePages: [],
    brokenLinks: [],
    files: [],
    crosslinks: [],
  };
}

const badStagingShape = makeRootOnlyResult();
hardenCollapsedScanResult(badStagingShape, {
  entitlementCapped: true,
  progress: {
    scanned: 16,
    queued: 170,
  },
});

assert.strictEqual(countScanTreeNodes(badStagingShape.root), 1, 'fixture should be root-only');
assert.strictEqual(badStagingShape.partial, true, 'root-only discovered scan should be partial');
assert.strictEqual(
  badStagingShape.partialReason,
  'scan_collapsed',
  'root-only discovered scan should be marked collapsed'
);
assert.strictEqual(
  badStagingShape.scanDiagnostics?.collapseReason,
  'progress_had_discovered_pages',
  'collapsed scan should explain the progress signal'
);
assert.strictEqual(
  badStagingShape.scanDiagnostics?.queueRemaining,
  170,
  'collapsed scan should preserve queued progress for entitlement metadata'
);
assert.strictEqual(
  badStagingShape.scanDiagnostics?.queuedCount,
  186,
  'collapsed scan should preserve total queued estimate for entitlement metadata'
);

const onePageCommonPathProbe = makeRootOnlyResult();
hardenCollapsedScanResult(onePageCommonPathProbe, {
  entitlementCapped: false,
  progress: {
    scanned: 16,
    queued: 11,
  },
});
assert.strictEqual(
  onePageCommonPathProbe.partialReason,
  undefined,
  'uncapped progress alone should not mark a true one-page site collapsed'
);

const diagnosticCollapse = makeRootOnlyResult();
diagnosticCollapse.scanDiagnostics = {
  pageMapCount: 3,
  rootAllowedLinks: 2,
};
hardenCollapsedScanResult(diagnosticCollapse);
assert.strictEqual(diagnosticCollapse.partialReason, 'scan_collapsed', 'diagnostic signals should still collapse');
assert.deepStrictEqual(
  getRootOnlyCollapseReasons(diagnosticCollapse),
  [],
  'already-partial scans should not be reclassified'
);

const existingPartial = makeRootOnlyResult();
existingPartial.partial = true;
existingPartial.partialReason = 'root_discovery_failed';
hardenCollapsedScanResult(existingPartial, {
  entitlementCapped: true,
  progress: {
    scanned: 10,
    queued: 50,
  },
});
assert.strictEqual(
  existingPartial.partialReason,
  'root_discovery_failed',
  'existing partial reason should be preserved'
);

console.log('[scan-result-quality] Passed.');
