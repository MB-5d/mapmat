export const LARGE_MAP_NODE_THRESHOLD = 750;

export const countMapNodes = (root, orphans = []) => {
  const seen = new Set();
  let count = 0;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const id = String(node.id || '');
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    count += 1;
    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  visit(root);
  (Array.isArray(orphans) ? orphans : []).forEach(visit);
  return count;
};

export const shouldUseLargeMapSurface = ({
  nodeCount,
  hasSavedMap,
  isLiveActive = false,
  threshold = LARGE_MAP_NODE_THRESHOLD,
} = {}) => (
  Boolean(hasSavedMap)
  && !isLiveActive
  && Number(nodeCount || 0) >= threshold
);
