const DEFAULT_ACCOUNTED_MILESTONE_SIZE = 5000;
const DEFAULT_DISCOVERY_LIMIT_MIN = 5000;
const DEFAULT_DISCOVERY_LIMIT_MAX = 200000;
const DEFAULT_DISCOVERY_LIMIT_MULTIPLIER = 4;

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function getScanDiscoveryLimit(allowedFetchedPages, {
  minimum = DEFAULT_DISCOVERY_LIMIT_MIN,
  maximum = DEFAULT_DISCOVERY_LIMIT_MAX,
  multiplier = DEFAULT_DISCOVERY_LIMIT_MULTIPLIER,
} = {}) {
  const normalizedMinimum = Math.max(1, toNonNegativeInteger(minimum, DEFAULT_DISCOVERY_LIMIT_MIN));
  const normalizedMaximum = Math.max(
    normalizedMinimum,
    toNonNegativeInteger(maximum, DEFAULT_DISCOVERY_LIMIT_MAX)
  );
  const normalizedMultiplier = Math.max(1, toNonNegativeInteger(multiplier, DEFAULT_DISCOVERY_LIMIT_MULTIPLIER));
  const normalizedAllowance = toNonNegativeInteger(allowedFetchedPages, normalizedMaximum);
  return Math.min(
    normalizedMaximum,
    Math.max(normalizedMinimum, normalizedAllowance * normalizedMultiplier)
  );
}

function countUniqueCoverage(fetchedUrls, groupedUrls) {
  const fetched = fetchedUrls instanceof Set ? fetchedUrls : new Set(fetchedUrls || []);
  const grouped = groupedUrls instanceof Set ? groupedUrls : new Set(groupedUrls || []);
  let accounted = fetched.size;
  grouped.forEach((url) => {
    if (!fetched.has(url)) accounted += 1;
  });
  return accounted;
}

function getScanCoverageMetrics({
  fetchedUrls,
  groupedUrls,
  discoveredCount = 0,
  milestoneSize = DEFAULT_ACCOUNTED_MILESTONE_SIZE,
} = {}) {
  const accounted = countUniqueCoverage(fetchedUrls, groupedUrls);
  const normalizedMilestoneSize = Math.max(
    1,
    toNonNegativeInteger(milestoneSize, DEFAULT_ACCOUNTED_MILESTONE_SIZE)
  );
  const discovered = Math.max(accounted, toNonNegativeInteger(discoveredCount));
  return {
    accounted,
    accountedMilestonesCompleted: Math.floor(accounted / normalizedMilestoneSize),
    accountedMilestoneSize: normalizedMilestoneSize,
    discovered,
    remaining: Math.max(0, discovered - accounted),
  };
}

function getScanCapacityPartialReason({
  targetedGroupCapture = false,
  stopRequested = false,
  entitlementCappedScan = false,
  fetchedCount = 0,
  allowedFetchedPages = null,
  pendingCount = 0,
  discoveryCapReached = false,
} = {}) {
  if (targetedGroupCapture || stopRequested) return null;
  const normalizedFetchedCount = toNonNegativeInteger(fetchedCount);
  const normalizedPendingCount = toNonNegativeInteger(pendingCount);
  const hasFetchedLimit = Number.isFinite(Number(allowedFetchedPages));
  const normalizedFetchedLimit = hasFetchedLimit
    ? toNonNegativeInteger(allowedFetchedPages)
    : null;
  if (
    normalizedFetchedLimit !== null
    && normalizedFetchedCount >= normalizedFetchedLimit
    && normalizedPendingCount > 0
  ) {
    return entitlementCappedScan ? 'entitlement_cap' : 'scan_safety_cap';
  }
  return discoveryCapReached ? 'scan_discovery_cap' : null;
}

module.exports = {
  DEFAULT_ACCOUNTED_MILESTONE_SIZE,
  DEFAULT_DISCOVERY_LIMIT_MAX,
  DEFAULT_DISCOVERY_LIMIT_MIN,
  getScanCoverageMetrics,
  getScanCapacityPartialReason,
  getScanDiscoveryLimit,
};
