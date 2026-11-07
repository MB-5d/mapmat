async function captureAuthenticatedScanResult({ result, origin, captureType, limit, capture, shouldStop }) {
  const nodes = [];
  const visit = (node) => {
    if (!node) return;
    if (node.url && !node.isVirtualMissing && !node.isStructural && !node.isFile) nodes.push(node);
    (node.children || []).forEach(visit);
  };
  visit(result.root);
  (result.orphans || []).forEach(visit);
  const summary = { captureType, captured: 0, failed: 0, skipped: 0, status: 'complete' };
  summary.failures = [];
  let attempted = 0;
  for (const node of nodes) {
    let sameOrigin = false;
    try { sameOrigin = new URL(node.url).origin === origin; } catch {}
    if (!sameOrigin || node.authRequired || node.isError || attempted >= limit || await shouldStop()) {
      node.authPreviewUnavailable = true;
      summary.skipped += 1;
      continue;
    }
    attempted += 1;
    try {
      const asset = await capture(node.url);
      node[captureType === 'full' ? 'fullScreenshotUrl' : 'thumbnailUrl'] = asset.url;
      node.privateCaptureExpiresAt = asset.expiresAt;
      // Display the saved image, but never refresh it through a logged-out job.
      node.authPreviewUnavailable = true;
      summary.captured += 1;
    } catch (error) {
      if (error.code === 'scan_auth_expired' || error.code === 'scan_auth_canceled') throw error;
      node.authPreviewUnavailable = true;
      summary.failed += 1;
      summary.failures.push({ nodeId: node.id, stage: error.captureStage || 'navigation', reason: error.captureReason || 'failed' });
    }
  }
  if (summary.failed || summary.skipped) summary.status = 'partial';
  result.authenticatedCaptureSummary = summary;
  return summary;
}

module.exports = { captureAuthenticatedScanResult };
