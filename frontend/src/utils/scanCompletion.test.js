import {
  countScanResultNodes,
  getCollapsedScanMessage,
  getRootOnlyScanFailureMessage,
  isEntitlementLimitedScanResult,
  isCollapsedScanResult,
  isRootOnlyDegradedScanResult,
  shouldPreserveExistingMapForCollapsedScan,
  shouldRejectFreshRootOnlyScan,
} from './scanCompletion';

const rootOnly = { id: 'root', children: [] };
const multiNode = { id: 'root', children: [{ id: 'child', children: [] }] };

test('detects scan-collapsed partial results', () => {
  expect(isCollapsedScanResult({ partial: true, partialReason: 'scan_collapsed' })).toBe(true);
  expect(isCollapsedScanResult({ partial: true, partialReason: 'stopped_by_user' })).toBe(false);
  expect(isCollapsedScanResult({ partial: false })).toBe(false);
});

test('detects root-only degraded scan results', () => {
  expect(isRootOnlyDegradedScanResult({ partial: true, partialReason: 'scan_collapsed' })).toBe(true);
  expect(isRootOnlyDegradedScanResult({ partial: true, partialReason: 'root_discovery_failed' })).toBe(true);
  expect(isRootOnlyDegradedScanResult({ partial: true, partialReason: 'stopped_by_user' })).toBe(false);
});

test('detects entitlement-limited scan results', () => {
  expect(isEntitlementLimitedScanResult({ partial: true, partialReason: 'entitlement_cap' })).toBe(true);
  expect(isEntitlementLimitedScanResult({
    partial: true,
    partialReason: 'scan_collapsed',
    entitlement: { capped: true, limitReached: true, lockedPageEstimate: 170 },
  })).toBe(true);
  expect(isEntitlementLimitedScanResult({ partial: true, partialReason: 'scan_collapsed' })).toBe(false);
});

test('preserves an existing multi-node map when the next result collapsed to one node', () => {
  expect(shouldPreserveExistingMapForCollapsedScan({
    result: { partial: true, partialReason: 'scan_collapsed' },
    nextRoot: rootOnly,
    existingRoot: multiNode,
  })).toBe(true);
});

test('preserves an existing multi-node map when root discovery failed to one node', () => {
  expect(shouldPreserveExistingMapForCollapsedScan({
    result: { partial: true, partialReason: 'root_discovery_failed' },
    nextRoot: rootOnly,
    existingRoot: multiNode,
  })).toBe(true);
});

test('rejects a fresh root discovery failure instead of showing it as success', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: true, partialReason: 'root_discovery_failed' },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(true);
});

test('rejects a fresh collapsed scan instead of showing one node as success', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: true, partialReason: 'scan_collapsed' },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(true);
});

test('rejects capped degraded one-node scans instead of showing a scan-limit preview', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: {
      partial: true,
      partialReason: 'scan_collapsed',
      entitlement: { capped: true, limitReached: true, lockedPageEstimate: 170 },
    },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(true);
});

test('allows pure entitlement-cap one-node scans when there is no degraded signal', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: true, partialReason: 'entitlement_cap' },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(false);
});

test('rejects degraded fresh one-node scans even when an old map is loaded', () => {
  expect(countScanResultNodes(rootOnly)).toBe(1);
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: true, partialReason: 'scan_collapsed' },
    nextRoot: rootOnly,
    existingRoot: multiNode,
  })).toBe(true);
});

test('allows true one-node scans when there is no degraded partial signal', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: false },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(false);
});

test('allows stopped scans to show current results', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: true, partialReason: 'stopped_by_user' },
    nextRoot: multiNode,
    existingRoot: rootOnly,
  })).toBe(false);
});

test('rejects stopped root-only scans when discovery proves more pages exist', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: {
      partial: true,
      partialReason: 'stopped_by_user',
      scanDiagnostics: {
        queueRemaining: 38,
        pageMapCount: 1,
      },
    },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(true);
});

test('allows stopped true one-page scans when there is no discovery signal', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: {
      partial: true,
      partialReason: 'stopped_by_user',
      scanDiagnostics: {
        queueRemaining: 0,
        pageMapCount: 1,
      },
    },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(false);
});

test('rejects fresh degraded root-only scans', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: true, partialReason: 'root_discovery_failed' },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(true);
});

test('uses a warning message that names the affected hostname', () => {
  expect(getCollapsedScanMessage('example.com')).toContain('example.com');
  expect(getRootOnlyScanFailureMessage('example.com')).toContain('example.com');
});
