import {
  countScanResultNodes,
  getCollapsedScanMessage,
  getRootOnlyScanFailureMessage,
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

test('rejects a fresh degraded root-only scan instead of showing it as success', () => {
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: true, partialReason: 'root_discovery_failed' },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(true);
  expect(shouldRejectFreshRootOnlyScan({
    result: { partial: true, partialReason: 'scan_collapsed' },
    nextRoot: rootOnly,
    existingRoot: rootOnly,
  })).toBe(true);
});

test('allows true one-node scans when there is no existing multi-node map to protect', () => {
  expect(countScanResultNodes(rootOnly)).toBe(1);
  expect(shouldPreserveExistingMapForCollapsedScan({
    result: { partial: true, partialReason: 'scan_collapsed' },
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
