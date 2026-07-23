const toCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const normalizeFindings = (findings = {}) => Object.fromEntries(
  Object.entries(findings || {}).map(([key, value]) => [key, toCount(value)])
);

export const createEmptyScanProgress = () => ({
  scanned: 0,
  mapped: 0,
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

  const scanned = Math.max(toCount(current.scanned), toCount(incoming.scanned));
  const mapped = Math.max(toCount(current.mapped), toCount(incoming.mapped));
  const incomingQueued = toCount(incoming.queued);
  const queued = incomingSequence >= currentSequence
    ? incomingQueued
    : toCount(current.queued);
  const discovered = Math.max(
    toCount(current.discovered),
    toCount(incoming.discovered),
    toCount(current.scanned) + toCount(current.queued),
    toCount(incoming.scanned) + incomingQueued,
    scanned,
    mapped
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
    mapped,
    queued,
    discovered,
    sequence: Math.max(currentSequence, incomingSequence),
    findings,
    totalFindings,
  };

  return JSON.stringify(next) === JSON.stringify(current) ? current : next;
};
