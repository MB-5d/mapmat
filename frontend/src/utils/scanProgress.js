const toCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const normalizeFindings = (findings = {}) => Object.fromEntries(
  Object.entries(findings || {}).map(([key, value]) => [key, toCount(value)])
);

export const createEmptyScanProgress = () => ({
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

export const reconcileScanProgress = (current = {}, incoming = {}) => {
  if (!incoming || typeof incoming !== 'object') return current;

  const currentSequence = toCount(current.sequence);
  const incomingSequence = toCount(incoming.sequence);
  if (currentSequence > 0 && incomingSequence > 0 && incomingSequence < currentSequence) {
    return current;
  }
  if (currentSequence > 0 && incomingSequence === 0) {
    return current;
  }

  const processed = Math.max(
    toCount(current.processed ?? current.scanned),
    toCount(incoming.processed ?? incoming.scanned)
  );
  const scanned = processed;
  const captured = Math.max(
    toCount(current.captured ?? current.mapped),
    toCount(incoming.captured ?? incoming.mapped)
  );
  const mapped = captured;
  const incomingQueued = toCount(incoming.queued);
  const queued = incomingSequence >= currentSequence
    ? incomingQueued
    : toCount(current.queued);
  const deferred = incomingSequence >= currentSequence
    ? toCount(incoming.deferred)
    : toCount(current.deferred);
  const blocked = incomingSequence >= currentSequence
    ? toCount(incoming.blocked)
    : toCount(current.blocked);
  const failed = incomingSequence >= currentSequence
    ? toCount(incoming.failed)
    : toCount(current.failed);
  const discovered = Math.max(
    toCount(current.discovered),
    toCount(incoming.discovered),
    toCount(current.processed ?? current.scanned) + toCount(current.queued),
    toCount(incoming.processed ?? incoming.scanned) + incomingQueued,
    processed,
    captured
  );
  const findings = incoming.findings
    ? normalizeFindings(incoming.findings)
    : normalizeFindings(current.findings);
  const totalFindings = incoming.totalFindings !== undefined
    ? toCount(incoming.totalFindings)
    : Object.values(findings).reduce((sum, value) => sum + value, 0);
  const next = {
    ...current,
    ...incoming,
    scanned,
    processed,
    mapped,
    captured,
    deferred,
    blocked,
    failed,
    queued,
    discovered,
    sequence: Math.max(currentSequence, incomingSequence),
    findings,
    totalFindings,
  };

  return JSON.stringify(next) === JSON.stringify(current) ? current : next;
};
