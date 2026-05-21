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
