function toNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function countScanTreeNodes(node) {
  if (!node) return 0;
  const seen = new Set();
  const stack = [node];
  let count = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    const key = String(current.id || current.url || `${count}:${stack.length}`);
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
    if (Array.isArray(current.children)) stack.push(...current.children);
  }
  return count;
}

function normalizeProgress(progress = {}) {
  return {
    scanned: toNonNegativeInteger(progress.scanned),
    mapped: toNonNegativeInteger(progress.mapped),
    queued: toNonNegativeInteger(progress.queued),
  };
}

const ROOT_ONLY_RECLASSIFIABLE_PARTIAL_REASONS = new Set([
  'entitlement_cap',
  'stopped_by_user',
]);

const ROOT_ONLY_DEGRADED_PARTIAL_REASONS = new Set([
  'scan_collapsed',
  'root_discovery_failed',
]);

function canReclassifyRootOnlyPartialReason(partialReason) {
  return !partialReason || ROOT_ONLY_RECLASSIFIABLE_PARTIAL_REASONS.has(partialReason);
}

function getRootOnlyCollapseReasons(result, context = {}) {
  if (!result?.root || !canReclassifyRootOnlyPartialReason(result.partialReason)) return [];
  const rootTreeNodeCount = countScanTreeNodes(result.root);
  if (rootTreeNodeCount > 1) return [];

  const diagnostics = result.scanDiagnostics || {};
  const progress = normalizeProgress(context.progress);
  const reasons = [];

  if (result.partialReason === 'stopped_by_user') reasons.push('stopped_before_valid_partial');
  if (toNonNegativeInteger(diagnostics.rootAllowedLinks) > 0) reasons.push('root_links_found');
  if (toNonNegativeInteger(diagnostics.sitemapUrlsQueued) > 0) reasons.push('sitemap_urls_queued');
  if (toNonNegativeInteger(diagnostics.commonPathActive) > 0) reasons.push('common_paths_active');
  if (toNonNegativeInteger(diagnostics.renderedLinksQueued) > 0) reasons.push('rendered_links_queued');
  if (toNonNegativeInteger(diagnostics.pageMapCount) > 1) reasons.push('page_map_has_pages');
  if (toNonNegativeInteger(diagnostics.queueRemaining) > 0) reasons.push('queue_had_discovered_pages');
  if (progress.mapped > rootTreeNodeCount) reasons.push('progress_mapped_pages');

  if (progress.scanned >= rootTreeNodeCount && progress.queued > 0) {
    reasons.push('progress_had_discovered_pages');
  }

  return reasons;
}

function getInvalidScanResultReason(result) {
  if (!result?.root) return 'no_root';
  const rootTreeNodeCount = countScanTreeNodes(result.root);
  if (rootTreeNodeCount > 1) return null;
  if (ROOT_ONLY_DEGRADED_PARTIAL_REASONS.has(result.partialReason)) return result.partialReason;
  if (result.partialReason === 'stopped_by_user') return 'stopped_before_valid_partial';
  return null;
}

function getInvalidScanResultMessage(reason) {
  if (reason === 'stopped_before_valid_partial') {
    return 'Scan stopped before a usable partial map was ready. No map was created.';
  }
  if (reason === 'root_discovery_failed') {
    return 'Scan could not confirm enough pages. No map was created.';
  }
  if (reason === 'scan_collapsed') {
    return 'Scan result collapsed before a valid map could be created. No map was created.';
  }
  return 'Scan completed but returned no valid map.';
}

function hardenCollapsedScanResult(result, context = {}) {
  const reasons = getRootOnlyCollapseReasons(result, context);
  if (reasons.length === 0) return result;

  const progress = normalizeProgress(context.progress);
  const rootTreeNodeCount = countScanTreeNodes(result.root);
  const rootChildCount = Array.isArray(result.root?.children) ? result.root.children.length : 0;
  const existingDiagnostics = result.scanDiagnostics && typeof result.scanDiagnostics === 'object'
    ? result.scanDiagnostics
    : {};
  const previousPartialReason = result.partialReason || null;
  const nextDiagnostics = {
    ...existingDiagnostics,
    treeNodeCount: toNonNegativeInteger(existingDiagnostics.treeNodeCount) || rootTreeNodeCount,
    rootChildCount: toNonNegativeInteger(existingDiagnostics.rootChildCount) || rootChildCount,
    collapseReason: reasons.join(','),
  };
  if (previousPartialReason && previousPartialReason !== 'scan_collapsed') {
    nextDiagnostics.previousPartialReason = previousPartialReason;
  }

  if (progress.scanned > 0 && !toNonNegativeInteger(nextDiagnostics.visitedCount)) {
    nextDiagnostics.visitedCount = progress.scanned;
  }
  if (progress.mapped > 0 && !toNonNegativeInteger(nextDiagnostics.pageMapCount)) {
    nextDiagnostics.pageMapCount = progress.mapped;
  }
  if (progress.queued > 0 && !toNonNegativeInteger(nextDiagnostics.queueRemaining)) {
    nextDiagnostics.queueRemaining = progress.queued;
  }
  if (progress.scanned > 0 && progress.queued > 0 && !toNonNegativeInteger(nextDiagnostics.queuedCount)) {
    nextDiagnostics.queuedCount = progress.scanned + progress.queued;
  }

  result.partial = true;
  result.partialReason = 'scan_collapsed';
  result.scanDiagnostics = nextDiagnostics;
  return result;
}

module.exports = {
  countScanTreeNodes,
  getInvalidScanResultMessage,
  getInvalidScanResultReason,
  getRootOnlyCollapseReasons,
  hardenCollapsedScanResult,
};
