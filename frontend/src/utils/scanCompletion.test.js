import {
  countScanResultNodes,
  getCollapsedScanMessage,
  isCollapsedScanResult,
  shouldPreserveExistingMapForCollapsedScan,
} from './scanCompletion';

const rootOnly = { id: 'root', children: [] };
const multiNode = { id: 'root', children: [{ id: 'child', children: [] }] };

test('detects scan-collapsed partial results', () => {
  expect(isCollapsedScanResult({ partial: true, partialReason: 'scan_collapsed' })).toBe(true);
  expect(isCollapsedScanResult({ partial: true, partialReason: 'stopped_by_user' })).toBe(false);
  expect(isCollapsedScanResult({ partial: false })).toBe(false);
});

test('preserves an existing multi-node map when the next result collapsed to one node', () => {
  expect(shouldPreserveExistingMapForCollapsedScan({
    result: { partial: true, partialReason: 'scan_collapsed' },
    nextRoot: rootOnly,
    existingRoot: multiNode,
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

test('uses a warning message that names the affected hostname', () => {
  expect(getCollapsedScanMessage('example.com')).toContain('example.com');
});
