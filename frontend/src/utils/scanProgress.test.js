import { createEmptyScanProgress, reconcileScanProgress } from './scanProgress';

test('keeps scan counts monotonic when an older progress payload arrives late', () => {
  const current = {
    scanned: 30,
    mapped: 24,
    queued: 18,
    discovered: 48,
    sequence: 12,
    findings: { brokenLinks: 2 },
    totalFindings: 2,
  };

  expect(reconcileScanProgress(current, {
    scanned: 10,
    mapped: 10,
    queued: 0,
    discovered: 10,
    sequence: 8,
  })).toBe(current);
});

test('allows the newest update to reduce the queue without reducing captured counts', () => {
  const next = reconcileScanProgress({
    scanned: 30,
    mapped: 24,
    queued: 18,
    discovered: 48,
    sequence: 12,
  }, {
    scanned: 48,
    mapped: 30,
    queued: 0,
    discovered: 48,
    sequence: 13,
    final: true,
  });

  expect(next).toMatchObject({
    scanned: 48,
    mapped: 30,
    queued: 0,
    discovered: 48,
    sequence: 13,
    final: true,
  });
});

test('starts with a complete empty progress shape', () => {
  expect(createEmptyScanProgress()).toEqual({
    scanned: 0,
    mapped: 0,
    queued: 0,
    discovered: 0,
    sequence: 0,
  });
});
