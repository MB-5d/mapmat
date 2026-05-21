import { getSeoValue } from './seoMetadata';
import { getDepthColor } from './constants';
import { isRenderableTextUrl } from './url';
import { getNodeHttpErrorLabel, getNodeStatusCode, isVirtualMissingNode } from './scanStatus';

export const getReportTypesForNode = (node, overrides = {}) => {
  const types = new Set();
  if (!node) return [];
  const orphanType = overrides.orphanType ?? node.orphanType;
  const isSubdomain = overrides.isSubdomain ?? node.subdomainRoot;
  const isRenderableText = isRenderableTextUrl(node.url);
  if (!isVirtualMissingNode(node)
    && !node.isDuplicate
    && !node.isBroken
    && !node.isInactive
    && !node.isError
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
  if (node.scanStatus !== 'scan_limited' && !node.isError && !node.authRequired && (node.isInactive || orphanType === 'inactive')) types.add('inactivePages');
  if (node.isError) types.add('errorPages');
  if (orphanType === 'orphan') types.add('orphanPages');
  if (isSubdomain) types.add('subdomains');
  if (!isRenderableText && (node.isFile || orphanType === 'file')) types.add('files');
  if (node.authRequired) types.add('authenticatedPages');
  return Array.from(types);
};

export const getReportPageType = (node, overrides = {}) => {
  if (!node) return 'Standard';
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
    entries.push({
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
