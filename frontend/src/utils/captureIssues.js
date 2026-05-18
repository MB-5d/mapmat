export const CAPTURE_ISSUE_TYPES = Object.freeze({
  file: 'file',
  inactive: 'inactive',
  unreachable: 'unreachable',
  auth: 'auth',
  error: 'error',
  missingAsset: 'missing_asset',
  imageLoad: 'image_load',
  lowResolution: 'low_resolution',
});

export const CAPTURE_ISSUE_LABELS = Object.freeze({
  [CAPTURE_ISSUE_TYPES.file]: 'PDF/file',
  [CAPTURE_ISSUE_TYPES.inactive]: 'Inactive page',
  [CAPTURE_ISSUE_TYPES.unreachable]: 'Unreachable',
  [CAPTURE_ISSUE_TYPES.auth]: 'Requires login',
  [CAPTURE_ISSUE_TYPES.error]: 'Error page',
  [CAPTURE_ISSUE_TYPES.missingAsset]: 'Missing saved asset',
  [CAPTURE_ISSUE_TYPES.imageLoad]: 'Image failed to load',
  [CAPTURE_ISSUE_TYPES.lowResolution]: 'Low-resolution full screenshot',
});

export function classifyCaptureIssue({ status, error, node } = {}) {
  const text = `${status || ''} ${error || ''}`.toLowerCase();
  const orphanType = String(node?.orphanType || '').toLowerCase();
  const pageType = String(node?.pageType || node?.type || '').toLowerCase();
  if (node?.isFile || orphanType === 'file' || pageType === 'file' || text.includes('pdf') || text.includes('file')) {
    return CAPTURE_ISSUE_TYPES.file;
  }
  if (node?.authRequired || status === 'blocked' || text.includes('login') || text.includes('authentication')) {
    return CAPTURE_ISSUE_TYPES.auth;
  }
  if (status === 'missing_asset' || text.includes('missing asset') || text.includes('not found on the map')) {
    return CAPTURE_ISSUE_TYPES.missingAsset;
  }
  if (status === 'low_resolution' || text.includes('resolution')) {
    return CAPTURE_ISSUE_TYPES.lowResolution;
  }
  if (status === 'image_load' || text.includes('failed to load')) {
    return CAPTURE_ISSUE_TYPES.imageLoad;
  }
  const statusCode = Number(node?.httpStatus ?? node?.statusCode);
  if (node?.isInactive || orphanType === 'inactive' || text.includes('inactive')) {
    return CAPTURE_ISSUE_TYPES.inactive;
  }
  if (statusCode === 0 || text.includes('unreachable')) {
    return CAPTURE_ISSUE_TYPES.unreachable;
  }
  return CAPTURE_ISSUE_TYPES.error;
}

export function normalizeCaptureIssue(issue = {}) {
  const type = issue.type || classifyCaptureIssue(issue);
  const nodeId = String(issue.nodeId || '').trim();
  return {
    id: issue.id || `${nodeId || 'unknown'}:${type}`,
    nodeId,
    pageNumber: issue.pageNumber || '',
    title: issue.title || 'Untitled page',
    url: issue.url || '',
    type,
    label: issue.label || CAPTURE_ISSUE_LABELS[type] || 'Capture issue',
    detail: issue.detail || issue.error || '',
    status: issue.status || '',
  };
}

export function buildCaptureIssueFromResult(result = {}, node = {}, pageNumber = '') {
  return normalizeCaptureIssue({
    nodeId: result.nodeId || node?.id,
    pageNumber,
    title: node?.title,
    url: node?.url,
    status: result.status,
    error: result.error,
    detail: result.error,
    node,
  });
}

export function getReconciledCaptureProgress({ total = 0, loadedIds, issueCount = 0 } = {}) {
  const loaded = loadedIds?.size || 0;
  return {
    total,
    loaded,
    completed: Math.min(total, loaded + issueCount),
  };
}
