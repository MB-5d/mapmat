const DEFAULT_ORPHAN_CONTAINER_ID = '__orphans__';
const DEFAULT_SUBDOMAIN_CONTAINER_ID = '__subdomains__';

const cloneValue = (value) => (
  value === undefined
    ? undefined
    : typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const normalizeIndex = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const hasAssignedUrl = (node) => typeof node?.url === 'string' && node.url.trim() !== '';

const collectNodeIds = (node, out = new Set()) => {
  if (!node?.id) return out;
  out.add(node.id);
  (node.children || []).forEach((child) => collectNodeIds(child, out));
  return out;
};

const branchHasAssignedUrl = (node) => {
  if (!node) return false;
  if (hasAssignedUrl(node)) return true;
  return (node.children || []).some(branchHasAssignedUrl);
};

const findNodeById = (node, id) => {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
};

const findParent = (tree, nodeId, parent = null) => {
  if (!tree) return null;
  if (tree.id === nodeId) return parent;
  for (const child of tree.children || []) {
    const found = findParent(child, nodeId, tree);
    if (found) return found;
  }
  return null;
};

const isDescendantOf = (tree, nodeId, ancestorId) => {
  const ancestor = findNodeById(tree, ancestorId);
  if (!ancestor) return false;
  return !!findNodeById(ancestor, nodeId);
};

const buildMoveForestIndex = (rootNode, orphanNodes = []) => {
  const index = {
    nodes: new Map(),
    trees: new Map(),
  };

  const registerTree = (treeRoot, treeType, treeIndex = 0) => {
    if (!treeRoot?.id) return;
    const treeRootId = treeRoot.id;
    const nodeIds = new Set();
    const stack = [{ node: treeRoot, parentId: null, depth: 0 }];

    while (stack.length > 0) {
      const { node, parentId, depth } = stack.pop();
      if (!node?.id) continue;
      nodeIds.add(node.id);
      index.nodes.set(node.id, {
        treeRootId,
        treeType,
        treeIndex,
        parentId,
        depth,
        hasUrl: hasAssignedUrl(node),
      });

      const children = node.children || [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push({ node: children[i], parentId: node.id, depth: depth + 1 });
      }
    }

    index.trees.set(treeRootId, {
      type: treeType,
      treeIndex,
      nodeIds,
    });
  };

  if (rootNode) registerTree(rootNode, 'root', 0);
  (Array.isArray(orphanNodes) ? orphanNodes : []).forEach((orphan, index) => {
    registerTree(orphan, orphan?.subdomainRoot ? 'subdomain' : 'orphan', index + 1);
  });

  return index;
};

const getTreeRootById = (treeRootId, rootNode, orphanNodes = []) => {
  if (!treeRootId) return null;
  if (rootNode?.id === treeRootId) return rootNode;
  return (Array.isArray(orphanNodes) ? orphanNodes : []).find((orphan) => orphan?.id === treeRootId) || null;
};

const getBranchMoveBlockReason = ({
  root,
  orphans = [],
  nodeId,
  targetParentId,
  orphanContainerId = DEFAULT_ORPHAN_CONTAINER_ID,
  subdomainContainerId = DEFAULT_SUBDOMAIN_CONTAINER_ID,
}) => {
  if (!nodeId || !targetParentId) return 'Select a valid drop target.';
  if (!root) return 'No map is available.';
  if (nodeId === root.id) return 'Home cannot be moved.';
  if (nodeId === targetParentId) return 'Cannot drop a branch into itself.';

  const forestIndex = buildMoveForestIndex(root, orphans);
  const sourceMeta = forestIndex.nodes.get(nodeId);
  if (!sourceMeta) return 'Node was not found.';

  const sourceTreeRoot = getTreeRootById(sourceMeta.treeRootId, root, orphans);
  const sourceNode = sourceTreeRoot ? findNodeById(sourceTreeRoot, nodeId) : null;
  if (!sourceNode) return 'Node was not found.';

  const movingToOrphanRoot = targetParentId === orphanContainerId;
  const movingToSubdomainRoot = targetParentId === subdomainContainerId;
  const targetMeta = movingToOrphanRoot || movingToSubdomainRoot
    ? null
    : forestIndex.nodes.get(targetParentId);

  if (!movingToOrphanRoot && !movingToSubdomainRoot && !targetMeta) {
    return 'Drop target was not found.';
  }

  if (targetMeta && sourceMeta.treeRootId === targetMeta.treeRootId) {
    if (isDescendantOf(sourceTreeRoot, targetParentId, nodeId)) {
      return 'Cannot drop a branch into itself.';
    }
  }

  const sourceBranchHasUrl = branchHasAssignedUrl(sourceNode);

  if (movingToSubdomainRoot && sourceBranchHasUrl) {
    return 'Subdomain root requires a branch with blank URLs.';
  }

  if (sourceMeta.treeType === 'subdomain' && sourceBranchHasUrl) {
    if (!targetMeta || sourceMeta.treeRootId !== targetMeta.treeRootId) {
      return 'Subdomain branch with URLs can only move within its own subdomain.';
    }
  }

  if (targetMeta) {
    const targetTree = forestIndex.trees.get(targetMeta.treeRootId);
    if (targetTree?.type === 'subdomain' && sourceBranchHasUrl && sourceMeta.treeType !== 'subdomain') {
      return 'Branches with URLs cannot be moved under a subdomain. Clear the URLs first.';
    }
  }

  return null;
};

const removeFromTree = (tree, targetId) => {
  if (!tree?.children?.length) return null;
  const index = tree.children.findIndex((child) => child?.id === targetId);
  if (index !== -1) {
    return tree.children.splice(index, 1)[0] || null;
  }
  for (const child of tree.children) {
    const removed = removeFromTree(child, targetId);
    if (removed) return removed;
  }
  return null;
};

const purgeNodeFromTree = (tree, targetId) => {
  if (!tree?.children?.length) return;
  tree.children = tree.children.filter((child) => child?.id !== targetId);
  tree.children.forEach((child) => purgeNodeFromTree(child, targetId));
};

const clearTreeFlags = (node) => {
  if (!node) return;
  if (node.subdomainRoot) node.subdomainRoot = false;
  if (node.orphanType === 'orphan' || node.orphanType === 'subdomain') {
    delete node.orphanType;
  }
  (node.children || []).forEach(clearTreeFlags);
};

const applyTreeTypeFlags = (node, treeType) => {
  if (!node) return;
  if (treeType === 'subdomain') {
    node.orphanType = 'subdomain';
    node.subdomainRoot = false;
  } else if (treeType === 'orphan') {
    node.orphanType = 'orphan';
    node.subdomainRoot = false;
  }
  (node.children || []).forEach((child) => applyTreeTypeFlags(child, treeType));
};

const applyRootFlags = (node, treeType) => {
  if (!node) return;
  if (treeType === 'subdomain') {
    node.subdomainRoot = true;
    if (!node.orphanType || node.orphanType === 'orphan') node.orphanType = 'subdomain';
  } else {
    node.subdomainRoot = false;
    if (!node.orphanType || node.orphanType === 'subdomain') node.orphanType = 'orphan';
  }
};

const applyRootChanges = (node, changes) => {
  if (!node || !changes || typeof changes !== 'object' || Array.isArray(changes)) return;
  Object.keys(changes).forEach((key) => {
    if (key === 'id' || key === 'children') return;
    node[key] = cloneValue(changes[key]);
  });
};

const applyBranchMoveToMap = ({
  root,
  orphans = [],
  nodeId,
  targetParentId,
  insertIndex = 0,
  rootChanges = null,
  orphanContainerId = DEFAULT_ORPHAN_CONTAINER_ID,
  subdomainContainerId = DEFAULT_SUBDOMAIN_CONTAINER_ID,
}) => {
  const blockReason = getBranchMoveBlockReason({
    root,
    orphans,
    nodeId,
    targetParentId,
    orphanContainerId,
    subdomainContainerId,
  });
  if (blockReason) {
    return { ok: false, error: blockReason, root, orphans };
  }

  const forestIndex = buildMoveForestIndex(root, orphans);
  const sourceMeta = forestIndex.nodes.get(nodeId);
  const targetMeta = forestIndex.nodes.get(targetParentId);
  const nextRoot = cloneValue(root);
  let nextOrphans = cloneValue(Array.isArray(orphans) ? orphans : []);
  const sourceTree = getTreeRootById(sourceMeta.treeRootId, nextRoot, nextOrphans);
  if (!sourceTree) return { ok: false, error: 'Node was not found.', root, orphans };

  const oldParent = sourceTree.id === nodeId ? null : findParent(sourceTree, nodeId);
  const oldIndex = oldParent?.children?.findIndex((child) => child?.id === nodeId) ?? -1;
  let removedNode = null;

  if (sourceTree.id === nodeId) {
    const index = nextOrphans.findIndex((orphan) => orphan?.id === nodeId);
    if (index === -1) return { ok: false, error: 'Node was not found.', root, orphans };
    removedNode = nextOrphans.splice(index, 1)[0] || null;
  } else {
    removedNode = removeFromTree(sourceTree, nodeId);
  }

  if (!removedNode) return { ok: false, error: 'Node was not found.', root, orphans };

  applyRootChanges(removedNode, rootChanges);

  if (nextRoot) purgeNodeFromTree(nextRoot, nodeId);
  nextOrphans = nextOrphans.filter((orphan) => orphan?.id !== nodeId);
  nextOrphans.forEach((orphan) => purgeNodeFromTree(orphan, nodeId));

  const normalizedIndex = normalizeIndex(insertIndex, 0);
  if (targetParentId === orphanContainerId || targetParentId === subdomainContainerId) {
    const isSubdomain = targetParentId === subdomainContainerId;
    const orderedRoots = nextOrphans.filter((orphan) => !!orphan?.subdomainRoot === isSubdomain);
    const rootIds = orderedRoots.map((orphan) => orphan.id);
    const fullIndex = (() => {
      if (rootIds.length === 0) return nextOrphans.length;
      if (normalizedIndex >= rootIds.length) {
        const lastId = rootIds[rootIds.length - 1];
        const lastIndex = nextOrphans.findIndex((orphan) => orphan?.id === lastId);
        return lastIndex === -1 ? nextOrphans.length : lastIndex + 1;
      }
      const targetId = rootIds[normalizedIndex];
      const targetIndex = nextOrphans.findIndex((orphan) => orphan?.id === targetId);
      return targetIndex === -1 ? nextOrphans.length : targetIndex;
    })();

    clearTreeFlags(removedNode);
    applyRootFlags(removedNode, isSubdomain ? 'subdomain' : 'orphan');
    nextOrphans.splice(fullIndex, 0, removedNode);
    return { ok: true, root: nextRoot, orphans: nextOrphans, movedNode: removedNode };
  }

  const targetTree = getTreeRootById(targetMeta.treeRootId, nextRoot, nextOrphans);
  const newParent = targetTree ? findNodeById(targetTree, targetParentId) : null;
  if (!newParent) return { ok: false, error: 'Drop target was not found.', root, orphans };

  let adjustedIndex = normalizedIndex;
  if (sourceMeta.treeRootId === targetMeta.treeRootId && oldParent?.id === targetParentId && oldIndex !== -1) {
    if (oldIndex < normalizedIndex) adjustedIndex = normalizedIndex - 1;
  }

  clearTreeFlags(removedNode);
  if (targetMeta.treeType === 'orphan' || targetMeta.treeType === 'subdomain') {
    applyTreeTypeFlags(removedNode, targetMeta.treeType);
  }

  newParent.children = Array.isArray(newParent.children) ? newParent.children : [];
  newParent.children.splice(adjustedIndex, 0, removedNode);

  return { ok: true, root: nextRoot, orphans: nextOrphans, movedNode: removedNode };
};

module.exports = {
  DEFAULT_ORPHAN_CONTAINER_ID,
  DEFAULT_SUBDOMAIN_CONTAINER_ID,
  applyBranchMoveToMap,
  buildMoveForestIndex,
  branchHasAssignedUrl,
  collectNodeIds,
  findNodeById,
  getBranchMoveBlockReason,
  hasAssignedUrl,
  isDescendantOf,
};
