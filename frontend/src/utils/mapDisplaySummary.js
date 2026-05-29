import { isRenderableTextUrl } from './url';
import { isVirtualMissingNode } from './scanStatus';

export const DEFAULT_SCAN_LAYER_AVAILABILITY = Object.freeze({
  placementPrimary: false,
  placementSubdomain: false,
  placementOrphan: false,
  typePages: false,
  typeFiles: false,
  statusMissing: false,
  statusBroken: false,
  statusError: false,
  statusInactive: false,
  statusAuth: false,
  statusDuplicate: false,
});

export const DEFAULT_SCAN_LAYER_VISIBILITY = Object.freeze({
  placementPrimary: true,
  placementSubdomain: true,
  placementOrphan: true,
  typePages: true,
  typeFiles: true,
  statusMissing: true,
  statusBroken: true,
  statusError: true,
  statusInactive: true,
  statusAuth: true,
  statusDuplicate: true,
});

const toBooleanAvailability = (value = {}) => (
  Object.keys(DEFAULT_SCAN_LAYER_AVAILABILITY).reduce((next, key) => {
    next[key] = Boolean(value?.[key]);
    return next;
  }, {})
);

export const normalizeMapDisplaySummary = (summary = {}) => ({
  maxDepth: Math.max(0, Number(summary?.maxDepth || 0)),
  scanLayerAvailability: toBooleanAvailability(summary?.scanLayerAvailability),
  markerStatusValues: Array.from(new Set(
    (Array.isArray(summary?.markerStatusValues) ? summary.markerStatusValues : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value && value !== 'none')
  )),
});

export const isTopLevelOrphanRoot = (nodeMeta) => {
  if (!nodeMeta) return false;
  if (nodeMeta.depth !== 0) return false;
  if (nodeMeta.treeType === 'orphan' && nodeMeta.parentId === null) return true;
  return Boolean(nodeMeta.orphanType && nodeMeta.orphanType !== 'subdomain');
};

export const getNodePlacement = (nodeMeta) => {
  if (!nodeMeta) return 'primary';
  if (nodeMeta.isSubdomainTree || nodeMeta.orphanType === 'subdomain' || nodeMeta.orphanStyle === 'subdomain') {
    return 'subdomain';
  }
  if (nodeMeta.treeType === 'subdomain') return 'subdomain';
  if (nodeMeta.isOrphan || nodeMeta.treeType === 'orphan' || (nodeMeta.orphanType && nodeMeta.orphanType !== 'subdomain')) {
    return 'orphan';
  }
  return 'primary';
};

export const getNodeType = (node, nodeMeta) => {
  if (!isRenderableTextUrl(node?.url) && (node?.isFile || nodeMeta?.orphanType === 'file')) return 'file';
  return 'page';
};

export const getNodeStatusFlags = (node, nodeMeta) => {
  const isOrphanRoot = isTopLevelOrphanRoot(nodeMeta);
  return {
    missing: isVirtualMissingNode(node),
    broken: !isOrphanRoot && (node?.isBroken || nodeMeta?.orphanType === 'broken'),
    error: Boolean(node?.isError),
    inactive: Boolean(
      node?.scanStatus !== 'scan_limited'
      && !node?.isError
      && !node?.authRequired
      && (node?.isInactive || nodeMeta?.orphanType === 'inactive')
    ),
    auth: Boolean(node?.authRequired),
    duplicate: Boolean(node?.isDuplicate),
  };
};

export const isNodeGhostedByLayers = (node, nodeMeta, visibility) => {
  if (!visibility) return false;
  const placement = getNodePlacement(nodeMeta);
  const type = getNodeType(node, nodeMeta);
  const status = getNodeStatusFlags(node, nodeMeta);

  if (placement === 'primary' && !visibility.placementPrimary) return true;
  if (placement === 'subdomain' && !visibility.placementSubdomain) return true;
  if (placement === 'orphan' && !visibility.placementOrphan) return true;
  if (type === 'page' && !visibility.typePages) return true;
  if (type === 'file' && !visibility.typeFiles) return true;
  if (status.missing && !visibility.statusMissing) return true;
  if (status.broken && !visibility.statusBroken) return true;
  if (status.error && !visibility.statusError) return true;
  if (status.inactive && !visibility.statusInactive) return true;
  if (status.auth && !visibility.statusAuth) return true;
  if (status.duplicate && !visibility.statusDuplicate) return true;
  return false;
};

const collectMapRecords = (rootNode, orphanNodes = []) => {
  const records = [];
  const visit = (node, meta) => {
    if (!node || typeof node !== 'object') return;
    records.push({ node, meta });
    (Array.isArray(node.children) ? node.children : []).forEach((child) => {
      visit(child, {
        ...meta,
        parentId: node.id || null,
        depth: meta.depth + 1,
      });
    });
  };

  if (rootNode) {
    visit(rootNode, {
      treeType: 'root',
      parentId: null,
      depth: 0,
      isOrphan: false,
      orphanType: null,
      isSubdomainTree: false,
    });
  }

  (Array.isArray(orphanNodes) ? orphanNodes : []).filter(Boolean).forEach((orphan) => {
    const isSubdomainTree = Boolean(orphan.subdomainRoot || orphan.orphanType === 'subdomain');
    visit(orphan, {
      treeType: isSubdomainTree ? 'subdomain' : 'orphan',
      parentId: null,
      depth: 0,
      isOrphan: true,
      orphanType: orphan.orphanType || (isSubdomainTree ? 'subdomain' : 'orphan'),
      orphanStyle: isSubdomainTree ? 'subdomain' : 'root',
      isSubdomainTree,
    });
  });

  return records;
};

export const buildMapDisplaySummary = (rootNode, orphanNodes = []) => {
  const records = collectMapRecords(rootNode, orphanNodes);
  let maxDepth = 0;
  const markerStatusValues = new Set();
  const scanLayerAvailability = { ...DEFAULT_SCAN_LAYER_AVAILABILITY };

  records.forEach(({ node, meta }) => {
    maxDepth = Math.max(maxDepth, Number(meta.depth || 0));
    const placement = getNodePlacement(meta);
    const status = getNodeStatusFlags(node, meta);
    const annotationStatus = String(node?.annotations?.status || 'none').trim();

    if (placement === 'primary') scanLayerAvailability.placementPrimary = true;
    if (placement === 'subdomain') scanLayerAvailability.placementSubdomain = true;
    if (placement === 'orphan') scanLayerAvailability.placementOrphan = true;
    if (status.missing) scanLayerAvailability.statusMissing = true;
    if (status.broken) scanLayerAvailability.statusBroken = true;
    if (status.error) scanLayerAvailability.statusError = true;
    if (status.inactive) scanLayerAvailability.statusInactive = true;
    if (status.auth) scanLayerAvailability.statusAuth = true;
    if (status.duplicate) scanLayerAvailability.statusDuplicate = true;
    if (annotationStatus && annotationStatus !== 'none') markerStatusValues.add(annotationStatus);
  });

  return normalizeMapDisplaySummary({
    maxDepth,
    scanLayerAvailability,
    markerStatusValues: Array.from(markerStatusValues),
  });
};
