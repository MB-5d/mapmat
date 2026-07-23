/* eslint-disable no-console */
const assert = require('assert');

const {
  countScanTreeNodes,
  getInvalidScanResultReason,
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
  'capped root-only discovered scan should preserve the collapse reason'
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

const guestLimitCollapse = makeRootOnlyResult();
hardenCollapsedScanResult(guestLimitCollapse, {
  entitlementCapped: false,
  progress: {
    scanned: 1,
    queued: 356,
  },
});
assert.strictEqual(
  guestLimitCollapse.partialReason,
  'scan_collapsed',
  'guest root-only scan with queued pages should be marked collapsed'
);

const diagnosticsQueueCollapse = makeRootOnlyResult();
diagnosticsQueueCollapse.scanDiagnostics = {
  visitedCount: 1,
  queueRemaining: 356,
  queuedCount: 357,
};
hardenCollapsedScanResult(diagnosticsQueueCollapse);
assert.strictEqual(
  diagnosticsQueueCollapse.partialReason,
  'scan_collapsed',
  'root-only scan with queued diagnostics should be marked collapsed'
);
assert.strictEqual(
  diagnosticsQueueCollapse.scanDiagnostics?.collapseReason,
  'queue_had_discovered_pages',
  'queued diagnostics should explain the collapse signal'
);

const trueOnePageScan = makeRootOnlyResult();
hardenCollapsedScanResult(trueOnePageScan, {
  entitlementCapped: false,
  progress: {
    scanned: 1,
    queued: 0,
  },
});
assert.strictEqual(
  trueOnePageScan.partialReason,
  undefined,
  'uncapped one-page scan with no queued pages should stay complete'
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

const stoppedRootOnlyWithQueue = makeRootOnlyResult();
stoppedRootOnlyWithQueue.partial = true;
stoppedRootOnlyWithQueue.partialReason = 'stopped_by_user';
hardenCollapsedScanResult(stoppedRootOnlyWithQueue, {
  progress: {
    scanned: 1,
    queued: 38,
  },
});
assert.strictEqual(
  stoppedRootOnlyWithQueue.partialReason,
  'scan_collapsed',
  'stopped root-only scan with discovered pages should not become a fake one-page map'
);
assert.strictEqual(
  stoppedRootOnlyWithQueue.scanDiagnostics?.previousPartialReason,
  'stopped_by_user',
  'collapse diagnostics should preserve the original stop reason'
);
assert(
  stoppedRootOnlyWithQueue.scanDiagnostics?.collapseReason.includes('stopped_before_valid_partial'),
  'stopped root-only collapse should explain that no usable partial map was ready'
);

const stoppedRootOnlyWithoutDiscovery = makeRootOnlyResult();
stoppedRootOnlyWithoutDiscovery.partial = true;
stoppedRootOnlyWithoutDiscovery.partialReason = 'stopped_by_user';
hardenCollapsedScanResult(stoppedRootOnlyWithoutDiscovery, {
  progress: {
    scanned: 1,
    mapped: 1,
    queued: 0,
  },
});
assert.strictEqual(
  stoppedRootOnlyWithoutDiscovery.partialReason,
  'scan_collapsed',
  'stopped root-only scan without discovery proof should not become a fake one-page map'
);
assert.strictEqual(
  stoppedRootOnlyWithoutDiscovery.scanDiagnostics?.collapseReason,
  'stopped_before_valid_partial',
  'stopped root-only scan should use the stopped-before-valid-partial reason'
);

const mappedProgressCollapse = makeRootOnlyResult();
hardenCollapsedScanResult(mappedProgressCollapse, {
  progress: {
    scanned: 10,
    mapped: 4,
    queued: 0,
  },
});
assert.strictEqual(
  mappedProgressCollapse.partialReason,
  'scan_collapsed',
  'root-only scan with mapped progress should be marked collapsed'
);
assert.strictEqual(
  mappedProgressCollapse.scanDiagnostics?.pageMapCount,
  4,
  'collapsed scan should preserve mapped progress for diagnostics'
);
assert.strictEqual(
  mappedProgressCollapse.scanDiagnostics?.collapseReason,
  'progress_mapped_pages',
  'mapped progress should explain the collapse signal'
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

const focusedDiscoveryFailure = {
  ...makeRootOnlyResult(),
  root: {
    id: 'focus-home',
    nodeKind: 'focus-ghost',
    children: [makeRootOnlyResult().root],
  },
  partial: true,
  partialReason: 'root_discovery_failed',
  scanDiagnostics: {
    capturedTreeNodeCount: 1,
  },
};
assert.strictEqual(
  getInvalidScanResultReason(focusedDiscoveryFailure),
  'root_discovery_failed',
  'focused ghost ancestors must not make a failed one-page scan look valid'
);

const focusedChallengeResult = {
  ...focusedDiscoveryFailure,
  scanScope: {
    focused: true,
  },
  scanDiagnostics: {
    capturedTreeNodeCount: 1,
    rootClassification: 'scan_limited',
    rootStatus: 403,
  },
};
assert.strictEqual(
  getInvalidScanResultReason(focusedChallengeResult),
  null,
  'focused challenge pages should complete as limited maps so the real issue remains visible'
);

console.log('[scan-result-quality] Passed.');
