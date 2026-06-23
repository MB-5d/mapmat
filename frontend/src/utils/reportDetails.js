export const REPORT_DETAIL_OPTIONS = [
  { key: 'duplicateOf', label: 'Duplicate of', defaultVisible: true },
  { key: 'parentUrl', label: 'Parent', defaultVisible: true },
  { key: 'referrerUrl', label: 'Referrer', defaultVisible: false },
  { key: 'httpStatus', label: 'HTTP status', defaultVisible: true },
  { key: 'errorType', label: 'Error type', defaultVisible: true },
  { key: 'scanStatus', label: 'Scan status', defaultVisible: false },
  { key: 'reason', label: 'Reason', defaultVisible: true },
  { key: 'description', label: 'Description', defaultVisible: true },
  { key: 'metaKeywords', label: 'Meta keywords', defaultVisible: true },
  { key: 'canonical', label: 'Canonical', defaultVisible: true },
  { key: 'h1', label: 'H1', defaultVisible: true },
  { key: 'h2', label: 'H2', defaultVisible: true },
  { key: 'robots', label: 'Robots', defaultVisible: true },
  { key: 'language', label: 'Language', defaultVisible: true },
  { key: 'openGraphTitle', label: 'Open Graph title', defaultVisible: true },
  { key: 'openGraphDescription', label: 'Open Graph description', defaultVisible: true },
  { key: 'twitterCard', label: 'Twitter card', defaultVisible: true },
];

export const NON_FINDING_TYPES = new Set(['standard']);

export const createDefaultVisibleReportDetails = () => (
  REPORT_DETAIL_OPTIONS.reduce((next, option) => {
    next[option.key] = option.defaultVisible;
    return next;
  }, {})
);

export const getReportFindingTypes = (entry) => (
  (entry?.types || []).filter((type) => !NON_FINDING_TYPES.has(type))
);

const getVisibleDetails = (visibleDetails = null) => ({
  ...createDefaultVisibleReportDetails(),
  ...(visibleDetails || {}),
});

export const getReportDetailRows = (entry, visibleDetails = null) => {
  const resolvedVisibleDetails = getVisibleDetails(visibleDetails);
  const detailRows = [
    { key: 'duplicateOf', label: 'Duplicate of', value: entry?.duplicateOf, link: entry?.duplicateOf },
    { key: 'parentUrl', label: 'Parent', value: entry?.parentUrl, link: entry?.parentUrl },
    { key: 'referrerUrl', label: 'Referrer', value: entry?.referrerUrl, link: entry?.referrerUrl },
    { key: 'httpStatus', label: 'HTTP status', value: entry?.httpErrorLabel || (entry?.statusCode ? `HTTP ${entry.statusCode}` : '') },
    { key: 'errorType', label: 'Error type', value: entry?.isViewableError ? 'Viewable HTTP error' : entry?.httpErrorType },
    { key: 'scanStatus', label: 'Scan status', value: entry?.isVirtualMissing ? 'Missing virtual page' : entry?.scanStatus },
    { key: 'reason', label: 'Reason', value: entry?.blockedReason },
    { key: 'description', label: 'Description', value: entry?.description },
    { key: 'metaKeywords', label: 'Meta keywords', value: entry?.metaKeywords },
    { key: 'canonical', label: 'Canonical', value: entry?.canonicalUrl, link: entry?.canonicalUrl },
    { key: 'h1', label: 'H1', value: entry?.h1 },
    { key: 'h2', label: 'H2', value: entry?.h2 },
    { key: 'robots', label: 'Robots', value: entry?.robots },
    { key: 'language', label: 'Language', value: entry?.language },
    { key: 'openGraphTitle', label: 'Open Graph title', value: entry?.openGraph?.title },
    { key: 'openGraphDescription', label: 'Open Graph description', value: entry?.openGraph?.description },
    { key: 'twitterCard', label: 'Twitter card', value: entry?.twitter?.card },
  ];

  return detailRows.filter((row) => resolvedVisibleDetails[row.key] && row.value);
};
