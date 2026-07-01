import { STACK_THRESHOLD, LAYOUT } from './constants';

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
