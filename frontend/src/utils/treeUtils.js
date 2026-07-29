import { STACK_THRESHOLD, LAYOUT } from './constants';

const PAGE_NUMBER_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

export const buildExpandedStackMap = (rootNode, orphanNodes = []) => {
  const expanded = {};
  const walk = (node) => {
    if (!node) return;
    if (node.children?.length) {
      expanded[node.id] = true;
      node.children.forEach(walk);
    }
  };
  walk(rootNode);
  orphanNodes.forEach(walk);
  return expanded;
};

export const getMaxDepth = (node, depth = 0) => {
  if (!node) return 0;
  if (!node.children?.length) return depth;
  return Math.max(...node.children.map(c => getMaxDepth(c, depth + 1)));
};

export const countNodes = (node) => {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, c) => sum + countNodes(c), 0);
};

const NON_PAGE_NODE_KINDS = new Set([
  'import-container',
  'import-ghost',
  'source-group',
  'focus-ghost',
  'deferred-group',
]);

export const isPageNode = (node) => {
  if (!node || NON_PAGE_NODE_KINDS.has(node.nodeKind)) return false;
  try {
    const parsed = new URL(String(node.url || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const isCapturedPageNode = (node) => (
  isPageNode(node)
  && !node.isVirtualMissing
  && !node.isEntitlementLocked
  && !node.entitlementLocked
);

export const getImageCaptureIneligibilityReason = (node) => {
  const authoritativeCode = String(node?.captureReasonCode || '').trim();
  if (node?.captureEligible === false && authoritativeCode) return authoritativeCode;
  if (!isPageNode(node)) return 'structural';
  if (node.isVirtualMissing || node.isMissing) return 'structural';
  if (node.isEntitlementLocked || node.entitlementLocked) return 'entitlement_locked';
  if (node.authRequired) return 'authentication';
  if (
    node.isBlocked
    || node.isChallengePage
    || node.isBlockedBoundary
    || ['scan_limited', 'blocked', 'auth'].includes(String(node.scanStatus || '').toLowerCase())
  ) {
    return 'blocked';
  }
  const rawStatus = node.httpStatus ?? node.statusCode ?? node.errorStatus;
  const status = rawStatus === null || rawStatus === undefined || rawStatus === ''
    ? null
    : Number(rawStatus);
  if (Number.isFinite(status) && status >= 400) return 'http_error';
  if (node.isError || node.isBroken || node.isViewableError) return 'http_error';
  if (
    node.isInactive
    || ['inactive', 'unreachable', 'failed'].includes(String(node.scanStatus || '').toLowerCase())
    || (Number.isFinite(status) && status === 0)
  ) return 'unreachable';
  return '';
};

export const isImageCaptureEligibleNode = (node) => (
  getImageCaptureIneligibilityReason(node) === ''
);

export const compareScanNumberStrings = (leftValue, rightValue) => {
  const parse = (value) => String(value || '').trim().split('.').filter(Boolean).map((part) => {
    if (/^\d+$/.test(part)) return { type: 'number', value: Number(part) };
    if (/^X+$/i.test(part)) return { type: 'unknown', value: 0 };
    return { type: 'text', value: part };
  });
  const left = parse(leftValue);
  const right = parse(rightValue);
  if (left.length === 0 || right.length === 0) return 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (!leftPart || !rightPart) return left.length - right.length;
    if (leftPart.type === 'unknown' && rightPart.type === 'unknown') continue;
    if (leftPart.type === 'number' && rightPart.type === 'number') {
      if (leftPart.value !== rightPart.value) return leftPart.value - rightPart.value;
      continue;
    }
    if (leftPart.type !== rightPart.type) {
      if (leftPart.type === 'number') return -1;
      if (rightPart.type === 'number') return 1;
      if (leftPart.type === 'unknown') return -1;
      if (rightPart.type === 'unknown') return 1;
    }
    const difference = PAGE_NUMBER_COLLATOR.compare(
      String(leftPart.value),
      String(rightPart.value)
    );
    if (difference !== 0) return difference;
  }
  return 0;
};

export const getOrderedChildren = (node) => (
  [...(node?.children || [])].sort((left, right) => {
    if (left?.nodeKind === 'deferred-group' && right?.nodeKind !== 'deferred-group') return 1;
    if (left?.nodeKind !== 'deferred-group' && right?.nodeKind === 'deferred-group') return -1;
    return compareScanNumberStrings(left?.scanNumber, right?.scanNumber);
  })
);

export const countPageNodes = (node) => {
  if (!node) return 0;
  return (isCapturedPageNode(node) ? 1 : 0)
    + (node.children || []).reduce((sum, child) => sum + countPageNodes(child), 0);
};

export const findNodeById = (node, id) => {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const f = findNodeById(c, id);
    if (f) return f;
  }
  return null;
};

export const findParent = (tree, nodeId, parent = null) => {
  if (!tree) return null;
  if (tree.id === nodeId) return parent;
  for (const child of tree.children || []) {
    const found = findParent(child, nodeId, tree);
    if (found) return found;
  }
  return null;
};

export const isDescendantOf = (tree, nodeId, ancestorId) => {
  const ancestor = findNodeById(tree, ancestorId);
  if (!ancestor) return false;
  return !!findNodeById(ancestor, nodeId);
};

// Stack crowded sibling groups below the root row.
export const shouldStackChildren = (children, depth) => {
  if (!children || children.length < STACK_THRESHOLD) return false;
  // Don't stack root level children (main nav items)
  if (depth < 1) return false;
  return true;
};

// Runtime invariant checks (Development Only)
export const checkLayoutInvariants = (nodes, orphans, connectors) => {
  if (process.env.NODE_ENV !== 'development') return;

  const { NODE_W, GAP_L1_X } = LAYOUT;
  const orphanNodes = Array.from(nodes.values())
    .filter(n => n.isOrphan && n.orphanStyle !== 'subdomain')
    .sort((a, b) => a.x - b.x);
  const subdomainNodes = Array.from(nodes.values())
    .filter(n => n.isOrphan && n.orphanStyle === 'subdomain')
    .sort((a, b) => a.x - b.x);
  const level1Nodes = Array.from(nodes.values()).filter(n => n.depth === 1);

  // A) Orphan spacing invariant
  for (let j = 1; j < orphanNodes.length; j++) {
    const gap = orphanNodes[j].x - orphanNodes[j - 1].x;
    const expected = NODE_W + GAP_L1_X;
    if (Math.abs(gap - expected) > 1) {
      console.warn(`Invariant A violated: orphan spacing. Got ${gap}, expected ${expected}`);
    }
  }

  // A2) Subdomain spacing invariant
  for (let j = 1; j < subdomainNodes.length; j++) {
    const gap = subdomainNodes[j].x - subdomainNodes[j - 1].x;
    const expected = NODE_W + GAP_L1_X;
    if (Math.abs(gap - expected) > 1) {
      console.warn(`Invariant A2 violated: subdomain spacing. Got ${gap}, expected ${expected}`);
    }
  }

  // B) Level 1 row Y invariant
  if (level1Nodes.length > 0) {
    const baseY = level1Nodes[0].y;
    level1Nodes.forEach((n, i) => {
      if (Math.abs(n.y - baseY) > 1) {
        console.warn(`Invariant C violated: Level 1 node ${i} Y mismatch`);
      }
    });
    // NOTE: Orphans may be on root row (after-root mode) or on level1 row (after-tree mode).
    // So we do NOT enforce orphan Y == level1 Y.

  }

  // D) Depth indentation invariant (spot check)
  nodes.forEach((node, id) => {
    if (node.depth >= 2) {
      // Find parent - this would need parent tracking for full check
      // For now just verify x increases with depth
    }
  });
};
