import { isTopLevelOrphanRoot } from './mapDisplaySummary';
import { getNodeHttpErrorLabel, isRealHttpErrorNode, isVirtualMissingNode } from './scanStatus';
import { isRenderableTextUrl } from './url';

export const DEFAULT_NODE_BADGE_VISIBILITY = Object.freeze({
  missing: true,
  duplicates: true,
  subdomains: false,
  orphanPages: false,
  files: true,
  brokenLinks: true,
  inactivePages: true,
  authenticatedPages: true,
  errorPages: true,
});

const canShowBadge = (visibility, key) => visibility?.[key] !== false;

export const getFindingBadgesForNode = (
  node,
  nodeMeta = null,
  visibility = DEFAULT_NODE_BADGE_VISIBILITY
) => {
  const badges = [];
  if (!node) return badges;
  if (node.isEntitlementLocked || node.entitlementLocked) {
    return ['Upgrade'];
  }

  const orphanType = nodeMeta?.orphanType || node.orphanType;
  const isRenderableText = isRenderableTextUrl(node.url);
  const isSubdomainTree = node.subdomainRoot || nodeMeta?.isSubdomainTree || orphanType === 'subdomain';
  const isOrphanRoot = isTopLevelOrphanRoot(nodeMeta);
  const isRealError = isRealHttpErrorNode(node);

  if (node.isDuplicate && canShowBadge(visibility, 'duplicates')) badges.push('Duplicate');
  if (isVirtualMissingNode(node) && canShowBadge(visibility, 'missing')) badges.push('Missing');
  if (isSubdomainTree && canShowBadge(visibility, 'subdomains')) badges.push('Subdomain');
  if (orphanType === 'orphan' && canShowBadge(visibility, 'orphanPages')) badges.push('Orphan');
  if (!isRenderableText && orphanType === 'file' && canShowBadge(visibility, 'files')) badges.push('File');
  if (orphanType === 'broken' && !isOrphanRoot && canShowBadge(visibility, 'brokenLinks')) {
    badges.push('Broken Link');
  }
  if (!isRenderableText && node.isFile && canShowBadge(visibility, 'files') && !badges.includes('File')) {
    badges.push('File');
  }
  if (node.isBroken && !isOrphanRoot && canShowBadge(visibility, 'brokenLinks') && !badges.includes('Broken Link')) {
    badges.push('Broken Link');
  }
  if (node.authRequired && canShowBadge(visibility, 'authenticatedPages') && !badges.includes('Auth')) {
    badges.push('Auth');
  }
  if (isRealError && canShowBadge(visibility, 'errorPages')) {
    badges.push(getNodeHttpErrorLabel(node) || 'Error');
  }
  if (
    node.scanStatus !== 'scan_limited'
    && !isRealError
    && !node.authRequired
    && (node.isInactive || orphanType === 'inactive')
    && canShowBadge(visibility, 'inactivePages')
    && !badges.includes('Inactive')
  ) {
    badges.push('Inactive');
  }

  return badges;
};
