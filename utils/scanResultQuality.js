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

function getRootOnlyCollapseReasons(result, context = {}) {
  if (!result?.root || result.partialReason) return [];
  const rootTreeNodeCount = countScanTreeNodes(result.root);
  if (rootTreeNodeCount > 1) return [];

  const diagnostics = result.scanDiagnostics || {};
  const progress = normalizeProgress(context.progress);
  const reasons = [];

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

function hardenCollapsedScanResult(result, context = {}) {
  const reasons = getRootOnlyCollapseReasons(result, context);
  if (reasons.length === 0) return result;

  const progress = normalizeProgress(context.progress);
  const rootTreeNodeCount = countScanTreeNodes(result.root);
  const rootChildCount = Array.isArray(result.root?.children) ? result.root.children.length : 0;
  const existingDiagnostics = result.scanDiagnostics && typeof result.scanDiagnostics === 'object'
    ? result.scanDiagnostics
    : {};
  const nextDiagnostics = {
    ...existingDiagnostics,
    treeNodeCount: toNonNegativeInteger(existingDiagnostics.treeNodeCount) || rootTreeNodeCount,
    rootChildCount: toNonNegativeInteger(existingDiagnostics.rootChildCount) || rootChildCount,
    collapseReason: reasons.join(','),
  };

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
  result.partialReason = context.entitlementCapped ? 'entitlement_cap' : 'scan_collapsed';
  result.scanDiagnostics = nextDiagnostics;
  return result;
}

module.exports = {
  countScanTreeNodes,
  getRootOnlyCollapseReasons,
  hardenCollapsedScanResult,
};
