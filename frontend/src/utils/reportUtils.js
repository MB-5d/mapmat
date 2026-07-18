import { getSeoMetadata, getSeoValue } from './seoMetadata';
import { getDepthColor } from './constants';
import { isRenderableTextUrl } from './url';
import { isPageNode } from './treeUtils';
import {
  getNodeHttpErrorLabel,
  getNodeStatusCode,
  isRealHttpErrorNode,
  isVirtualMissingNode,
} from './scanStatus';

const TITLE_MIN_LENGTH = 10;
const TITLE_MAX_LENGTH = 70;
const DESCRIPTION_MIN_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 170;

const normalizeReportText = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
};

const hasOwnMetadataField = (node, field) => (
  Object.prototype.hasOwnProperty.call(node || {}, field)
);

const hasMetadataEvidence = (node) => {
  if (!node) return false;
  if (node.metadataAvailable === true) return true;
  if (Object.keys(getSeoMetadata(node)).length > 0) return true;
  return [
    'description',
    'canonicalUrl',
    'metaTags',
    'h1',
    'h2',
    'h1s',
    'h2s',
  ].some((field) => hasOwnMetadataField(node, field));
};

const shouldCheckMetadataIssues = (node, { orphanType, isRenderableText, isRealError }) => (
  node
  && !node.isEntitlementLocked
  && !node.entitlementLocked
  && !node.authRequired
  && !isRealError
  && !isVirtualMissingNode(node)
  && node.scanStatus !== 'scan_limited'
  && node.metadataAvailable !== false
  && !node.isChallengePage
  && hasMetadataEvidence(node)
  && (isRenderableText || (orphanType !== 'file' && !node.isFile))
);

const addLengthIssue = (types, missingKey, shortKey, longKey, value, min, max) => {
  if (!value) {
    types.add(missingKey);
    return;
  }
  if (value.length < min) types.add(shortKey);
  if (value.length > max) types.add(longKey);
};

const addMetadataIssueTypes = (types, node, context) => {
  if (!shouldCheckMetadataIssues(node, context)) return;

  const title = normalizeReportText(node.title);
  const description = getSeoValue(node, 'description');
  const h1 = getSeoValue(node, 'h1');

  addLengthIssue(types, 'missingTitle', 'shortTitle', 'longTitle', title, TITLE_MIN_LENGTH, TITLE_MAX_LENGTH);
  addLengthIssue(
    types,
    'missingDescription',
    'shortDescription',
    'longDescription',
    description,
    DESCRIPTION_MIN_LENGTH,
    DESCRIPTION_MAX_LENGTH
  );
  if (!h1) types.add('missingH1');
};

export const getReportTypesForNode = (node, overrides = {}) => {
  const types = new Set();
  if (!node) return [];
  if (node.isEntitlementLocked || node.entitlementLocked) return ['standard'];
  const orphanType = overrides.orphanType ?? node.orphanType;
  const isSubdomain = overrides.isSubdomain ?? node.subdomainRoot;
  const isRenderableText = isRenderableTextUrl(node.url);
  const isRealError = isRealHttpErrorNode(node);
  if (!isVirtualMissingNode(node)
    && !node.isDuplicate
    && !node.isBroken
    && !node.isInactive
    && !isRealError
    && (!node.isFile || isRenderableText)
    && !node.authRequired
    && orphanType !== 'broken'
    && orphanType !== 'inactive'
    && (orphanType !== 'file' || isRenderableText)
    && orphanType !== 'orphan'
    && !isSubdomain) {
    types.add('standard');
  }
  if (isVirtualMissingNode(node)) types.add('missing');
  if (node.isDuplicate) types.add('duplicates');
  if (node.isBroken || orphanType === 'broken') types.add('brokenLinks');
  if (node.scanStatus !== 'scan_limited' && !isRealError && !node.authRequired && (node.isInactive || orphanType === 'inactive')) types.add('inactivePages');
  if (isRealError) types.add('errorPages');
  if (orphanType === 'orphan') types.add('orphanPages');
  if (isSubdomain) types.add('subdomains');
  if (!isRenderableText && (node.isFile || orphanType === 'file')) types.add('files');
  if (node.authRequired) types.add('authenticatedPages');
  addMetadataIssueTypes(types, node, { orphanType, isRenderableText, isRealError });
  return Array.from(types);
};

export const getReportPageType = (node, overrides = {}) => {
  if (!node) return 'Standard';
  if (node.isEntitlementLocked || node.entitlementLocked) return 'Locked';
  const orphanType = overrides.orphanType ?? node.orphanType;
  const isSubdomain = overrides.isSubdomain ?? node.subdomainRoot;
  const isRenderableText = isRenderableTextUrl(node.url);
  if (node.pageType === 'Home') return 'Home';
  if (isSubdomain) return 'Subdomain';
  if (!isRenderableText && (orphanType === 'file' || node.isFile)) return 'File';
  if (orphanType === 'orphan') return 'Orphan';
  if (isVirtualMissingNode(node)) return 'Missing';
  if (node.isDuplicate) return 'Duplicate';
  return 'Standard';
};

export const buildReportEntries = (rootNode, orphanNodes, reportNumberMap, reportLayout, colors) => {
  const entries = [];
  const visit = (node, context) => {
    if (!node) return;
    const isSubdomain = context.isSubdomain || node.subdomainRoot;
    const orphanType = context.orphanType || node.orphanType || null;
    const number = reportNumberMap.get(node.id) || '';
    const depth = reportLayout?.nodes.get(node.id)?.depth ?? 0;
    const levelColor = getDepthColor(colors, depth);
    const titleValue = node.title || node.url || '';
    const showFullTitle = titleValue.length > 24;
    if (isPageNode(node)) entries.push({
      id: node.id,
      title: titleValue,
      url: node.url || '',
      number,
      types: getReportTypesForNode(node, { isSubdomain, orphanType }),
      duplicateOf: node.duplicateOf || '',
      parentUrl: node.parentUrl || '',
      referrerUrl: node.referrerUrl || '',
      description: getSeoValue(node, 'description'),
      metaKeywords: getSeoValue(node, 'keywords'),
      canonicalUrl: getSeoValue(node, 'canonicalUrl'),
      h1: getSeoValue(node, 'h1'),
      h2: getSeoValue(node, 'h2'),
      robots: getSeoValue(node, 'robots'),
      language: getSeoValue(node, 'language'),
      openGraph: node.seoMetadata?.openGraph || {},
      twitter: node.seoMetadata?.twitter || {},
      pageType: getReportPageType(node, { isSubdomain, orphanType }),
      levelColor,
      thumbnailUrl: node.thumbnailUrl || '',
      statusCode: getNodeStatusCode(node),
      httpErrorType: node.httpErrorType || '',
      httpErrorLabel: getNodeHttpErrorLabel(node),
      isViewableError: Boolean(node.isViewableError),
      isVirtualMissing: isVirtualMissingNode(node),
      blockedReason: node.blockedReason || '',
      scanStatus: node.scanStatus || '',
      showFullTitle,
      isEntitlementLocked: Boolean(node.isEntitlementLocked || node.entitlementLocked),
      entitlementLocked: Boolean(node.isEntitlementLocked || node.entitlementLocked),
    });
    node.children?.forEach((child) => visit(child, { isSubdomain, orphanType }));
  };

  visit(rootNode, { isSubdomain: false, orphanType: null });
  (orphanNodes || []).forEach((orphan) => {
    visit(orphan, {
      isSubdomain: !!orphan?.subdomainRoot,
      orphanType: orphan?.orphanType || null,
    });
  });

  return entries;
};

export const getReportEntitlementVisibleLimit = (scanMeta = null) => {
  const entitlement = scanMeta?.entitlement || null;
  if (!entitlement?.capped || entitlement.limitReached === false) return null;
  const rawLimit = entitlement.visiblePageLimit || entitlement.allowedPages || entitlement.visiblePageCount || 0;
  const limit = Math.floor(Number(rawLimit || 0));
  return Number.isFinite(limit) && limit > 0 ? limit : null;
};

export const buildReportStats = (entries = [], typeOptions = [], scanMeta = null) => {
  const realEntries = entries.filter((entry) => !entry.isEntitlementLocked);
  const visibleLimit = getReportEntitlementVisibleLimit(scanMeta);
  const stats = {
    total: visibleLimit ? Math.min(realEntries.length, visibleLimit) : realEntries.length,
  };
  typeOptions.forEach((option) => {
    stats[option.key] = 0;
  });
  realEntries.forEach((entry) => {
    entry.types.forEach((type) => {
      stats[type] = (stats[type] || 0) + 1;
    });
  });
  return stats;
};

export const parsePageNumber = (raw) => {
  if (!raw) return [];
  const value = String(raw);
  if (value.startsWith('s')) {
    return value
      .slice(1)
      .split('.')
      .map((part) => Number.parseInt(part, 10));
  }
  return value.split('.').map((part) => Number.parseInt(part, 10));
};

export const comparePageNumbers = (a, b) => {
  const aParts = parsePageNumber(a);
  const bParts = parsePageNumber(b);
  const max = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < max; i += 1) {
    const av = aParts[i] ?? -1;
    const bv = bParts[i] ?? -1;
    if (av === bv) continue;
    return av - bv;
  }
  return 0;
};
