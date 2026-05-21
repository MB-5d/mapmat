export const SCAN_COLLAPSED_PARTIAL_REASON = 'scan_collapsed';

export const countScanResultNodes = (node) => {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countScanResultNodes(child), 0);
};

export const isCollapsedScanResult = (result) => (
  result?.partial === true && result?.partialReason === SCAN_COLLAPSED_PARTIAL_REASON
);

export const shouldPreserveExistingMapForCollapsedScan = ({ result, nextRoot, existingRoot }) => (
  isCollapsedScanResult(result)
  && countScanResultNodes(existingRoot) > 1
  && countScanResultNodes(nextRoot) <= 1
);

export const getCollapsedScanMessage = (hostname = '') => {
  const suffix = hostname ? ` for ${hostname}` : '';
  return `Scan could not confirm more than the homepage${suffix}. Keeping your current map.`;
};
