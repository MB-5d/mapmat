export const getHttpErrorType = (statusCode) => {
  const status = Number(statusCode);
  if (!Number.isFinite(status) || status < 400) return '';
  return status >= 500 ? '5xx' : '4xx';
};

export const getHttpErrorLabel = (statusCode) => {
  const status = Number(statusCode);
  if (!Number.isFinite(status) || status < 400) return '';
  if (status === 404) return 'HTTP 404 / Not Found';
  return `HTTP ${status}`;
};

export const getNodeStatusCode = (node) => {
  const status = Number(node?.httpStatus ?? node?.statusCode ?? node?.errorStatus);
  return Number.isFinite(status) ? status : null;
};

const SCAN_LIMITED_REASONS = new Set([
  'challenge_page',
  'crawler_limited',
  'scan_limited',
]);

export const isScanLimitedNode = (node) => {
  const blockedReason = String(node?.blockedReason || '').trim().toLowerCase();
  return Boolean(
    node?.scanStatus === 'scan_limited'
    || node?.isBlocked
    || node?.isChallengePage
    || SCAN_LIMITED_REASONS.has(blockedReason)
  );
};

export const isRealHttpErrorNode = (node) => {
  const status = getNodeStatusCode(node);
  if (status === null || status < 400) return false;
  if (node?.authRequired || isScanLimitedNode(node)) return false;
  return true;
};

export const getNodeHttpErrorLabel = (node) => {
  const explicit = String(node?.httpErrorLabel || '').trim();
  if (explicit) return explicit;
  return getHttpErrorLabel(getNodeStatusCode(node));
};

export const isVirtualMissingNode = (node) => Boolean(node?.isVirtualMissing || (
  node?.isMissing
  && !node?.httpStatus
  && !node?.statusCode
  && !node?.errorStatus
));
