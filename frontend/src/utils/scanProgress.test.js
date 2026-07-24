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
    processed: 30,
    mapped: 24,
    captured: 24,
    deferred: 8,
    queued: 18,
    discovered: 48,
    sequence: 12,
  }, {
    scanned: 48,
    processed: 48,
    mapped: 30,
    captured: 30,
    deferred: 0,
    queued: 0,
    discovered: 48,
    sequence: 13,
    final: true,
  });

  expect(next).toMatchObject({
    scanned: 48,
    processed: 48,
    mapped: 30,
    captured: 30,
    deferred: 0,
    queued: 0,
    discovered: 48,
    sequence: 13,
    final: true,
  });
});

test('keeps a stable session clock while discovery expands and a stream reconnects', () => {
  const startedAt = '2026-07-24T12:00:00.000Z';
  const expanded = reconcileScanProgress({
    processed: 20,
    captured: 12,
    queued: 20,
    discovered: 40,
    sequence: 7,
    sessionStartedAt: startedAt,
  }, {
    processed: 24,
    captured: 14,
    deferred: 3,
    queued: 26,
    discovered: 50,
    sequence: 8,
    sessionStartedAt: startedAt,
  });

  expect(expanded).toMatchObject({
    processed: 24,
    captured: 14,
    deferred: 3,
    queued: 26,
    discovered: 50,
    sequence: 8,
    sessionStartedAt: startedAt,
  });

  const reconnected = reconcileScanProgress(expanded, {
    processed: 50,
    captured: 30,
    deferred: 20,
    queued: 0,
    discovered: 50,
    sequence: 9,
    sessionStartedAt: startedAt,
    final: true,
  });
  expect(reconnected).toMatchObject({
    processed: 50,
    discovered: 50,
    sequence: 9,
    sessionStartedAt: startedAt,
    final: true,
  });
});

test('starts with a complete empty progress shape', () => {
  expect(createEmptyScanProgress()).toEqual({
    scanned: 0,
    processed: 0,
    mapped: 0,
    captured: 0,
    deferred: 0,
    blocked: 0,
    failed: 0,
    queued: 0,
    discovered: 0,
    sequence: 0,
  });
});
