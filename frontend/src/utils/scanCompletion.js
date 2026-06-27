export const SCAN_COLLAPSED_PARTIAL_REASON = 'scan_collapsed';
export const ROOT_DISCOVERY_FAILED_PARTIAL_REASON = 'root_discovery_failed';
export const ENTITLEMENT_CAP_PARTIAL_REASON = 'entitlement_cap';
export const STOPPED_BY_USER_PARTIAL_REASON = 'stopped_by_user';

export const countScanResultNodes = (node) => {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countScanResultNodes(child), 0);
};

export const isCollapsedScanResult = (result) => (
  result?.partial === true && result?.partialReason === SCAN_COLLAPSED_PARTIAL_REASON
);

export const isRootOnlyDegradedScanResult = (result) => (
  result?.partial === true
  && (
    result?.partialReason === SCAN_COLLAPSED_PARTIAL_REASON
    || result?.partialReason === ROOT_DISCOVERY_FAILED_PARTIAL_REASON
  )
);

export const isEntitlementLimitedScanResult = (result) => (
  result?.partialReason === ENTITLEMENT_CAP_PARTIAL_REASON
  || Boolean(result?.entitlement?.capped && result.entitlement.limitReached !== false)
);

export const shouldPreserveExistingMapForCollapsedScan = ({ result, nextRoot, existingRoot }) => (
  isRootOnlyDegradedScanResult(result)
  && countScanResultNodes(existingRoot) > 1
  && countScanResultNodes(nextRoot) <= 1
);

export const shouldRejectFreshRootOnlyScan = ({ result, nextRoot }) => {
  if (countScanResultNodes(nextRoot) > 1) return false;
  if (isRootOnlyDegradedScanResult(result)) return true;
  return result?.partial === true
    && result?.partialReason === STOPPED_BY_USER_PARTIAL_REASON;
};

export const getCollapsedScanMessage = (hostname = '') => {
  const suffix = hostname ? ` for ${hostname}` : '';
  return `Scan could not confirm more than the homepage${suffix}. Keeping your current map.`;
};

export const getRootOnlyScanFailureMessage = (hostname = '') => {
  const suffix = hostname ? ` for ${hostname}` : '';
  return `Scan could not confirm enough pages${suffix}. No map was created.`;
};
