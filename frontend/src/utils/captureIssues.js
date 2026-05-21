import { isRenderableTextUrl } from './url';

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
  const isRenderableText = isRenderableTextUrl(node?.url);
  if (
    (!isRenderableText && (node?.isFile || orphanType === 'file' || pageType === 'file'))
    || text.includes('pdf')
    || text.includes('file')
  ) {
    return CAPTURE_ISSUE_TYPES.file;
  }
  if (status === 'blocked' || text.includes('requires login') || text.includes('requires authentication')) {
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
  if (
    statusCode === 0
    || text.includes('unreachable')
    || text.includes('unable to resolve')
    || text.includes('blocked host')
    || text.includes('invalid url')
    || text.includes('err_name_not_resolved')
    || text.includes('enotfound')
  ) {
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

export function shouldShowImageCaptureProgressToast(stats = {}) {
  const total = Math.max(0, Number(stats.total) || 0);
  if (!stats.mode || stats.stopped || total <= 0) return false;
  if (stats.finalizing) return true;
  const loaded = Math.max(0, Number(stats.loaded) || 0);
  const failed = Math.max(0, Number(stats.failed) || 0);
  const skipped = Math.max(0, Number(stats.skipped) || 0);
  return Math.min(total, loaded + failed + skipped) < total;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatImageCaptureCompletionToast({
  shown = 0,
  label = 'thumbnail',
  failed = 0,
  skipped = 0,
  issueCount = 0,
  issueLabels = [],
} = {}) {
  const safeShown = Math.max(0, Number(shown) || 0);
  const safeFailed = Math.max(0, Number(failed) || 0);
  const safeSkipped = Math.max(0, Number(skipped) || 0);
  const safeIssueCount = Math.max(safeFailed + safeSkipped, Number(issueCount) || 0);
  const itemLabel = label === 'full screenshot' ? 'full screenshot' : label;
  const capturedText = safeShown > 0
    ? `Captured ${pluralize(safeShown, itemLabel)}`
    : `No ${itemLabel}${itemLabel.endsWith('s') ? '' : 's'} captured`;

  if (safeIssueCount <= 0) {
    return { message: capturedText, type: 'success' };
  }

  const problemParts = [];
  if (safeFailed > 0) problemParts.push(`${pluralize(safeFailed, 'page')} failed`);
  if (safeSkipped > 0) problemParts.push(`${pluralize(safeSkipped, 'page')} skipped`);
  const knownProblemCount = safeFailed + safeSkipped;
  if (knownProblemCount === 0) {
    problemParts.push(`${pluralize(safeIssueCount, 'page')} ${safeIssueCount === 1 ? 'needs' : 'need'} review`);
  }
  const uniqueLabels = Array.from(new Set(
    (issueLabels || []).map((value) => String(value || '').trim()).filter(Boolean)
  ));
  const labelText = uniqueLabels.length > 0
    ? ` (${uniqueLabels.slice(0, 2).join(', ')}${uniqueLabels.length > 2 ? ', more' : ''})`
    : '';
  return {
    message: `${capturedText}. Needs review: ${problemParts.join('; ')}${labelText}. Open Capture issues for details.`,
    type: 'warning',
  };
}
